import { describe, expect, it } from "vitest";
import { ChessCom, mostPlayedTimeClass } from "../src/core/chesscom.ts";
import { MotifError } from "../src/core/errors.ts";
import { MemoryKV } from "../src/core/kv.ts";
import type { RawGame } from "../src/core/types.ts";
import fixture from "./fixtures/antwacky-2026-11-sample.json" with { type: "json" };

const games = fixture.games as RawGame[];
const NOW = Date.UTC(2026, 10, 19); // 19 November 2026

/** A stand-in for Chess.com that records every request. */
function fakeApi(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    return route ? route() : new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls };
}
const json = (body: unknown) => () => Response.json(body);
const base = "https://api.chess.com/pub/player/antwacky";

describe("Chess.com fetch layer", () => {
  it("refuses closed accounts and unknown players with clear errors", async () => {
    const { fetchFn } = fakeApi({
      "https://api.chess.com/pub/player/cheater": json({ username: "cheater", status: "closed:fair_play_violations", joined: 1 }),
    });
    const api = new ChessCom({ fetch: fetchFn, kv: new MemoryKV(), now: () => NOW });
    await expect(api.getPlayer("cheater")).rejects.toMatchObject({ kind: "closed" });
    await expect(api.getPlayer("nobody")).rejects.toMatchObject({ kind: "not_found" });
    await expect(api.getPlayer("not a name!")).rejects.toBeInstanceOf(MotifError);
  });

  it("stores a finished month for good and re-checks only the current month", async () => {
    const { fetchFn, calls } = fakeApi({
      [`${base}/games/archives`]: json({ archives: [`${base}/games/2026/10`, `${base}/games/2026/11`] }),
      [`${base}/games/2026/10`]: json({ games: [games[0]] }),
      [`${base}/games/2026/11`]: json({ games: [games[1], games[2]] }),
    });
    const api = new ChessCom({ fetch: fetchFn, kv: new MemoryKV(), now: () => NOW });
    const first = await api.getRecentGames("antwacky", { timeClass: "rapid", limit: 3 });
    expect(first.games).toHaveLength(3);
    expect(first.monthsFromCache).toBe(0);
    // Newest first across months.
    expect(first.games[0]!.end_time).toBeGreaterThanOrEqual(first.games[1]!.end_time);

    calls.length = 0;
    const second = await api.getRecentGames("antwacky", { timeClass: "rapid", limit: 3 });
    expect(second.games).toHaveLength(3);
    expect(second.monthsFromCache).toBe(1);
    expect(calls).toContain(`${base}/games/2026/11`);
    expect(calls).not.toContain(`${base}/games/2026/10`);
  });

  it("stops asking for months once it has enough games", async () => {
    const { fetchFn, calls } = fakeApi({
      [`${base}/games/archives`]: json({ archives: [`${base}/games/2026/10`, `${base}/games/2026/11`] }),
      [`${base}/games/2026/11`]: json({ games: [games[1], games[2]] }),
    });
    const api = new ChessCom({ fetch: fetchFn, kv: new MemoryKV(), now: () => NOW });
    const result = await api.getRecentGames("antwacky", { timeClass: "rapid", limit: 2 });
    expect(result.games).toHaveLength(2);
    expect(calls).not.toContain(`${base}/games/2026/10`);
  });

  it("waits and retries when rate-limited, and tells the player", async () => {
    let attempts = 0;
    const { fetchFn } = fakeApi({
      [`${base}/stats`]: () => {
        attempts++;
        return attempts < 3
          ? new Response("slow down", { status: 429 })
          : Response.json({ chess_rapid: { last: { rating: 815 }, record: { win: 1, loss: 2, draw: 3 } } });
      },
    });
    const notices: string[] = [];
    const waits: number[] = [];
    const api = new ChessCom({
      fetch: fetchFn,
      kv: new MemoryKV(),
      now: () => NOW,
      wait: async (ms) => void waits.push(ms),
      onNotice: (notice) => notices.push(notice.message),
    });
    const ratings = await api.getRatings("antwacky");
    expect(ratings).toEqual([{ timeClass: "rapid", rating: 815, wins: 1, losses: 2, draws: 3 }]);
    expect(waits).toEqual([2000, 4000]);
    expect(notices).toHaveLength(2);
  });

  it("falls back to the saved copy of the current month when offline", async () => {
    let online = true;
    const fetchFn = (async (input: RequestInfo | URL) => {
      if (!online) throw new TypeError("Failed to fetch");
      return String(input).endsWith("/2026/11") ? Response.json({ games }) : new Response("{}", { status: 404 });
    }) as typeof fetch;
    const notices: string[] = [];
    const api = new ChessCom({ fetch: fetchFn, kv: new MemoryKV(), now: () => NOW, onNotice: (n) => notices.push(n.message) });
    await api.getMonth(`${base}/games/2026/11`);
    online = false;
    const month = await api.getMonth(`${base}/games/2026/11`);
    expect(month.fromCache).toBe(true);
    expect(month.games).toHaveLength(3);
    expect(notices[0]).toMatch(/saved earlier/);
  });

  it("picks the most played time class", () => {
    expect(mostPlayedTimeClass(games)).toBe("rapid");
    expect(mostPlayedTimeClass([])).toBeNull();
  });
});
