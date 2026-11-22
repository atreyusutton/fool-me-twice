import type { PieceName } from "../types.ts";
import { coachWireSchema, MAX_HEADLINE_LENGTH, MAX_TEXT_LENGTH, type CoachWire } from "./schema.ts";
import { resolveToken, stripTokens, TOKEN_PATTERN } from "./tokens.ts";
import type { CoachRequest } from "./types.ts";

/**
 * The check every coach reply passes before a player sees it. It runs in code, on the Worker and again
 * in the browser. A reply that breaks any rule is never shown.
 *
 *  1. It matches the schema (and has the right items for the request).
 *  2. Every fact and theme ID it cites is in the request.
 *  3. Every token resolves to a real field.
 *  4. Its own words contain no digit, no number word, no square and nothing shaped like a chess move.
 *  5. A moment is only tied to a theme whose evidence includes that fact.
 *  6. A piece is only named where the fact row involves that piece.
 *  7. A phase of the game or a result is only named where it matches the facts.
 */
export type Validation = { ok: true; wire: CoachWire } | { ok: false; rule: number; detail: string };

const fail = (rule: number, detail: string): Validation => ({ ok: false, rule, detail });

/** Number words the coach may not use: a count belongs in a token. "One", "first" and "second" stay allowed as ordinary words. */
const NUMBER_WORDS =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen|twice|thrice|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/i;
/** Things shaped like a move without a digit: castling, "Nxf", "exd". Anything with a square has a digit and fails earlier. */
const MOVE_SHAPED = /\bO-O(?:-O)?\b|\b[KQRBN]x[a-h]\b|\b[a-h]x[a-h]\b/;
const PIECE_WORDS: Record<PieceName, RegExp> = {
  pawn: /\bpawns?\b/i,
  knight: /\bknights?\b/i,
  bishop: /\bbishops?\b/i,
  rook: /\brooks?\b/i,
  queen: /\bqueens?\b/i,
  king: /\bkings?\b/i,
};
const PIECES = Object.keys(PIECE_WORDS) as PieceName[];

function checkWords(text: string, where: string): Validation | null {
  const words = stripTokens(text);
  // A broken token leaves its brackets behind; report that before the digit inside it.
  if (/\[\[|\]\]/.test(words)) return fail(3, `${where} contains a malformed token`);
  if (/\d/.test(words)) return fail(4, `${where} contains a digit; use a token for every number`);
  const numberWord = NUMBER_WORDS.exec(words);
  if (numberWord) return fail(4, `${where} spells out a number ("${numberWord[0]}"); use a token instead`);
  const move = MOVE_SHAPED.exec(words);
  if (move) return fail(4, `${where} contains something shaped like a chess move ("${move[0]}"); use a token instead`);
  return null;
}

function checkTokens(text: string, where: string, request: CoachRequest): Validation | null {
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const resolved = resolveToken(match[1]!, match[2]!, request);
    if (!resolved.ok) {
      const unknownId = resolved.reason.startsWith("unknown");
      return fail(unknownId ? 2 : 3, `${where}: token ${match[0]} does not resolve (${resolved.reason})`);
    }
  }
  return null;
}

function checkPieces(text: string, where: string, allowed: PieceName[]): Validation | null {
  const words = stripTokens(text);
  for (const piece of PIECES) {
    if (PIECE_WORDS[piece].test(words) && !allowed.includes(piece)) {
      return fail(6, `${where} names a ${piece}, which is not among the pieces of that fact${allowed.length ? ` (${allowed.join(", ")})` : ""}`);
    }
  }
  return null;
}

const OUTCOME_CLAIMS: { outcome: "win" | "loss" | "draw"; pattern: RegExp }[] = [
  { outcome: "win", pattern: /\byou won\b|\byour win\b|\bvictory\b|\bwon (?:the|this) game\b/i },
  { outcome: "loss", pattern: /\byou lost (?:the|this) game\b|\byour loss\b|\bdefeat\b|\blost (?:the|this) game\b/i },
  { outcome: "draw", pattern: /\byou drew\b|\bended in a draw\b|\bdrawn game\b/i },
];

/** Shortest text that can be a real sentence. Catches a reply that fills a field with a stub. */
export const MIN_TEXT_LENGTH = 20;

function checkLength(text: string, where: string, max: number): Validation | null {
  if (text.trim().length === 0) return fail(1, `${where} is empty`);
  if (text.length > max) return fail(1, `${where} is longer than ${max} characters`);
  return null;
}

/** Runs every rule. `raw` is the model's output: a JSON string, or an already parsed value. */
export function validateReply(request: CoachRequest, raw: unknown): Validation {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      // Not JSON at all is a schema failure like any other; the model is told so on the retry.
      return fail(1, "the reply is not valid JSON");
    }
  }
  const parsed = coachWireSchema.safeParse(value);
  if (!parsed.success) return fail(1, "the reply does not match the required shape");
  const wire = parsed.data;
  const themes = new Map(request.profile.themes.map((theme) => [theme.id, theme]));

  const texts: { text: string; where: string; max: number }[] = [
    { text: wire.headline, where: "the headline", max: MAX_HEADLINE_LENGTH },
    ...wire.items.map((item) => ({ text: item.text, where: `the text for ${item.ref}`, max: MAX_TEXT_LENGTH })),
    { text: wire.closing.text, where: "the closing text", max: MAX_TEXT_LENGTH },
  ];
  for (const { text, where, max } of texts) {
    const problem = checkLength(text, where, max) ?? checkTokens(text, where, request) ?? checkWords(text, where);
    if (problem) return problem;
  }

  if (wire.closing.theme !== null && !themes.has(wire.closing.theme)) return fail(2, `the closing cites unknown theme ${wire.closing.theme}`);
  const seen = new Set<string>();
  for (const item of wire.items) {
    if (seen.has(item.ref)) return fail(1, `${item.ref} appears more than once`);
    seen.add(item.ref);
    if (item.theme !== null && !themes.has(item.theme)) return fail(2, `${item.ref} cites unknown theme ${item.theme}`);
  }

  if (request.kind === "game") {
    const facts = new Map(request.facts.map((fact) => [fact.id, fact]));
    for (const item of wire.items) {
      const fact = facts.get(item.ref);
      if (!fact) return fail(2, `unknown fact ${item.ref}`);
      if (item.theme !== null && !fact.themes.includes(item.theme)) {
        return fail(5, `${item.ref} is not evidence for theme ${item.theme}; its themes are ${fact.themes.join(", ") || "none"}`);
      }
      const pieceProblem = checkPieces(item.text, `the text for ${item.ref}`, fact.pieces);
      if (pieceProblem) return pieceProblem;
      for (const phase of ["middlegame", "endgame"] as const) {
        if (new RegExp(`\\b${phase}\\b`, "i").test(stripTokens(item.text)) && fact.phase !== phase) {
          return fail(7, `the text for ${item.ref} says "${phase}", but that move was in the ${fact.phase}`);
        }
      }
    }
    if (wire.items.length !== request.facts.length) {
      return fail(1, `the reply must have exactly one item for each fact (${request.facts.length}), in the same order`);
    }
    if (wire.items.some((item, index) => item.ref !== request.facts[index]!.id)) {
      return fail(1, "the items must follow the order of the facts");
    }
    for (const { text, where } of [texts[0]!, texts.at(-1)!]) {
      const pieceProblem = checkPieces(text, where, []);
      if (pieceProblem) return fail(6, `${where} names a piece; pieces may only be named in the text for a fact that involves them`);
      for (const claim of OUTCOME_CLAIMS) {
        if (claim.pattern.test(stripTokens(text)) && claim.outcome !== request.game.outcome) {
          return fail(7, `${where} describes the result as a ${claim.outcome}, but the game was a ${request.game.outcome}`);
        }
      }
    }
  } else {
    if (wire.closing.theme === null) return fail(1, "the closing of a profile summary must name the theme to focus on");
    const featured = request.profile.themes.filter((theme) => theme.featured);
    for (const item of wire.items) {
      const theme = themes.get(item.ref);
      if (!theme) return fail(2, `unknown theme ${item.ref}`);
      if (item.theme !== item.ref) return fail(1, `in a profile summary each item's theme must equal its ref (${item.ref})`);
      const pieceProblem = checkPieces(item.text, `the text for ${item.ref}`, []);
      if (pieceProblem) return fail(6, `the text for ${item.ref} names a piece; a theme summary may not name pieces`);
      for (const phase of ["middlegame", "endgame"] as const) {
        if (new RegExp(`\\b${phase}\\b`, "i").test(stripTokens(item.text)) && theme.phase !== phase) {
          return fail(7, `the text for ${item.ref} says "${phase}", but the profile does not place that theme there`);
        }
      }
    }
    for (const theme of featured) {
      if (!seen.has(theme.id)) return fail(1, `the reply must include an item for featured theme ${theme.id}`);
    }
    for (const { text, where } of [texts[0]!, texts.at(-1)!]) {
      if (checkPieces(text, where, [])) return fail(6, `${where} names a piece; a profile summary may not name pieces`);
    }
  }
  // Last, so a more specific rule is reported first: every field must say something, and a moment's
  // text must point at its own fact, so the screen has a move or a number to show.
  for (const item of wire.items) {
    if (stripTokens(item.text).trim().length < MIN_TEXT_LENGTH) return fail(1, `the text for ${item.ref} is too short to say anything`);
    if (request.kind === "game" && !item.text.includes(`:${item.ref}]]`)) {
      return fail(1, `the text for ${item.ref} does not cite ${item.ref} with any token`);
    }
  }
  if (stripTokens(wire.closing.text).trim().length < MIN_TEXT_LENGTH) return fail(1, "the closing is too short to say anything");
  return { ok: true, wire };
}
