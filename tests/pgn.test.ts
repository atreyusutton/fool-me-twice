import { describe, expect, it } from "vitest";
import { openingFromEcoUrl, outcomeFromCode, parseClocks, parseGame, parseTimeControl, summarizeGame } from "../src/core/pgn.ts";
import type { RawGame } from "../src/core/types.ts";
import fixture from "./fixtures/antwacky-2026-11-sample.json" with { type: "json" };

const games = fixture.games as RawGame[];
// The last game in the fixture: Antwacky had Black and resigned.
const lost = games[2]!;

describe("parsing the game record", () => {
  it("reads time controls", () => {
    expect(parseTimeControl("600")).toEqual({ base: 600, increment: 0 });
    expect(parseTimeControl("180+2")).toEqual({ base: 180, increment: 2 });
    expect(parseTimeControl("1/86400")).toBeNull();
  });

  it("reads clock comments in seconds", () => {
    expect(parseClocks("1. e4 {[%clk 0:09:56.6]} 1... g6 {[%clk 1:00:00]}")).toEqual([596.6, 3600]);
  });

  it("maps result codes to outcomes", () => {
    expect(outcomeFromCode("win")).toBe("win");
    expect(outcomeFromCode("timeout")).toBe("loss");
    expect(outcomeFromCode("repetition")).toBe("draw");
  });

  it("names the opening family from the opening link", () => {
    const opening = openingFromEcoUrl("https://www.chess.com/openings/Modern-Defense-Standard-Two-Knights-Variation-4...Nd7");
    expect(opening.family).toBe("Modern Defense");
    expect(opening.full).toContain("Two Knights");
    expect(openingFromEcoUrl(undefined).family).toBeNull();
  });

  it("summarises a real game from the player's side", () => {
    const summary = summarizeGame(lost, "antwacky");
    expect(summary).toMatchObject({
      playerColor: "black",
      outcome: "loss",
      ending: "resignation",
      opponentName: "Alguaire",
      opening: "Modern Defense",
      timeControl: { base: 600, increment: 0 },
    });
    expect(summarizeGame(lost, "someone-else")).toBeNull();
    expect(summarizeGame({ ...lost, rules: "chess960" }, "antwacky")).toBeNull();
  });

  it("replays every move and keeps clocks and thinking time", () => {
    const parsed = parseGame(lost, "antwacky");
    expect(parsed.moves.length).toBe(parsed.summary.plies);
    const first = parsed.moves[0]!;
    expect(first).toMatchObject({ ply: 1, moveNumber: 1, color: "white", san: "e4", uci: "e2e4", piece: "pawn", clockLeft: 596.6 });
    expect(first.timeSpent).toBeCloseTo(3.4, 5);
    // Black's fourth move: 4... Nd7 with 9:41 left after 9:55.6.
    const nd7 = parsed.moves[7]!;
    expect(nd7).toMatchObject({ san: "Nd7", color: "black", moveNumber: 4, piece: "knight" });
    expect(nd7.timeSpent).toBeCloseTo(14.6, 5);
    // Every position links to the next one.
    for (let index = 1; index < parsed.moves.length; index++) {
      expect(parsed.moves[index]!.fenBefore).toBe(parsed.moves[index - 1]!.fenAfter);
    }
    expect(parsed.summary.finalClock).toBe(parsed.moves.filter((move) => move.color === "black").at(-1)!.clockLeft);
  });
});
