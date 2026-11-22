import { describe, expect, it } from "vitest";
import {
  bookMoves, buildBook, checkDrillMove, familyKey, familyOf, likelyReply, lineName, openingReports, opponentReplies, walkBook, type BookFile,
} from "../src/core/openings.ts";
import type { FactRow, FactTable, ParsedGame } from "../src/core/types.ts";

const file: BookFile = {
  source: "test", licence: "test", fetchedAt: "2026-11-22",
  lines: [
    ["B20", "Sicilian Defense", "e4 c5"],
    ["B27", "Sicilian Defense: Hyperaccelerated Dragon", "e4 c5 Nf3 g6"],
    ["B50", "Sicilian Defense: Modern Variations", "e4 c5 Nf3 d6"],
    ["B90", "Sicilian Defense: Najdorf Variation", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"],
    ["B22", "Sicilian Defense: Alapin Variation", "e4 c5 c3"],
    ["C20", "King's Pawn Game", "e4 e5"],
    ["C50", "Italian Game", "e4 e5 Nf3 Nc6 Bc4"],
  ],
};
const book = buildBook(file);

function game(uuid: string, color: "white" | "black", outcome: "win" | "loss" | "draw", sans: string[]): ParsedGame {
  return {
    summary: { uuid, playerColor: color, outcome } as ParsedGame["summary"],
    moves: sans.map((san, index) => ({ ply: index + 1, moveNumber: Math.floor(index / 2) + 1, color: index % 2 === 0 ? "white" : "black", san }) as ParsedGame["moves"][number]),
  };
}

describe("opening book", () => {
  it("names families and makes address keys", () => {
    expect(familyOf("Sicilian Defense: Najdorf Variation")).toBe("Sicilian Defense");
    expect(familyKey("Queen's Gambit Declined")).toBe("queens-gambit-declined");
    expect(book.families.get("Sicilian Defense")?.moves).toEqual(["e4", "c5"]);
  });
  it("lists the book moves in a position, most lines first", () => {
    expect(bookMoves(book, ["e4", "c5"]).map((move) => move.san)).toEqual(["Nf3", "c3"]);
    expect(bookMoves(book, ["e4"]).map((move) => [move.san, move.lines])).toEqual([["c5", 5], ["e5", 2]]);
    expect(bookMoves(book, ["e4"], "Italian Game").map((move) => move.san)).toEqual(["e5"]);
    expect(bookMoves(book, ["d4"])).toEqual([]);
  });
  it("follows a game until it leaves the book", () => {
    expect(walkBook(book, ["e4", "c5", "Nf3", "d6", "h3", "a6"])).toEqual({ depth: 4, name: "Sicilian Defense: Modern Variations", eco: "B50", family: "Sicilian Defense" });
    expect(walkBook(book, ["a4"])).toEqual({ depth: 0, name: null, eco: null, family: null });
    expect(lineName(book, ["e4", "c5", "Nf3"])).toBe("Sicilian Defense");
  });
});

describe("what the player's games say about an opening", () => {
  const games = [
    game("g1", "black", "loss", ["e4", "c5", "Nf3", "h6", "d4"]),
    game("g2", "black", "win", ["e4", "c5", "Nf3", "h6", "Bc4"]),
    game("g3", "black", "loss", ["e4", "c5", "Nf3", "d6", "h3"]),
    game("g4", "white", "win", ["e4", "e5", "Nf3", "Nc6", "Bc4", "h6"]),
  ];
  const mistake = { id: "g3:6", gameId: "g3", moveNumber: 3, clear: true, phase: "opening", best: "Nf6", loss: 30 } as FactRow;
  const later = { id: "g3:20", gameId: "g3", moveNumber: 10, clear: true, phase: "opening", best: "Nf6", loss: 60 } as FactRow;
  const tables = [{ gameId: "g3", rows: [mistake, later] } as FactTable];
  const reports = openingReports(book, games, tables);

  it("groups games by the book's family, most played first", () => {
    expect(reports.map((report) => [report.family, report.games])).toEqual([["Sicilian Defense", 3], ["Italian Game", 1]]);
    expect(reports[0]).toMatchObject({ wins: 1, losses: 2, draws: 0, asBlack: 3, asWhite: 0, key: "sicilian-defense" });
  });
  it("finds where the player most often leaves the book, and what the book moves were", () => {
    const departure = reports[0]!.departure!;
    expect(departure).toMatchObject({ line: ["e4", "c5", "Nf3"], played: "h6", moveNumber: 2, games: 2 });
    expect(departure.book.map((move) => move.san)).toEqual(["d6", "g6"]);
    expect(reports[0]).toMatchObject({ leftByPlayer: 2, leftByOpponent: 1 });
    // In the Italian game it was the opponent who left the book.
    expect(reports[1]).toMatchObject({ departure: null, leftByOpponent: 1, leftByPlayer: 0 });
  });
  it("takes the earliest clear opening mistake from the fact tables", () => {
    expect(reports[0]!.firstMistake?.id).toBe("g3:6");
    expect(reports[1]!.firstMistake).toBeNull();
  });
});

describe("the drill", () => {
  it("accepts a book move of the chosen opening and names what it reaches", () => {
    expect(checkDrillMove(book, ["e4", "c5", "Nf3"], "Sicilian Defense", "d6")).toEqual({ kind: "book", move: { san: "d6", lines: 2, name: "Sicilian Defense: Modern Variations" } });
  });
  it("tells a book move of another opening from a move in no book", () => {
    const other = checkDrillMove(book, ["e4"], "Sicilian Defense", "e5");
    expect(other).toMatchObject({ kind: "other_opening", name: "King's Pawn Game" });
    const none = checkDrillMove(book, ["e4", "c5"], "Sicilian Defense", "h4");
    expect(none.kind).toBe("not_book");
    if (none.kind === "not_book") expect(none.book.map((move) => move.san)).toEqual(["Nf3", "c3"]);
  });
  it("picks only book replies inside the opening, weighted by lines and by the player's own opponents", () => {
    const pick = (roll: number, replies = new Map()) => likelyReply(book, ["e4", "c5"], "Sicilian Defense", replies, () => roll)?.san;
    // Nf3 has three lines and c3 has one: the first three quarters of the range pick Nf3.
    expect(pick(0)).toBe("Nf3");
    expect(pick(0.74)).toBe("Nf3");
    expect(pick(0.76)).toBe("c3");
    // Two of the player's real opponents played c3 here, which shifts the weights to 3 against 11.
    const replies = opponentReplies([game("a", "black", "win", ["e4", "c5", "c3"]), game("b", "black", "win", ["e4", "c5", "c3"])]);
    expect(replies.get("e4 c5")?.get("c3")).toBe(2);
    expect(pick(0.3, replies)).toBe("c3");
    expect(likelyReply(book, ["e4", "c5", "c3"], "Sicilian Defense", replies, () => 0)).toBeNull();
    expect(likelyReply(book, ["e4"], "Italian Game", replies, () => 0.99)?.san).toBe("e5");
  });
});
