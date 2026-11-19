import type { CoachRequest } from "./types.ts";

/**
 * Tokens are how the coach refers to a chess fact without writing it. The model writes
 * `[[played:F2]]`; the interface replaces it with the move from the fact table.
 */
export const FACT_TOKEN_FIELDS = ["played", "best", "loss", "move", "time"] as const;
export const THEME_TOKEN_FIELDS = ["count", "games", "total"] as const;
export type FactTokenField = (typeof FACT_TOKEN_FIELDS)[number];
export type ThemeTokenField = (typeof THEME_TOKEN_FIELDS)[number];

export const TOKEN_PATTERN = /\[\[([a-z]+):([A-Z]\d+)\]\]/g;

export type TextPart =
  | { type: "text"; text: string }
  | { type: "move"; text: string; role: "played" | "best"; factId: string }
  | { type: "number"; text: string };

export type TokenLookup =
  | { ok: true; part: TextPart }
  | { ok: false; reason: string };

/** Resolves one token against the request. The values come from the fact table, never from the model. */
export function resolveToken(field: string, id: string, request: CoachRequest): TokenLookup {
  if (id.startsWith("F")) {
    if (request.kind !== "game") return { ok: false, reason: `fact token ${id} in a reply with no facts` };
    const fact = request.facts.find((entry) => entry.id === id);
    if (!fact) return { ok: false, reason: `unknown fact ${id}` };
    switch (field) {
      case "played":
        return { ok: true, part: { type: "move", text: fact.played, role: "played", factId: id } };
      case "best":
        return { ok: true, part: { type: "move", text: fact.best, role: "best", factId: id } };
      case "loss":
        return { ok: true, part: { type: "number", text: `${fact.loss} points` } };
      case "move":
        return { ok: true, part: { type: "number", text: String(fact.moveNumber) } };
      case "time":
        if (fact.timeSpent === null) return { ok: false, reason: `fact ${id} has no time for the move` };
        return { ok: true, part: { type: "number", text: fact.timeSpent === 1 ? "1 second" : `${fact.timeSpent} seconds` } };
      default:
        return { ok: false, reason: `field "${field}" does not exist on a fact` };
    }
  }
  if (id === "G1") {
    // G1 is the game under review.
    if (request.kind !== "game") return { ok: false, reason: "game token in a reply about the profile" };
    if (field !== "mistakes") return { ok: false, reason: `field "${field}" does not exist on the game` };
    const count = request.game.clearMistakes;
    return { ok: true, part: { type: "number", text: count === 1 ? "1 clear mistake" : `${count} clear mistakes` } };
  }
  if (id.startsWith("T")) {
    const theme = request.profile.themes.find((entry) => entry.id === id);
    if (!theme) return { ok: false, reason: `unknown theme ${id}` };
    if (theme.kind === "record") return { ok: false, reason: `theme ${id} is a record finding and has no count tokens` };
    switch (field) {
      case "count":
        return { ok: true, part: { type: "number", text: String(theme.count) } };
      case "games":
        return { ok: true, part: { type: "number", text: String(theme.games) } };
      case "total":
        return { ok: true, part: { type: "number", text: String(theme.gamesAnalysed) } };
      default:
        return { ok: false, reason: `field "${field}" does not exist on a theme` };
    }
  }
  return { ok: false, reason: `unknown ID ${id}` };
}

/** Text with every token removed, for checking the model's own words. */
export function stripTokens(text: string): string {
  return text.replace(TOKEN_PATTERN, " ");
}

/**
 * Splits coach text into plain words and resolved values for the screen.
 * A token that does not resolve is dropped: the validator has already refused such a reply,
 * so this only matters as a last line of defence.
 */
export function renderParts(text: string, request: CoachRequest): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    if (match.index > last) parts.push({ type: "text", text: text.slice(last, match.index) });
    const resolved = resolveToken(match[1]!, match[2]!, request);
    if (resolved.ok) parts.push(resolved.part);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}
