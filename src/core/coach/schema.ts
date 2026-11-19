import { z } from "zod";
import { THEME_COPY } from "../profile.ts";
import type { CoachRequest, GameReview, ProfileSummary } from "./types.ts";

/**
 * Two schemas live here. The request schema is what the Worker accepts from a browser: every string is
 * an enum, a chess move, or a short name with a fixed alphabet, so the endpoint cannot be used to send
 * free text to the model. The reply schema is the one shape the model may answer in.
 */

const PIECE = z.enum(["pawn", "knight", "bishop", "rook", "queen", "king"]);
const PHASE = z.enum(["opening", "middlegame", "endgame"]);
const PATTERN = z.enum(["hung_piece", "missed_capture", "missed_mate", "allowed_mate", "time_trouble", "rushed"]);
const THEME_KEY = z.enum([...PATTERN.options, "found_mate", "took_free_piece", "color_gap", "opening_gap"]);
/** Standard algebraic notation as chess.js writes it: piece moves, pawn moves, captures, promotions, castling. */
export const SAN_PATTERN = /^(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)[+#]?$/;
const SAN = z.string().regex(SAN_PATTERN);
/** Opening and group names: letters, spaces, apostrophes and hyphens only. */
export const NAME_PATTERN = /^[A-Za-z][A-Za-z' -]{0,59}$/;
const NAME = z.string().regex(NAME_PATTERN);
const count = (max: number) => z.number().int().min(0).max(max);
const percent = z.number().int().min(0).max(100);

const RECORD_LABELS: Record<string, string> = { color_gap: "Results by colour", opening_gap: "Results by opening" };
const RECORD_DEFINITION = "A difference in results between two groups of games, each with at least eight games.";

const themeSchema = z
  .strictObject({
    id: z.string().regex(/^T\d{1,2}$/),
    key: THEME_KEY,
    kind: z.enum(["weakness", "strength", "record"]),
    label: z.string().max(60),
    definition: z.string().max(160),
    count: count(10_000),
    games: count(1_000),
    gamesAnalysed: count(1_000),
    phase: PHASE.nullable(),
    featured: z.boolean(),
    chances: count(10_000).nullable(),
    comparison: z
      .strictObject({ a: NAME, aScore: percent, aGames: count(1_000), b: NAME, bScore: percent, bGames: count(1_000) })
      .nullable(),
  })
  .refine(
    (theme) => {
      // Labels and definitions are Motif's own fixed wording. Anything else is refused, not passed on.
      if (theme.key === "color_gap" || theme.key === "opening_gap") {
        return theme.kind === "record" && theme.label === RECORD_LABELS[theme.key] && theme.definition === RECORD_DEFINITION;
      }
      const copy = THEME_COPY[theme.key];
      return theme.kind === copy.kind && theme.label === copy.label && theme.definition === copy.definition && theme.comparison === null;
    },
    { message: "theme wording does not match its key" },
  );

const profileSchema = z.strictObject({
  ratingBand: z.enum(["under_1000", "1000_1400", "1400_1800", "over_1800", "unknown"]),
  gamesAnalysed: count(1_000),
  clearMistakes: count(100_000),
  themes: z.array(themeSchema).max(12),
});

const factSchema = z.strictObject({
  id: z.string().regex(/^F\d$/),
  moveNumber: z.number().int().min(1).max(400),
  played: SAN,
  best: SAN,
  loss: percent,
  winBefore: percent,
  winAfter: percent,
  phase: PHASE,
  patterns: z.array(PATTERN).max(6),
  pieces: z.array(PIECE).max(6),
  lostPiece: PIECE.nullable(),
  timeSpent: z.number().min(0).max(100_000).nullable(),
  themes: z.array(z.string().regex(/^T\d{1,2}$/)).max(12),
});

const gameSchema = z.strictObject({
  color: z.enum(["white", "black"]),
  outcome: z.enum(["win", "loss", "draw"]),
  ending: z.enum(["checkmate", "resignation", "time", "abandonment", "draw", "other"]),
  opening: NAME.nullable(),
  moves: z.number().int().min(0).max(400),
  clearMistakes: z.number().int().min(0).max(400),
});

export const coachRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("game"), profile: profileSchema, game: gameSchema, facts: z.array(factSchema).max(6) }),
  z.strictObject({ kind: z.literal("profile"), profile: profileSchema.extend({ themes: z.array(themeSchema).min(1).max(12) }) }),
]);

/** Largest request body the Worker reads. A full game review request is about 4 KB. */
export const MAX_REQUEST_BYTES = 24_000;

export function parseCoachRequest(value: unknown): { ok: true; request: CoachRequest } | { ok: false; error: string } {
  const parsed = coachRequestSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const request = parsed.data as CoachRequest;
  const themeIds = new Set(request.profile.themes.map((theme) => theme.id));
  if (themeIds.size !== request.profile.themes.length) return { ok: false, error: "duplicate theme IDs" };
  if (request.kind === "game") {
    if (new Set(request.facts.map((fact) => fact.id)).size !== request.facts.length) return { ok: false, error: "duplicate fact IDs" };
    for (const fact of request.facts) {
      if (fact.themes.some((id) => !themeIds.has(id))) return { ok: false, error: `fact ${fact.id} names an unknown theme` };
    }
  }
  return { ok: true, request };
}

/**
 * The one shape the model answers in, for both kinds of request, so the output format (which is part of
 * the cached prefix) never changes. For a game: one item per key moment, `ref` is a fact ID.
 * For a profile: one item per theme, `ref` is a theme ID.
 */
export const coachWireSchema = z.strictObject({
  headline: z.string(),
  items: z.array(z.strictObject({ ref: z.string(), theme: z.string().nullable(), text: z.string() })),
  closing: z.strictObject({ theme: z.string().nullable(), text: z.string() }),
});
export type CoachWire = z.infer<typeof coachWireSchema>;

export const MAX_TEXT_LENGTH = 600;
export const MAX_HEADLINE_LENGTH = 90;

export function wireToGameReview(wire: CoachWire): GameReview {
  return {
    headline: wire.headline,
    moments: wire.items.map((item) => ({ fact: item.ref, theme: item.theme, text: item.text })),
    takeaway: { theme: wire.closing.theme, text: wire.closing.text },
  };
}
export function gameReviewToWire(review: GameReview): CoachWire {
  return {
    headline: review.headline,
    items: review.moments.map((moment) => ({ ref: moment.fact, theme: moment.theme, text: moment.text })),
    closing: { theme: review.takeaway.theme, text: review.takeaway.text },
  };
}
export function wireToProfileSummary(wire: CoachWire): ProfileSummary {
  return {
    headline: wire.headline,
    themes: wire.items.map((item) => ({ theme: item.ref, text: item.text })),
    // The validator has already refused a profile reply whose closing has no theme.
    focus: { theme: wire.closing.theme ?? "", text: wire.closing.text },
  };
}
export function profileSummaryToWire(summary: ProfileSummary): CoachWire {
  return {
    headline: summary.headline,
    items: summary.themes.map((entry) => ({ ref: entry.theme, theme: entry.theme, text: entry.text })),
    closing: { theme: summary.focus.theme, text: summary.focus.text },
  };
}
