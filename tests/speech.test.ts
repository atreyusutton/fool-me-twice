import { describe, expect, it } from "vitest";
import { spokenMove } from "../src/core/speech.ts";

describe("spokenMove", () => {
  it.each([
    ["e4", "pawn to E4"],
    ["exd5", "E pawn takes D5"],
    ["Nf3", "knight to F3"],
    ["Nxe5+", "knight takes E5, check"],
    ["Nbd7", "knight on the B file to D7"],
    ["R1e2", "rook on rank 1 to E2"],
    ["Qxf7#", "queen takes F7, checkmate"],
    ["O-O", "castles kingside"],
    ["O-O-O+", "castles queenside, check"],
    ["a8=Q#", "pawn to A8, promoting to a queen, checkmate"],
    ["bxa1=N", "B pawn takes A1, promoting to a knight"],
    ["Kd2", "king to D2"],
  ])("%s is read as %s", (san, spoken) => {
    expect(spokenMove(san)).toBe(spoken);
  });

  it("says an unknown string as written and adds nothing", () => {
    expect(spokenMove("??")).toBe("??");
  });
});
