import { ChessCom, mostPlayedTimeClass, type PlayerInfo, type RatingInfo } from "../core/chesscom.ts";
import { coachCacheKey } from "../core/coach/hash.ts";
import type { CoachId } from "../core/coach/personas.ts";
import { PROMPT_VERSION } from "../core/coach/prompt.ts";
import { gameReviewRequest, profileSummaryRequest } from "../core/coach/request.ts";
import { codeBuiltResult } from "../core/coach/run.ts";
import { gameReviewToWire, profileSummaryToWire } from "../core/coach/schema.ts";
import type { CoachRequest, CoachResult, GameReview, ProfileSummary } from "../core/coach/types.ts";
import { validateReply } from "../core/coach/validator.ts";
import { DEMO_GAME_COUNT, DEMO_RECORDING_PATH, needsModel, type DemoRecording } from "../core/demo.ts";
import { analysePositions, DEFAULT_ENGINE_SETTING, engineSettingKey } from "../core/engine.ts";
import { MotifError, toMotifError } from "../core/errors.ts";
import { buildFactTable, FACTS_VERSION, positionsOf } from "../core/facts.ts";
import { LayeredKV, MemoryKV, type KV } from "../core/kv.ts";
import { parseGame, summarizeGame } from "../core/pgn.ts";
import { buildProfile, type Profile } from "../core/profile.ts";
import { computeTier1, type Tier1Stats } from "../core/tier1.ts";
import type { FactTable, GameSummary, ParsedGame, RawGame } from "../core/types.ts";
import { engineCount, getBrowserEngine, resetBrowserEngines } from "./browser-engine.ts";
import { getCoach } from "./coach-choice.ts";
import { openCache } from "./kv-idb.ts";

/** Tier-1 statistics use up to this many games. */
export const TIER1_GAME_LIMIT = 100;

/** Engine analysis starts with this many games and can be extended. */
export const ENGINE_GAME_STEPS = [25, 50, 100];

export interface EngineProgress {
  status: "idle" | "running" | "done" | "failed";
  error: MotifError | null;
  /** How many of the latest games are to be analysed. */
  target: number;
  gamesDone: number;
  /** Positions across all the games of this run: done so far, and in total. */
  positionsDone: number;
  positionsTotal: number;
  /** Positions answered by the engine, and positions answered from the cache. */
  searched: number;
  fromCache: number;
  /** Games whose whole fact table came from the cache. */
  gamesFromCache: number;
  /** Games being analysed right now (one per engine). */
  activeGameIds: string[];
  /** Engines running side by side. */
  engines: number;
  startedAt: number | null;
  finishedAt: number | null;
}

const IDLE_ENGINE: EngineProgress = {
  status: "idle",
  error: null,
  target: ENGINE_GAME_STEPS[0]!,
  gamesDone: 0,
  positionsDone: 0,
  positionsTotal: 0,
  searched: 0,
  fromCache: 0,
  gamesFromCache: 0,
  activeGameIds: [],
  engines: 1,
  startedAt: null,
  finishedAt: null,
};

/** The coach's words for the profile ("profile") or for one game (its uuid). */
export interface CoachEntry {
  status: "loading" | "ready";
  /** The exact request the text was written for. The screen renders tokens against this, never against newer data. */
  request: CoachRequest;
  /** For a game: which real fact row each local fact ID stands for. */
  factIds: Record<string, string>;
  result: CoachResult;
  /** True when the reply came from this device's cache (or the recorded demo) and cost nothing. */
  fromCache: boolean;
  /** Why the model was not used, when it was not. */
  note: string | null;
}

export interface CoachStatus {
  /** Null until the Worker has been asked. */
  available: boolean | null;
  model: string | null;
}

export interface SessionState {
  username: string;
  demo: boolean;
  phase: "loading" | "ready" | "error";
  /** What is being loaded right now, in words for the player. */
  loadingStep: string;
  error: MotifError | null;
  player: PlayerInfo | null;
  ratings: RatingInfo[];
  timeClass: string | null;
  timeClasses: string[];
  /** Newest first, at most TIER1_GAME_LIMIT. */
  games: GameSummary[];
  tier1: Tier1Stats | null;
  notices: string[];
  cachePersistent: boolean;
  fetchInfo: { monthsRequested: number; monthsFromCache: number } | null;
  engine: EngineProgress;
  /** Fact tables by game, filled in as each game finishes. */
  facts: Record<string, FactTable>;
  /** Themes across the games analysed so far. Rebuilt each time a game finishes. */
  profile: Profile | null;
  coachStatus: CoachStatus;
  coach: Record<string, CoachEntry>;
  /** Set in the recorded demo: when it was recorded and with which model. */
  recording: { recordedAt: string; model: string } | null;
}

type Listener = () => void;

/** Everything Motif knows about one player during a visit. The screens read it; nothing here draws. */
export class PlayerSession {
  private state: SessionState;
  private readonly listeners = new Set<Listener>();
  protected kv: KV | null = null;
  protected api: ChessCom | null = null;
  protected rawGames = new Map<string, RawGame>();
  private loadToken = 0;

  constructor(username: string, demo: boolean) {
    this.state = {
      username,
      demo,
      phase: "loading",
      loadingStep: "Opening the cache",
      error: null,
      player: null,
      ratings: [],
      timeClass: null,
      timeClasses: [],
      games: [],
      tier1: null,
      notices: [],
      cachePersistent: true,
      fetchInfo: null,
      engine: IDLE_ENGINE,
      facts: {},
      profile: null,
      coachStatus: { available: null, model: null },
      coach: {},
      recording: null,
    };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = (): SessionState => this.state;

  protected update(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  protected addNotice(message: string): void {
    if (this.state.notices.includes(message)) return;
    this.update({ notices: [...this.state.notices, message] });
  }

  /** Loads the player and their games. Safe to call again to retry, or with a new time class. */
  async load(timeClass: string | null = this.state.timeClass): Promise<void> {
    const token = ++this.loadToken;
    const stale = () => token !== this.loadToken;
    this.analysisToken++;
    this.update({ phase: "loading", error: null, loadingStep: "Opening the cache", notices: [], engine: IDLE_ENGINE, facts: {}, profile: null, coach: {} });
    this.coachWanted.clear();
    this.coachInFlight.clear();
    if (this.state.demo) {
      try {
        await this.loadRecording();
        if (stale()) return;
        this.afterGamesLoaded();
      } catch (error) {
        if (stale()) return;
        this.update({ phase: "error", error: toMotifError(error) });
      }
      return;
    }
    try {
      if (!this.kv) {
        const opened = await openCache();
        this.kv = opened.kv;
        this.update({ cachePersistent: opened.persistent });
      }
      this.api ??= new ChessCom({
        fetch: (input, init) => fetch(input, init),
        kv: this.kv,
        onNotice: (notice) => this.addNotice(notice.message),
      });
      const api = this.api;

      this.update({ loadingStep: "Finding the player on Chess.com" });
      const player = this.state.player ?? (await api.getPlayer(this.state.username));
      if (stale()) return;
      this.update({ player, loadingStep: "Reading ratings" });
      const ratings = this.state.ratings.length > 0 ? this.state.ratings : await api.getRatings(player.username);
      if (stale()) return;
      this.update({ ratings });

      let chosen = timeClass;
      if (!chosen) {
        this.update({ loadingStep: "Looking at recent games" });
        const sample = await api.getRecentGames(player.username, { timeClass: null, limit: 200 });
        if (stale()) return;
        chosen = mostPlayedTimeClass(sample.games);
        if (!chosen) throw new MotifError("no_games", "This player has no standard chess games on Chess.com yet.");
        const classes = new Set(sample.games.map((game) => game.time_class));
        for (const rating of ratings) classes.add(rating.timeClass);
        this.update({ timeClasses: [...classes].filter((name) => name !== "daily") });
      }

      this.update({ timeClass: chosen, loadingStep: `Collecting the latest ${chosen} games` });
      const recent = await api.getRecentGames(player.username, { timeClass: chosen, limit: TIER1_GAME_LIMIT });
      if (stale()) return;
      if (recent.games.length === 0) {
        throw new MotifError("no_games", `This player has no ${chosen} games on Chess.com yet.`);
      }
      this.rawGames = new Map(recent.games.map((game) => [game.uuid, game]));
      const games = recent.games
        .map((game) => summarizeGame(game, player.username))
        .filter((summary): summary is GameSummary => summary !== null);
      this.update({
        games,
        tier1: computeTier1(games),
        fetchInfo: { monthsRequested: recent.monthsRequested, monthsFromCache: recent.monthsFromCache },
        phase: "ready",
      });
      this.afterGamesLoaded();
    } catch (error) {
      if (stale()) return;
      this.update({ phase: "error", error: toMotifError(error) });
    }
  }

  /**
   * The recorded demo: one file holds the games, the engine's results, the fact tables and the coach's
   * checked replies. Nothing is fetched from Chess.com, no engine starts and no model is called.
   */
  private async loadRecording(): Promise<void> {
    this.update({ loadingStep: "Opening the recorded demo" });
    let recording: DemoRecording;
    try {
      const response = await fetch(DEMO_RECORDING_PATH);
      if (!response.ok) throw new Error(`status ${response.status}`);
      recording = (await response.json()) as DemoRecording;
    } catch (error) {
      throw new MotifError("api", "The recorded demo could not be loaded.", { cause: error });
    }
    if (recording.version !== 1 || !Array.isArray(recording.games)) {
      throw new MotifError("api", "The recorded demo is in a form this version of Motif does not know.");
    }
    const recorded = new MemoryKV();
    for (const [key, value] of recording.engine) await recorded.set("engine", key, value);
    for (const [key, value] of recording.facts) await recorded.set("facts", key, value);
    for (const [key, value] of recording.coach) await recorded.set("coach", key, value);
    // The demo never writes to this device's cache; anything new stays in memory for the visit.
    this.kv = new LayeredKV(recorded, new MemoryKV());
    this.rawGames = new Map(recording.games.map((game) => [game.uuid, game]));
    const analysed = recording.games
      .map((game) => summarizeGame(game, recording.player.username))
      .filter((summary): summary is GameSummary => summary !== null);
    const games = [...analysed, ...recording.olderGames];
    this.update({
      player: recording.player,
      ratings: recording.ratings,
      timeClass: recording.timeClass,
      timeClasses: [recording.timeClass],
      games,
      tier1: computeTier1(games),
      fetchInfo: null,
      recording: { recordedAt: recording.recordedAt, model: recording.model },
      coachStatus: { available: false, model: recording.model },
      phase: "ready",
    });
  }

  private analysisToken = 0;
  private parsed = new Map<string, ParsedGame>();
  readonly engineSetting = DEFAULT_ENGINE_SETTING;

  protected afterGamesLoaded(): void {
    void this.analyse(this.getState().engine.target);
  }

  /** A game replayed move by move, for the review screen. Null if this session does not hold it. */
  getGame(gameId: string): ParsedGame | null {
    const cached = this.parsed.get(gameId);
    if (cached) return cached;
    const raw = this.rawGames.get(gameId);
    const player = this.getState().player;
    if (!raw || !player) return null;
    const game = parseGame(raw, player.username);
    this.parsed.set(gameId, game);
    return game;
  }

  private patchEngine(patch: Partial<EngineProgress>): void {
    this.update({ engine: { ...this.getState().engine, ...patch } });
  }

  /**
   * Analyses the latest `target` games, newest first, in the background. Each finished game is published
   * at once, so the player can open it while the rest continue. Safe to call again to extend or retry.
   */
  async analyse(target: number): Promise<void> {
    // The recorded demo holds a fixed set of analysed games and never starts an engine.
    if (this.getState().demo) target = Math.min(target, DEMO_GAME_COUNT);
    const kv = this.kv;
    if (!kv || this.getState().phase !== "ready") return;
    const token = ++this.analysisToken;
    const stale = () => token !== this.analysisToken;
    const games = this.getState().games.slice(0, target);
    const settingKey = engineSettingKey(this.engineSetting);
    const queue = games.filter((game) => !this.getState().facts[game.uuid]);
    const workers = Math.min(engineCount(), Math.max(1, queue.length));

    // Counters live here and are copied into the state a few times a second:
    // repainting on every position would slow the analysis itself.
    const counters = { positionsDone: 0, searched: 0, fromCache: 0, gamesDone: games.length - queue.length, gamesFromCache: 0 };
    const active = new Set<string>();
    let lastPaint = 0;
    const paint = (force = false) => {
      const now = performance.now();
      if (!force && now - lastPaint < 200) return;
      lastPaint = now;
      this.patchEngine({ ...counters, activeGameIds: [...active] });
    };

    this.patchEngine({
      ...IDLE_ENGINE,
      status: "running",
      target,
      engines: workers,
      gamesDone: counters.gamesDone,
      positionsTotal: queue.reduce((sum, game) => sum + game.plies + 1, 0),
      startedAt: Date.now(),
    });

    const analyseOne = async (summary: GameSummary, slot: number): Promise<void> => {
      const factsKey = `${summary.uuid}|${settingKey}|f${FACTS_VERSION}`;
      let table = await kv.get<FactTable>("facts", factsKey);
      if (table) {
        counters.gamesFromCache++;
        counters.positionsDone += summary.plies + 1;
        counters.fromCache += summary.plies + 1;
      } else {
        const game = this.getGame(summary.uuid);
        if (!game) return;
        active.add(summary.uuid);
        let seenDone = 0;
        let seenCached = 0;
        const evals = await analysePositions(
          positionsOf(game),
          () => getBrowserEngine(this.engineSetting, slot),
          kv,
          settingKey,
          (progress) => {
            counters.positionsDone += progress.positionsDone - seenDone;
            counters.fromCache += progress.positionsFromCache - seenCached;
            counters.searched += progress.positionsDone - seenDone - (progress.positionsFromCache - seenCached);
            seenDone = progress.positionsDone;
            seenCached = progress.positionsFromCache;
            if (!stale()) paint();
          },
          stale,
        );
        active.delete(summary.uuid);
        if (!evals || stale()) return;
        table = buildFactTable(game, evals, settingKey);
        await kv.set("facts", factsKey, table);
      }
      if (stale()) return;
      counters.gamesDone++;
      this.update({ facts: { ...this.getState().facts, [summary.uuid]: table } });
      paint(true);
      this.afterGameAnalysed();
    };

    try {
      // Each engine takes the next game from the front of the queue, so the newest games finish first.
      let next = 0;
      await Promise.all(
        Array.from({ length: workers }, async (_, slot) => {
          while (!stale()) {
            const summary = queue[next++];
            if (!summary) return;
            await analyseOne(summary, slot);
          }
        }),
      );
      if (stale()) return;
      this.patchEngine({ ...counters, status: "done", activeGameIds: [], finishedAt: Date.now() });
      this.afterGameAnalysed();
    } catch (error) {
      if (stale()) return;
      // Stop the other engines too: this run is over, and a retry starts clean.
      this.analysisToken++;
      resetBrowserEngines();
      this.patchEngine({ ...counters, status: "failed", error: toMotifError(error, "engine"), activeGameIds: [] });
    }
  }

  private coachWanted = new Set<string>();
  private coachInFlight = new Map<string, string>();
  private healthCheck: Promise<CoachStatus> | null = null;

  /** Asks the Worker once whether a model is configured. No key, or no Worker, means code-built text. */
  private checkCoach(): Promise<CoachStatus> {
    this.healthCheck ??= (async () => {
      let status: CoachStatus = { available: false, model: null };
      try {
        const response = await fetch("/api/health");
        if (response.ok) {
          const body = (await response.json()) as { coach?: boolean; model?: string };
          status = { available: body.coach === true, model: body.model ?? null };
        }
      } catch (error) {
        console.warn("Fool Me Twice: the coach service could not be reached; using text built by code.", error);
      }
      this.update({ coachStatus: status });
      return status;
    })();
    return this.healthCheck;
  }

  private buildCoachRequest(key: string, coach: CoachId): { request: CoachRequest; factIds: Record<string, string> } | null {
    const state = this.getState();
    if (!state.profile) return null;
    if (key === "profile") {
      const rating = state.games[0]?.playerRating;
      const request = profileSummaryRequest(state.profile, rating, coach);
      return request.profile.themes.length > 0 ? { request, factIds: {} } : null;
    }
    const table = state.facts[key];
    const summary = state.games.find((game) => game.uuid === key);
    if (!table || !summary) return null;
    return gameReviewRequest(summary, table, state.profile, coach);
  }

  /**
   * Asks for the coach's words for the profile or one game. Nothing is requested until the engine has
   * finished, because the profile (part of every request) keeps changing until then.
   */
  ensureCoach(key: string, coach: CoachId = getCoach()): void {
    const slot = coachSlot(coach, key);
    this.coachWanted.add(slot);
    if (this.getState().engine.status === "done") void this.loadCoach(slot);
  }

  /** `slot` is the coach and the subject together, so each character's words are kept apart. */
  private async loadCoach(slot: string): Promise<void> {
    const kv = this.kv;
    const [coach, key] = splitSlot(slot);
    const built = this.buildCoachRequest(key, coach);
    if (!kv || !built) return;
    const { request, factIds } = built;
    const recording = this.getState().recording;
    // In the demo the model is the one that was recorded, and nothing is asked of the Worker.
    const status: CoachStatus = recording ? { available: false, model: recording.model } : await this.checkCoach();
    const model = status.model ?? "claude-sonnet-5-5";
    const hash = await coachCacheKey(PROMPT_VERSION, model, request);
    // The same request is already shown or on its way.
    if (this.coachInFlight.get(slot) === hash) return;
    this.coachInFlight.set(slot, hash);
    const current = () => this.coachInFlight.get(slot) === hash;
    const publish = (result: CoachResult, fromCache: boolean, note: string | null, loading = false) => {
      if (!current()) return;
      this.update({ coach: { ...this.getState().coach, [slot]: { status: loading ? "loading" : "ready", request, factIds, result, fromCache, note } } });
    };
    // Whatever is cached or returned is checked again here: nothing unchecked reaches the screen.
    const passes = (result: CoachResult): boolean => {
      const wire = request.kind === "game" ? gameReviewToWire(result.reply as GameReview) : profileSummaryToWire(result.reply as ProfileSummary);
      return validateReply(request, wire).ok;
    };

    try {
      const cached = await kv.get<CoachResult>("coach", hash);
      if (cached && passes(cached)) return publish(cached, true, null);
      if (!needsModel(request)) {
        return publish(codeBuiltResult(request, "code_no_model"), false, "No clear mistakes to explain, so the language model was not asked. This note was built by code.");
      }
      if (recording) {
        return publish(codeBuiltResult(request, "code_no_model"), false, "The recorded demo has no checked reply for this, so this text was built by code from the engine facts.");
      }
      if (!status.available) {
        return publish(codeBuiltResult(request, "code_no_model"), false, "No language model is configured, so this text was built by code from the engine facts.");
      }
      publish(codeBuiltResult(request, "code_no_model"), false, "The coach is writing. Until it is checked, this is text built by code.", true);
      const response = await fetch("/api/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new MotifError("coach", body?.message ?? `The coach service returned an error (${response.status}).`);
      }
      const result = (await response.json()) as CoachResult;
      if (!passes(result)) {
        return publish(codeBuiltResult(request, "code", result.attempts, result.model), false, "The coach's reply did not pass the check on this device, so this text was built by code.");
      }
      await kv.set("coach", hash, result);
      publish(result, false, null);
    } catch (error) {
      const reason = toMotifError(error, "coach").message;
      publish(codeBuiltResult(request, "code_no_model"), false, `${reason} This text was built by code from the engine facts instead.`);
      // Let a later visit to this screen try the model again.
      if (current()) this.coachInFlight.delete(slot);
    }
  }

  /** Fact tables of the analysed games, newest game first. */
  analysedTables(): FactTable[] {
    const state = this.getState();
    return state.games.map((game) => state.facts[game.uuid]).filter((table): table is FactTable => table !== undefined);
  }

  /** The profile is rebuilt from scratch each time a game's facts arrive: it is only counting, so it is cheap. */
  protected afterGameAnalysed(): void {
    this.update({ profile: buildProfile(this.analysedTables(), this.getState().tier1) });
    // Once the last game is in, the profile is settled and the coach can be asked for what is on screen.
    if (this.getState().engine.status === "done") {
      for (const key of this.coachWanted) void this.loadCoach(key);
    }
  }
}

/** The key under which one coach's words about one subject ("profile" or a game) are kept. */
export function coachSlot(coach: CoachId, key: string): string {
  return `${coach}|${key}`;
}
function splitSlot(slot: string): [CoachId, string] {
  const at = slot.indexOf("|");
  return [slot.slice(0, at) as CoachId, slot.slice(at + 1)];
}

const sessions = new Map<string, PlayerSession>();

/** One session per player per visit, so moving between the profile and a game keeps the work done. */
export function getSession(username: string, demo: boolean): PlayerSession {
  const key = `${demo ? "demo" : "live"}:${username.toLowerCase()}`;
  let session = sessions.get(key);
  if (!session) {
    session = new PlayerSession(username.toLowerCase(), demo);
    sessions.set(key, session);
    void session.load();
  }
  return session;
}
