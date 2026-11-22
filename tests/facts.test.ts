import { describe, expect, it } from "vitest";
import { analysePositions, Engine, engineSettingKey, parseSearchOutput, positionKey, terminalResult, DEFAULT_ENGINE_SETTING } from "../src/core/engine.ts";
import { buildFactTable, CLEAR_LOSS, isKeyMoment, keyMoments, phaseOf, positionsOf, winChance } from "../src/core/facts.ts";
import { MemoryKV } from "../src/core/kv.ts";
import { parseGame } from "../src/core/pgn.ts";
import type { RawGame } from "../src/core/types.ts";
import { createNodeEngineTransport } from "../scripts/node-engine.ts";
import fixture from "./fixtures/antwacky-2026-11-sample.json" with { type: "json" };

const games = fixture.games as RawGame[];

describe("engine output", () => {
  it("reads the last exact score and the best move", () => {
    const result = parseSearchOutput([
      "info depth 11 seldepth 14 score cp 31 nodes 1000 pv e2e4 e7e5",
      "info depth 12 seldepth 16 score cp 44 lowerbound nodes 1500 pv e2e4",
      "info depth 12 seldepth 16 score cp 38 nodes 2000 pv d2d4 d7d5",
      "bestmove d2d4 ponder d7d5",
    ]);
    expect(result).toEqual({ cp: 38, mate: null, best: "d2d4", depth: 12 });
  });
  it("reads mate scores", () => {
    const result = parseSearchOutput(["info depth 12 score mate -2 nodes 10 pv e1f2 d8h4", "bestmove e1f2"]);
    expect(result).toEqual({ cp: null, mate: -2, best: "e1f2", depth: 12 });
  });
  it("refuses output with no score or no move", () => {
    expect(() => parseSearchOutput(["bestmove (none)"])).toThrow(/could not read/);
  });
  it("decides finished positions by the rules, without the engine", () => {
    const mated = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    expect(terminalResult(mated)).toEqual({ cp: null, mate: 0, best: null, depth: 0 });
    expect(terminalResult("8/8/8/8/8/5k2/8/5K2 w - - 0 1")?.cp).toBe(0);
    expect(terminalResult("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBeNull();
  });
  it("keys positions without their move counters", () => {
    expect(positionKey("8/8/8/8/8/5k2/8/5K2 w - - 12 40")).toBe("8/8/8/8/8/5k2/8/5K2 w - -");
  });
});

describe("winning chance and phase", () => {
  it("treats a forced mate as certain", () => {
    expect(winChance({ cp: null, mate: 3, best: "a1a2", depth: 12 })).toBe(100);
    expect(winChance({ cp: null, mate: -1, best: "a1a2", depth: 12 })).toBe(0);
    expect(winChance({ cp: null, mate: 0, best: null, depth: 0 })).toBe(0);
  });
  it("names the phase from the move number and the material left", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(phaseOf(5, start)).toBe("opening");
    expect(phaseOf(15, start)).toBe("middlegame");
    expect(phaseOf(40, "8/5k2/8/8/8/8/3R1K2/8 w - - 0 40")).toBe("endgame");
  });
});

// One real game through the real engine: the same build the browser runs.
describe("fact table for a known game", async () => {
  const game = parseGame(games[2]!, "antwacky"); // Antwacky had Black and resigned.
  const kv = new MemoryKV();
  const engine = new Engine(createNodeEngineTransport(), DEFAULT_ENGINE_SETTING);
  const settingKey = engineSettingKey(DEFAULT_ENGINE_SETTING);
  const positions = positionsOf(game);
  const evals = (await analysePositions(positions, async () => engine, kv, settingKey))!;
  const table = buildFactTable(game, evals, settingKey);

  it("has one row for each of the player's moves, in order", () => {
    const blackMoves = game.moves.filter((move) => move.color === "black");
    expect(table.rows).toHaveLength(blackMoves.length);
    expect(table.rows.map((row) => row.played)).toEqual(blackMoves.map((move) => move.san));
    expect(table.rows.every((row) => row.color === "black")).toBe(true);
    expect(table.winLine).toHaveLength(game.moves.length + 1);
  });

  it("keeps every number within range and consistent", () => {
    for (const row of table.rows) {
      expect(row.winBefore).toBeGreaterThanOrEqual(0);
      expect(row.winBefore).toBeLessThanOrEqual(100);
      expect(row.loss).toBeGreaterThanOrEqual(0);
      expect(row.loss).toBeCloseTo(Math.max(0, row.winBefore - row.winAfter), 5);
      expect(row.clear).toBe(row.loss >= CLEAR_LOSS);
      if (!row.clear) expect(row.patterns.filter((tag) => tag !== "missed_mate" && tag !== "allowed_mate")).toEqual([]);
      if (row.playedBest) expect(row.best).toBe(row.played);
    }
  });

  it("finds the clear mistakes of this game", () => {
    // 8...a6 left the king in the centre when castling was the engine's move, and cost over 20 points.
    const a6 = table.rows.find((row) => row.moveNumber === 8)!;
    expect(a6.played).toBe("a6");
    expect(a6.best).toBe("O-O");
    expect(a6.clear).toBe(true);
    expect(a6.phase).toBe("opening");
    expect(keyMoments(table).every(isKeyMoment)).toBe(true);
    expect(keyMoments(table).map((row) => row.played)).toContain("a6");
  });

  it("answers from the cache the second time, with identical results", async () => {
    let fromCache = 0;
    const again = await analysePositions(
      positions,
      async () => {
        throw new Error("The engine must not be needed for cached positions.");
      },
      kv,
      settingKey,
      (progress) => (fromCache = progress.positionsFromCache),
    );
    expect(again).toEqual(evals);
    expect(fromCache).toBe(positions.length);
  });

  it("stops between positions when asked", async () => {
    const stopped = await analysePositions(positions, async () => engine, new MemoryKV(), settingKey, undefined, () => true);
    expect(stopped).toBeNull();
    engine.terminate();
  });
});
