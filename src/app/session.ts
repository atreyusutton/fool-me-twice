import { ChessCom, mostPlayedTimeClass, type PlayerInfo, type RatingInfo } from "../core/chesscom.ts";
import { MotifError, toMotifError } from "../core/errors.ts";
import type { KV } from "../core/kv.ts";
import { summarizeGame } from "../core/pgn.ts";
import { computeTier1, type Tier1Stats } from "../core/tier1.ts";
import type { GameSummary, RawGame } from "../core/types.ts";
import { openCache } from "./kv-idb.ts";

/** Tier-1 statistics use up to this many games. */
export const TIER1_GAME_LIMIT = 100;

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
    this.update({ phase: "loading", error: null, loadingStep: "Opening the cache", notices: [] });
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

  /** Hook for the engine analysis, which starts once the games are in. */
  protected afterGamesLoaded(): void {}
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
