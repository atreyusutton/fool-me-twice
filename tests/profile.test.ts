import { describe, expect, it } from "vitest";
import { buildProfile, themesOfFact } from "../src/core/profile.ts";
import { computeTier1 } from "../src/core/tier1.ts";
import type { FactRow, FactTable, GameSummary, PatternTag, StrengthTag } from "../src/core/types.ts";

let nextPly = 1;
function row(gameId: string, tags: { patterns?: PatternTag[]; strengths?: StrengthTag[]; loss?: number; phase?: FactRow["phase"] } = {}): FactRow {
  const ply = nextPly++;
  const loss = tags.loss ?? 0;
  return {
    id: `${gameId}:${ply}`, gameId, ply, moveNumber: Math.ceil(ply / 2), color: "white", played: "Nf3", best: "Nf3", playedBest: loss === 0,
    winBefore: 50, winAfter: 50 - loss, loss, phase: tags.phase ?? "middlegame", clockLeft: 300, timeSpent: 5, clear: loss >= 20,
    patterns: tags.patterns ?? [], strengths: tags.strengths ?? [], pieces: ["knight"], lostPiece: tags.patterns?.includes("hung_piece") ? "knight" : null,
    fenBefore: "", fenAfter: "", playedUci: "g1f3", bestUci: "g1f3",
  };
}
const table = (gameId: string, rows: FactRow[]): FactTable => ({ gameId, engineSetting: "test", factsVersion: "1", rows, winLine: [] });

describe("profile", () => {
  it("makes a theme only with at least three occurrences in three different games", () => {
    const profile = buildProfile(
      [
        table("g1", [row("g1", { patterns: ["hung_piece"], loss: 30 }), row("g1", { patterns: ["rushed"], loss: 25 }), row("g1", { patterns: ["rushed"], loss: 25 })]),
        table("g2", [row("g2", { patterns: ["hung_piece"], loss: 40 }), row("g2", { patterns: ["rushed"], loss: 25 })]),
        table("g3", [row("g3", { patterns: ["hung_piece"], loss: 35 }), row("g3")]),
      ],
      null,
    );
    // hung_piece: 3 times in 3 games. rushed: 3 times but only 2 games, so it is not a theme.
    expect(profile.themes.map((theme) => theme.key)).toEqual(["hung_piece"]);
    expect(profile.themes[0]).toMatchObject({ id: "T1", count: 3, games: 3, gamesAnalysed: 3, featured: true, totalLoss: 105, lostPieces: { knight: 3 } });
    expect(profile.belowMinimum).toEqual([{ key: "rushed", label: "Mistakes played too fast", count: 3, games: 2 }]);
    expect(profile.enoughEvidence).toBe(true);
    expect(profile.clearMistakes).toBe(6);
  });

  it("says there is not enough evidence when nothing meets the minimum", () => {
    const profile = buildProfile([table("g1", [row("g1", { patterns: ["hung_piece"], loss: 30 }), row("g1")])], null);
    expect(profile.themes).toEqual([]);
    expect(profile.enoughEvidence).toBe(false);
  });

  it("ranks weaknesses by winning chance lost and features at most three", () => {
    const games = ["a", "b", "c", "d"];
    const tags: [PatternTag, number][] = [["rushed", 21], ["hung_piece", 50], ["missed_capture", 30], ["allowed_mate", 25]];
    const tables = games.slice(0, 3).map((id) => table(id, tags.map(([tag, loss]) => row(id, { patterns: [tag], loss }))));
    const profile = buildProfile(tables, null);
    expect(profile.themes.map((theme) => theme.key)).toEqual(["hung_piece", "missed_capture", "allowed_mate", "rushed"]);
    expect(profile.themes.map((theme) => theme.featured)).toEqual([true, true, true, false]);
    expect(profile.themes.map((theme) => theme.id)).toEqual(["T1", "T2", "T3", "T4"]);
  });

  it("reports strengths on the same terms, with how often the chance came up", () => {
    const tables = ["a", "b", "c"].map((id) => table(id, [row(id, { strengths: ["found_mate"] }), row(id)]));
    tables[0]!.rows.push(row("a", { patterns: ["missed_mate"], loss: 5 }));
    const profile = buildProfile(tables, null);
    const strength = profile.themes.find((theme) => theme.key === "found_mate")!;
    expect(strength).toMatchObject({ kind: "strength", count: 3, games: 3, chances: 4, featured: false });
  });

  it("names the phase only when at least half the occurrences share it", () => {
    const tables = ["a", "b", "c"].map((id) => table(id, [row(id, { patterns: ["hung_piece"], loss: 30, phase: "opening" })]));
    expect(buildProfile(tables, null).themes[0]!.phase).toBe("opening");
    const mixed = [
      table("a", [row("a", { patterns: ["hung_piece"], loss: 30, phase: "opening" })]),
      table("b", [row("b", { patterns: ["hung_piece"], loss: 30, phase: "middlegame" })]),
      table("c", [row("c", { patterns: ["hung_piece"], loss: 30, phase: "endgame" })]),
    ];
    expect(buildProfile(mixed, null).themes[0]!.phase).toBeNull();
  });

  it("links each fact to the themes it is evidence for", () => {
    const tables = ["a", "b", "c"].map((id) => table(id, [row(id, { patterns: ["hung_piece", "rushed"], loss: 30 }), row(id)]));
    const profile = buildProfile(tables, null);
    expect(themesOfFact(profile, tables[0]!.rows[0]!.id).sort()).toEqual(["T1", "T2"]);
    expect(themesOfFact(profile, tables[0]!.rows[1]!.id)).toEqual([]);
  });

  it("includes a tier-1 finding only with eight games on each side and a real gap", () => {
    const game = (index: number, color: "white" | "black", outcome: "win" | "loss"): GameSummary => ({
      uuid: `g${index}`, url: "", endTime: index, timeClass: "rapid", timeControl: { base: 600, increment: 0 }, rated: true, playerColor: color,
      playerRating: 800, opponentName: "x", opponentRating: 800, outcome, ending: "resignation", opening: null, openingFull: null, finalClock: 100, plies: 40,
    });
    const lopsided = [...Array(8).keys()].flatMap((index) => [game(index, "white", "win"), game(100 + index, "black", "loss")]);
    const withGap = buildProfile([], computeTier1(lopsided));
    expect(withGap.themes).toHaveLength(1);
    expect(withGap.themes[0]).toMatchObject({ key: "color_gap", kind: "record", comparison: { a: "White", aScore: 100, aGames: 8, b: "Black", bScore: 0, bGames: 8 } });
    expect(withGap.enoughEvidence).toBe(false);
    // Seven games a side is not enough, however large the gap.
    expect(buildProfile([], computeTier1(lopsided.slice(0, 14))).themes).toEqual([]);
  });
});
