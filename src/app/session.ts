import { ChessCom, mostPlayedTimeClass, type PlayerInfo, type RatingInfo } from "../core/chesscom.ts";
import { analysePositions, DEFAULT_ENGINE_SETTING, engineSettingKey } from "../core/engine.ts";
import { MotifError, toMotifError } from "../core/errors.ts";
import { buildFactTable, FACTS_VERSION, positionsOf } from "../core/facts.ts";
import type { KV } from "../core/kv.ts";
import { parseGame, summarizeGame } from "../core/pgn.ts";
import { buildProfile, type Profile } from "../core/profile.ts";
import { computeTier1, type Tier1Stats } from "../core/tier1.ts";
import type { FactTable, GameSummary, ParsedGame, RawGame } from "../core/types.ts";
import { engineCount, getBrowserEngine, resetBrowserEngines } from "./browser-engine.ts";
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
    this.update({ phase: "loading", error: null, loadingStep: "Opening the cache", notices: [], engine: IDLE_ENGINE, facts: {}, profile: null });
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

  /** Fact tables of the analysed games, newest game first. */
  analysedTables(): FactTable[] {
    const state = this.getState();
    return state.games.map((game) => state.facts[game.uuid]).filter((table): table is FactTable => table !== undefined);
  }

  /** The profile is rebuilt from scratch each time a game's facts arrive: it is only counting, so it is cheap. */
  protected afterGameAnalysed(): void {
    this.update({ profile: buildProfile(this.analysedTables(), this.getState().tier1) });
  }
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
