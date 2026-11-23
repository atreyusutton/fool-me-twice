import { describe, expect, it } from "vitest";
import { parseSearchOutput } from "../src/core/engine.ts";
import { describeOutcome, explain, followLine, materialSwing } from "../src/core/why.ts";

const words = (parts: { text: string }[]) => parts.map((part) => part.text).join("");

describe("the engine's line is kept with its result", () => {
  it("reads the line from the last exact search line", () => {
    const result = parseSearchOutput(["info depth 13 score cp 20 pv e2e4 e7e5", "info depth 14 score cp 31 nodes 9 pv g1f3 d7d5 d2d4", "bestmove g1f3 ponder d7d5"]);
    expect(result.pv).toEqual(["g1f3", "d7d5", "d2d4"]);
  });

  it("drops a line that does not begin with the chosen move", () => {
    const result = parseSearchOutput(["info depth 14 score cp 31 pv e2e4 e7e5", "bestmove g1f3"]);
    expect(result.best).toBe("g1f3");
    expect(result.pv).toBeUndefined();
  });
});

describe("following a line", () => {
  // White has just left a knight on e5 where the d6 pawn takes it.
  const hung = "rnbqkbnr/ppp2ppp/3p4/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3";

  it("counts a piece lost for nothing", () => {
    const line = followLine(hung, ["d6e5", "b1c3", "g8f6"], "white");
    expect(line.steps.map((step) => step.san)).toEqual(["dxe5", "Nc3", "Nf6"]);
    expect(line.lost).toEqual(["knight"]);
    expect(line.won).toEqual([]);
    expect(describeOutcome(line)).toBe("you lose a knight and win nothing back");
    expect(materialSwing(line)).toBe(-3);
  });

  it("sees checkmate at the end of a line, and who is mated", () => {
    // Fool's mate: after 1. f3 e5 2. g4, Black mates with the queen.
    const line = followLine("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2", ["d8h4"], "white");
    expect(line.mated).toBe("player");
    expect(describeOutcome(line)).toBe("you are checkmated");
    expect(followLine("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2", ["d8h4"], "black").mated).toBe("opponent");
  });

  it("stops at a move that is not legal and keeps what came before", () => {
    const line = followLine(hung, ["d6e5", "a1a8", "g8f6"], "white");
    expect(line.steps.map((step) => step.san)).toEqual(["dxe5"]);
  });

  it("goes past the usual length only while pieces are being taken", () => {
    const quiet = ["g1f3", "g8f6", "b1c3", "b8c6", "e2e3", "e7e6", "a2a3", "a7a6"];
    const line = followLine("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", quiet, "white");
    expect(line.steps).toHaveLength(6);
    expect(describeOutcome(line)).toBe("no material changes hands");
  });
});

describe("the explanation", () => {
  const hung = "rnbqkbnr/ppp2ppp/3p4/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3";
  const before = "rnbqkbnr/ppp2ppp/3p4/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";

  it("says what each line comes to and what the difference is", () => {
    const why = explain("Ne5", followLine(hung, ["d6e5", "b1c3"], "white"), followLine(before, ["d2d4", "g8f6", "b1c3"], "white"));
    expect(words(why.played)).toBe("After Ne5, the engine expects dxe5 Nc3. Along that line you lose a knight and win nothing back.");
    expect(words(why.best)).toBe("The engine's d4 is followed by Nf6 Nc3. Along that line no material changes hands.");
    expect(why.verdict).toBe("Counting what is taken along the two lines shown, the engine's line leaves you better off by the value of three pawns.");
    expect(why.proven).toBe(true);
  });

  it("does not invent a reason when the lines differ only in position", () => {
    const why = explain("Nc3", followLine(before, [], "white"), followLine(before, ["d2d4", "g8f6"], "white"));
    expect(why.proven).toBe(false);
    expect(why.verdict).toContain("not something this app can prove");
  });
});
