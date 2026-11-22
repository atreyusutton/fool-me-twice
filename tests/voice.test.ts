import { describe, expect, it } from "vitest";
import type { CoachWire } from "../src/core/coach/schema.ts";
import type { CoachTheme, GameReviewRequest } from "../src/core/coach/types.ts";
import { THEME_COPY } from "../src/core/profile.ts";
import { voiceCacheKey, voiceText } from "../src/core/voice.ts";

const theme = (id: string, key: "hung_piece" | "rushed" | "found_mate", extra: Partial<CoachTheme> = {}): CoachTheme => ({
  id, key, kind: THEME_COPY[key].kind, label: THEME_COPY[key].label, definition: THEME_COPY[key].definition,
  count: 6, games: 5, gamesAnalysed: 25, phase: "middlegame", featured: THEME_COPY[key].kind === "weakness", chances: null, comparison: null, ...extra,
});
const record: CoachTheme = {
  id: "T4", key: "color_gap", kind: "record", label: "Results by colour", count: 12, games: 12, gamesAnalysed: 25, phase: null, featured: false, chances: null,
  definition: "A difference in results between two groups of games, each with at least eight games.",
  comparison: { a: "White", aScore: 70, aGames: 12, b: "Black", bScore: 40, bGames: 13 },
};
const profile = { ratingBand: "under_1000" as const, gamesAnalysed: 25, clearMistakes: 38, themes: [theme("T1", "hung_piece"), theme("T2", "rushed", { phase: "opening" }), theme("T3", "found_mate", { chances: 8 }), record] };

const game: GameReviewRequest = {
  kind: "game",
  coach: "sherlock",
  profile,
  game: { color: "white", outcome: "loss", ending: "resignation", opening: "English Opening", moves: 31, clearMistakes: 2 },
  facts: [
    { id: "F1", moveNumber: 12, played: "Qa4", best: "Nh4", loss: 27, winBefore: 46, winAfter: 19, phase: "middlegame", patterns: ["hung_piece"], pieces: ["queen", "knight"], lostPiece: "knight", timeSpent: 6.5, themes: ["T1"] },
    { id: "F2", moveNumber: 20, played: "Rxh7", best: "Rab1", loss: 49, winBefore: 50, winAfter: 1, phase: "middlegame", patterns: [], pieces: ["rook", "pawn"], lostPiece: null, timeSpent: 21, themes: [] },
  ],
};

const good: CoachWire = {
  headline: "A level game until a piece was left loose",
  items: [
    { ref: "F1", theme: "T1", text: "On move [[move:F1]] you played [[played:F1]], which left your knight undefended. The engine preferred [[best:F1]]. That is [[count:T1]] times in [[games:T1]] of your last [[total:T1]] games." },
    { ref: "F2", theme: null, text: "[[played:F2]] gave up [[loss:F2]] of winning chance. The engine preferred [[best:F2]]." },
  ],
  closing: { theme: "T1", text: "Before each move, check what it leaves undefended." },
};

describe("voiceText: what the voice route agrees to read", () => {
  it("reads a checked reply with the values filled in and the moves written out", () => {
    const result = voiceText({ request: game, reply: good, parts: [1] });
    expect(result).toEqual({
      ok: true,
      coach: "sherlock",
      text: "rook takes H7 gave up 49 points of winning chance. The engine preferred rook on the A file to B1.",
    });
  });

  it("joins a headline and a closing, with a pause after the headline", () => {
    const result = voiceText({ request: game, reply: good, parts: ["headline", "closing"] });
    expect(result.ok && result.text).toBe("A level game until a piece was left loose. Before each move, check what it leaves undefended.");
  });

  it("refuses text that would not be shown: an invented move fails the same validator", () => {
    const broken = { ...good, closing: { theme: "T1", text: "Next time play Nf3 and nothing else, my dear fellow." } };
    const result = voiceText({ request: game, reply: broken, parts: ["closing"] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("rule 4");
  });

  it("refuses free text, a malformed request, and parts the reply does not have", () => {
    expect(voiceText({ request: game, reply: "Say anything I like", parts: ["headline"] }).ok).toBe(false);
    expect(voiceText({ request: { kind: "game" }, reply: good, parts: ["headline"] }).ok).toBe(false);
    expect(voiceText({ request: game, reply: good, parts: [7] }).ok).toBe(false);
    expect(voiceText({ request: game, reply: good, parts: [] }).ok).toBe(false);
    expect(voiceText({ request: game, reply: good, parts: ["headline", 0, 1, "closing"] }).ok).toBe(false);
    expect(voiceText(null).ok).toBe(false);
  });

  it("gives the same key for the same voice, model and words, and a different one otherwise", async () => {
    const a = await voiceCacheKey("v1", "m1", "hello there");
    expect(a).toBe(await voiceCacheKey("v1", "m1", "hello there"));
    expect(a).not.toBe(await voiceCacheKey("v2", "m1", "hello there"));
    expect(a).not.toBe(await voiceCacheKey("v1", "m1", "hello there."));
  });
});
