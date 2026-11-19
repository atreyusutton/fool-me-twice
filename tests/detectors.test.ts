import { describe, expect, it } from "vitest";
import { allowedMate, detect, foundMate, hungPiece, missedCapture, missedMate, rushed, timeTrouble, tookFreePiece, type DetectorInput } from "../src/core/detectors.ts";
import { staticExchange } from "../src/core/see.ts";
import type { EngineResult } from "../src/core/types.ts";

const score = (cp: number, best: string): EngineResult => ({ cp, mate: null, best, depth: 12 });
const mate = (moves: number, best: string | null): EngineResult => ({ cp: null, mate: moves, best, depth: 12 });

// Known positions, each reached by a short legal sequence from the starting position.
// 1.e4 e5 2.Nf3 d6 and now 3.Ng5 puts the knight where the queen takes it for free.
const KNIGHT_HANGS_AFTER = "rnbqkbnr/ppp2ppp/3p4/4p1N1/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 1 3";
// 1.d4 e5 2.Nf3 d6 3.Ng5: the same knight move, but the bishop on c1 now defends g5.
const KNIGHT_DEFENDED_AFTER = "rnbqkbnr/ppp2ppp/3p4/4p1N1/3P4/8/PPP1PPPP/RNBQKB1R b KQkq - 1 3";
// 1.e4 e5 2.Nf3 Qg5: White can take the queen with the knight.
const QUEEN_EN_PRISE = "rnb1kbnr/pppp1ppp/8/4p1q1/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
// After ...Bxe2 White takes back on e2: a trade, not a gift.
const RECAPTURE = "rn2kbnr/ppp1pppp/8/4q3/3P4/2N5/PPP1bPPP/R1BQK1NR w KQkq - 0 6";
// 1.f3 e5 2.g4: Black has checkmate in one with the queen.
const MATE_IN_ONE = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2";
const MATE_DELIVERED = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
const MATE_MISSED = "rnbqkbnr/ppp2ppp/3p4/4p3/6P1/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 3";
// 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6: Black has just allowed checkmate on f7.
const ALLOWS_MATE_BEFORE = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
const ALLOWS_MATE_AFTER = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

describe("static exchange", () => {
  it("counts a free piece at full value", () => {
    expect(staticExchange(KNIGHT_HANGS_AFTER, { from: "d8", to: "g5" })).toBe(3);
  });
  it("subtracts the recapture when the piece is defended", () => {
    // Queen takes knight (3), bishop takes queen (9): a loss of 6 for the capturing side.
    expect(staticExchange(KNIGHT_DEFENDED_AFTER, { from: "d8", to: "g5" })).toBe(-6);
  });
  it("returns null for a move that is not a legal capture", () => {
    expect(staticExchange(KNIGHT_HANGS_AFTER, { from: "g8", to: "f6" })).toBeNull();
    expect(staticExchange(KNIGHT_HANGS_AFTER, { from: "a8", to: "a1" })).toBeNull();
  });
});

describe("hung_piece", () => {
  it("fires when the engine's reply wins the piece for free", () => {
    expect(hungPiece({ fenAfter: KNIGHT_HANGS_AFTER, after: score(350, "d8g5"), clear: true })).toBe("knight");
  });
  it("does not fire when the piece is defended", () => {
    expect(hungPiece({ fenAfter: KNIGHT_DEFENDED_AFTER, after: score(-500, "d8g5"), clear: true })).toBeNull();
  });
  it("does not fire when the mistake is not clear", () => {
    expect(hungPiece({ fenAfter: KNIGHT_HANGS_AFTER, after: score(350, "d8g5"), clear: false })).toBeNull();
  });
  it("does not fire when the engine's reply is not a capture of a piece", () => {
    expect(hungPiece({ fenAfter: KNIGHT_HANGS_AFTER, after: score(350, "g8f6"), clear: true })).toBeNull();
    // A pawn is not a piece for this pattern: after 1.e4 d5, taking the d5 pawn is not "a piece left hanging".
    const pawnOnly = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    expect(hungPiece({ fenAfter: pawnOnly, after: score(50, "e4d5"), clear: true })).toBeNull();
  });
});

describe("missed_capture and took_free_piece", () => {
  const base = { fenBefore: QUEEN_EN_PRISE, before: score(900, "f3g5"), opponentCapturedOn: null };
  it("fires when a piece could be taken for free and the player played something else", () => {
    expect(missedCapture({ ...base, playedUci: "b1c3", clear: true })).toBe(true);
    expect(tookFreePiece({ ...base, playedUci: "b1c3" })).toBe(false);
  });
  it("counts as a strength when the player takes it", () => {
    expect(tookFreePiece({ ...base, playedUci: "f3g5" })).toBe(true);
    expect(missedCapture({ ...base, playedUci: "f3g5", clear: true })).toBe(false);
  });
  it("does not fire when the mistake is not clear", () => {
    expect(missedCapture({ ...base, playedUci: "b1c3", clear: false })).toBe(false);
  });
  it("does not fire when the engine's move is not a capture, or wins less than a piece", () => {
    expect(missedCapture({ ...base, before: score(60, "b1c3"), playedUci: "d2d3", clear: true })).toBe(false);
    // 1.e4 d5: taking the pawn wins one pawn, not a piece's worth.
    const pawnOnly = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    expect(missedCapture({ fenBefore: pawnOnly, before: score(60, "e4d5"), playedUci: "b1c3", clear: true, opponentCapturedOn: null })).toBe(false);
  });
  it("does not treat taking back in a trade as free material", () => {
    const trade = { fenBefore: RECAPTURE, before: score(30, "g1e2"), opponentCapturedOn: "e2" };
    expect(tookFreePiece({ ...trade, playedUci: "g1e2" })).toBe(false);
    expect(missedCapture({ ...trade, playedUci: "a2a3", clear: true })).toBe(false);
    // The same capture with no capture before it would count.
    expect(tookFreePiece({ ...trade, opponentCapturedOn: null, playedUci: "g1e2" })).toBe(true);
  });
});

describe("missed_mate, found_mate and allowed_mate", () => {
  it("fires missed_mate when a short forced mate was there and is gone after the move", () => {
    expect(missedMate({ before: mate(1, "d8h4"), after: score(-120, "d2d4") })).toBe(true);
    expect(foundMate({ before: mate(1, "d8h4"), after: score(-120, "d2d4") })).toBe(false);
  });
  it("counts the mate as found when it is delivered or still forced", () => {
    expect(foundMate({ before: mate(1, "d8h4"), after: mate(0, null) })).toBe(true);
    expect(missedMate({ before: mate(1, "d8h4"), after: mate(0, null) })).toBe(false);
    expect(foundMate({ before: mate(3, "d8h4"), after: mate(-2, "e1f2") })).toBe(true);
  });
  it("ignores mates longer than three moves and positions with no mate", () => {
    expect(missedMate({ before: mate(5, "d8h4"), after: score(-300, "d2d4") })).toBe(false);
    expect(missedMate({ before: score(900, "d8h4"), after: score(-900, "d2d4") })).toBe(false);
  });
  it("fires allowed_mate when the move gives the opponent a short forced mate", () => {
    expect(allowedMate({ before: score(-80, "g7g6"), after: mate(1, "h5f7") })).toBe(true);
  });
  it("does not fire allowed_mate when the player was already being mated, or the mate is long", () => {
    expect(allowedMate({ before: mate(-2, "g7g6"), after: mate(1, "h5f7") })).toBe(false);
    expect(allowedMate({ before: score(-80, "g7g6"), after: mate(6, "h5f7") })).toBe(false);
    expect(allowedMate({ before: score(-80, "g7g6"), after: score(200, "h5f7") })).toBe(false);
  });
});

describe("time_trouble and rushed", () => {
  const tenMinutes = { base: 600, increment: 0 };
  it("fires time_trouble on a clear mistake with under a tenth of the starting time", () => {
    expect(timeTrouble({ clear: true, clockLeft: 40, timeSpent: 10, timeControl: tenMinutes })).toBe(true);
  });
  it("does not fire time_trouble with time in hand, without clocks, or when the mistake is not clear", () => {
    expect(timeTrouble({ clear: true, clockLeft: 300, timeSpent: 10, timeControl: tenMinutes })).toBe(false);
    expect(timeTrouble({ clear: true, clockLeft: null, timeSpent: null, timeControl: tenMinutes })).toBe(false);
    expect(timeTrouble({ clear: false, clockLeft: 40, timeSpent: 10, timeControl: tenMinutes })).toBe(false);
  });
  it("fires rushed on a clear mistake played in under three seconds with over half the time left", () => {
    expect(rushed({ clear: true, clockLeft: 500, timeSpent: 1.5, timeControl: tenMinutes })).toBe(true);
  });
  it("does not fire rushed after a real think, late in the game, or when the mistake is not clear", () => {
    expect(rushed({ clear: true, clockLeft: 500, timeSpent: 12, timeControl: tenMinutes })).toBe(false);
    expect(rushed({ clear: true, clockLeft: 200, timeSpent: 1.5, timeControl: tenMinutes })).toBe(false);
    expect(rushed({ clear: false, clockLeft: 500, timeSpent: 1.5, timeControl: tenMinutes })).toBe(false);
  });
  it("allows for the increment when working out the clock before the move", () => {
    // 58s left after a 2s move with a 5s increment means 55s before it: under a tenth of 600.
    expect(timeTrouble({ clear: true, clockLeft: 58, timeSpent: 2, timeControl: { base: 600, increment: 5 } })).toBe(true);
  });
});

describe("detect", () => {
  const quiet: DetectorInput = {
    fenBefore: ALLOWS_MATE_BEFORE,
    fenAfter: ALLOWS_MATE_AFTER,
    playedUci: "g8f6",
    opponentCapturedOn: null,
    before: score(-80, "g7g6"),
    after: mate(1, "h5f7"),
    clear: true,
    clockLeft: 590,
    timeSpent: 1,
    timeControl: { base: 600, increment: 0 },
  };
  it("combines the tags that apply", () => {
    const result = detect(quiet);
    expect(result.patterns.sort()).toEqual(["allowed_mate", "rushed"]);
    expect(result.strengths).toEqual([]);
    expect(result.lostPiece).toBeNull();
  });
  it("returns nothing for an ordinary good move", () => {
    const result = detect({ ...quiet, playedUci: "g7g6", after: score(60, "h5f3"), clear: false });
    expect(result).toEqual({ patterns: [], strengths: [], lostPiece: null });
  });
  it("uses the positions it is given", () => {
    expect(MATE_IN_ONE).not.toBe(MATE_DELIVERED);
    expect(MATE_MISSED).not.toBe(MATE_DELIVERED);
  });
});
