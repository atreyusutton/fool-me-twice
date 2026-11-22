import { describe, expect, it } from "vitest";
import { terminalResult } from "../src/core/engine.ts";
import { buildPuzzles, judgeAttempt, playMove, practiceQueue, PUZZLE_TOLERANCE, recordResult, type Puzzle } from "../src/core/puzzles.ts";
import type { EngineResult, FactRow, FactTable } from "../src/core/types.ts";

// White to move; Qxf7 is mate (the scholar's mate position).
const MATE_FEN = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

function row(patch: Partial<FactRow>): FactRow {
  return {
    id: "g1:7", gameId: "g1", ply: 7, moveNumber: 4, color: "white", played: "Nf3", best: "Qxf7#", playedBest: false,
    winBefore: 100, winAfter: 55, loss: 45, phase: "opening", clockLeft: null, timeSpent: null, clear: true,
    patterns: ["missed_mate"], strengths: [], pieces: ["queen", "knight"], lostPiece: null,
    fenBefore: MATE_FEN, fenAfter: "", playedUci: "g1f3", bestUci: "h5f7",
    ...patch,
  };
}
const table = (rows: FactRow[]): FactTable => ({ gameId: "g1", engineSetting: "test", factsVersion: "1", rows, winLine: [] });
const cp = (value: number): EngineResult => ({ cp: value, mate: null, best: "a7a6", depth: 14 });

describe("puzzles: built from fact rows", () => {
  it("takes only clear mistakes that have an engine move, costliest first", () => {
    const puzzles = buildPuzzles([
      table([
        row({ id: "g1:7", loss: 45 }),
        row({ id: "g1:9", loss: 80, patterns: ["hung_piece"] }),
        row({ id: "g1:11", clear: false, loss: 12 }),
        row({ id: "g1:13", best: null, bestUci: null }),
        row({ id: "g1:15", playedBest: true, loss: 0 }),
      ]),
    ]);
    expect(puzzles.map((puzzle) => puzzle.id)).toEqual(["g1:9", "g1:7"]);
    expect(puzzles[1]).toMatchObject({ fen: MATE_FEN, answerUci: "h5f7", answerSan: "Qxf7#", playedSan: "Nf3" });
  });
  it("every answer is a legal move in its position", () => {
    for (const puzzle of buildPuzzles([table([row({})])])) expect(playMove(puzzle.fen, puzzle.answerUci)).not.toBeNull();
  });
});

describe("puzzles: playing a move", () => {
  it("returns the new position and the move's name, or null for an illegal move", () => {
    expect(playMove(MATE_FEN, "h5f7")?.san).toBe("Qxf7#");
    expect(playMove(MATE_FEN, "h5h8")).toBeNull();
    expect(playMove("8/P7/8/8/8/8/8/k1K5 w - - 0 1", "a7a8q")?.san).toBe("a8=Q#");
    expect(playMove("8/P7/8/8/8/8/8/k1K5 w - - 0 1", "a7a8n")?.san).toBe("a8=N");
  });
});

describe("puzzles: judging an attempt", () => {
  const puzzle: Puzzle = buildPuzzles([table([row({ winBefore: 80, loss: 45 })])])[0]!;
  it("accepts the engine's move without asking the engine", () => {
    expect(judgeAttempt(puzzle, "h5f7", null)).toEqual({ kind: "best" });
  });
  it("rejects the move from the game without asking the engine", () => {
    expect(judgeAttempt(puzzle, "g1f3", null)).toEqual({ kind: "wrong", loss: 45, sameAsGame: true });
  });
  it("accepts another move only when the engine says it keeps the winning chance", () => {
    // The result is for the opponent to move: bad for them is good for the player.
    const kept = judgeAttempt(puzzle, "d2d3", cp(-400));
    expect(kept.kind).toBe("good");
    const lost = judgeAttempt(puzzle, "d2d3", cp(0));
    expect(lost).toMatchObject({ kind: "wrong", sameAsGame: false });
    if (lost.kind === "wrong") expect(lost.loss).toBeGreaterThanOrEqual(PUZZLE_TOLERANCE);
  });
  it("counts a move that checkmates as keeping everything", () => {
    const mated = terminalResult(playMove(MATE_FEN, "h5f7")!.fen);
    expect(judgeAttempt({ ...puzzle, answerUci: "c4f7" }, "h5f7", mated)).toEqual({ kind: "good", loss: 0 });
  });
  it("accepts nothing but the engine's move when there is no engine", () => {
    expect(judgeAttempt(puzzle, "d2d3", null)).toEqual({ kind: "unchecked" });
  });
});

describe("puzzles: what to practise next", () => {
  const puzzles = buildPuzzles([
    table([row({ id: "a", loss: 90, patterns: ["hung_piece"] }), row({ id: "b", loss: 70 }), row({ id: "c", loss: 50, patterns: ["hung_piece"] })]),
  ]);
  it("starts with the costliest, and filters by theme", () => {
    expect(practiceQueue(puzzles, {}, null).map((puzzle) => puzzle.id)).toEqual(["a", "b", "c"]);
    expect(practiceQueue(puzzles, {}, "hung_piece").map((puzzle) => puzzle.id)).toEqual(["a", "c"]);
  });
  it("brings missed puzzles back first and puts solved ones last", () => {
    let progress = recordResult({}, "a", true, 1);
    progress = recordResult(progress, "c", false, 2);
    expect(practiceQueue(puzzles, progress, null).map((puzzle) => puzzle.id)).toEqual(["c", "b", "a"]);
    expect(progress.c).toMatchObject({ solved: 0, missed: 1, lastRight: false });
  });
  it("can start from one chosen position", () => {
    expect(practiceQueue(puzzles, {}, "hung_piece", "b").map((puzzle) => puzzle.id)).toEqual(["b", "a", "c"]);
  });
});
