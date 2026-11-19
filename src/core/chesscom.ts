import { MotifError } from "./errors.ts";
import type { KV } from "./kv.ts";
import type { RawGame } from "./types.ts";

const API = "https://api.chess.com/pub";

export interface PlayerInfo {
  username: string;
  /** Display form of the username, from the profile URL. */
  displayName: string;
  status: string;
  joined: number;
}
export interface RatingInfo {
  timeClass: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}
interface CachedArchive {
  games: RawGame[];
  /** True once the month is over: it can never change, so it is never requested again. */
  final: boolean;
  fetchedAt: number;
}
export interface FetchNotice {
  kind: "rate_limited" | "month";
  message: string;
}

export interface ChessComOptions {
  fetch: typeof fetch;
  kv: KV;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  onNotice?: (notice: FetchNotice) => void;
  /** Extra request headers. Only for scripts: in a browser any custom header forces a preflight request. */
  headers?: Record<string, string>;
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ChessCom {
  private readonly options: ChessComOptions;
  constructor(options: ChessComOptions) {
    this.options = options;
  }

  private async getJson<T>(url: string, what: string, revalidate = false): Promise<T> {
    const wait = this.options.wait ?? defaultWait;
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response: Response;
      try {
        // "no-cache" makes the browser re-check its stored copy with the ETag the API sent
        // (an If-None-Match request) without a custom header, which would need a preflight.
        const init: RequestInit = {};
        if (this.options.headers) init.headers = this.options.headers;
        if (revalidate) init.cache = "no-cache";
        response = await this.options.fetch(url, init);
      } catch (error) {
        throw new MotifError("network", `Could not reach Chess.com while loading ${what}.`, { cause: error });
      }
      if (response.status === 429) {
        if (attempt === maxAttempts) {
          throw new MotifError("rate_limited", "Chess.com is limiting requests right now.");
        }
        const seconds = 2 ** attempt;
        this.options.onNotice?.({
          kind: "rate_limited",
          message: `Chess.com asked us to slow down. Trying again in ${seconds} seconds.`,
        });
        await wait(seconds * 1000);
        continue;
      }
      if (response.status === 404) throw new MotifError("not_found", `Chess.com has no ${what}.`);
      if (!response.ok) throw new MotifError("api", `Chess.com returned an error (${response.status}) for ${what}.`);
      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new MotifError("api", `Chess.com sent a reply for ${what} that could not be read.`, { cause: error });
      }
    }
    throw new MotifError("rate_limited", "Chess.com is limiting requests right now.");
  }

  /** Looks the player up and refuses closed accounts: some are closed for fair-play violations. */
  async getPlayer(username: string): Promise<PlayerInfo> {
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,50}$/.test(clean)) {
      throw new MotifError("not_found", "That does not look like a Chess.com username.");
    }
    const data = await this.getJson<{ username: string; url?: string; status: string; joined: number }>(
      `${API}/player/${clean}`,
      `player called "${username.trim()}"`,
    );
    if (data.status.startsWith("closed")) {
      throw new MotifError("closed", "This account is closed, so Motif will not coach from its games.");
    }
    const displayName = data.url?.split("/member/")[1] ?? data.username;
    return { username: data.username, displayName, status: data.status, joined: data.joined };
  }

  async getRatings(username: string): Promise<RatingInfo[]> {
    type Stats = Record<string, { last?: { rating: number }; record?: { win: number; loss: number; draw: number } }>;
    const data = await this.getJson<Stats>(`${API}/player/${username}/stats`, "ratings for this player");
    const ratings: RatingInfo[] = [];
    for (const timeClass of ["rapid", "blitz", "bullet", "daily"]) {
      const entry = data[`chess_${timeClass}`];
      if (entry?.last && entry.record) {
        ratings.push({
          timeClass,
          rating: entry.last.rating,
          wins: entry.record.win,
          losses: entry.record.loss,
          draws: entry.record.draw,
        });
      }
    }
    return ratings;
  }

  /** Monthly archive URLs, oldest first, as the API lists them. */
  async getArchiveList(username: string): Promise<string[]> {
    const data = await this.getJson<{ archives: string[] }>(
      `${API}/player/${username}/games/archives`,
      "game history for this player",
      true,
    );
    return data.archives;
  }

  /** One month of games. A finished month is stored for good; the current month is re-checked. */
  async getMonth(archiveUrl: string): Promise<{ games: RawGame[]; fromCache: boolean }> {
    const match = /\/player\/([^/]+)\/games\/(\d{4})\/(\d{2})$/.exec(archiveUrl);
    if (!match) throw new MotifError("api", "Chess.com listed a month of games in a form Motif does not know.");
    const key = `${match[1]}/${match[2]}-${match[3]}`;
    const cached = await this.options.kv.get<CachedArchive>("archives", key);
    if (cached?.final) return { games: cached.games, fromCache: true };

    const now = new Date((this.options.now ?? Date.now)());
    const monthIsOver =
      Number(match[2]) < now.getUTCFullYear() ||
      (Number(match[2]) === now.getUTCFullYear() && Number(match[3]) < now.getUTCMonth() + 1);
    try {
      const data = await this.getJson<{ games: RawGame[] }>(archiveUrl, "games for that month", !monthIsOver);
      await this.options.kv.set<CachedArchive>("archives", key, {
        games: data.games,
        final: monthIsOver,
        fetchedAt: now.getTime(),
      });
      return { games: data.games, fromCache: false };
    } catch (error) {
      // Offline or rate-limited with an older copy of the current month: better to show that than nothing.
      if (cached && error instanceof MotifError && (error.kind === "network" || error.kind === "rate_limited")) {
        this.options.onNotice?.({
          kind: "month",
          message: "Could not check Chess.com for new games, so this is the copy saved earlier.",
        });
        return { games: cached.games, fromCache: true };
      }
      throw error;
    }
  }

  /**
   * The player's latest standard games, newest first. Months are requested one at a time, newest first,
   * and the walk stops as soon as `limit` games of the wanted time class are in hand.
   */
  async getRecentGames(
    username: string,
    wanted: { timeClass: string | null; limit: number },
  ): Promise<{ games: RawGame[]; monthsRequested: number; monthsFromCache: number }> {
    const archives = await this.getArchiveList(username);
    const games: RawGame[] = [];
    let monthsRequested = 0;
    let monthsFromCache = 0;
    for (const archiveUrl of [...archives].reverse()) {
      const month = await this.getMonth(archiveUrl);
      monthsRequested++;
      if (month.fromCache) monthsFromCache++;
      const usable = month.games
        .filter((game) => game.rules === "chess" && game.pgn)
        .filter((game) => wanted.timeClass === null || game.time_class === wanted.timeClass)
        .sort((a, b) => b.end_time - a.end_time);
      games.push(...usable);
      if (games.length >= wanted.limit) break;
      // With no time class chosen yet, one recent month is enough to pick the most played one.
      if (wanted.timeClass === null && games.length > 0 && monthsRequested >= 2) break;
    }
    return { games: games.slice(0, wanted.limit), monthsRequested, monthsFromCache };
  }
}

/** The time class the player plays most in the given games. */
export function mostPlayedTimeClass(games: RawGame[]): string | null {
  const counts = new Map<string, number>();
  for (const game of games) counts.set(game.time_class, (counts.get(game.time_class) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [timeClass, count] of counts) {
    if (count > bestCount) {
      best = timeClass;
      bestCount = count;
    }
  }
  return best;
}
