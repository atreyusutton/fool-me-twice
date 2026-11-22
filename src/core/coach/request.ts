import { keyMoments } from "../facts.ts";
import { themesOfFact, type Profile } from "../profile.ts";
import type { FactTable, GameSummary } from "../types.ts";
import type { CoachId } from "./personas.ts";
import { NAME_PATTERN } from "./schema.ts";
import type { CoachFact, CoachGame, CoachProfile, GameReviewRequest, ProfileSummaryRequest, RatingBand } from "./types.ts";

export function ratingBand(rating: number | null | undefined): RatingBand {
  if (rating === null || rating === undefined) return "unknown";
  if (rating < 1000) return "under_1000";
  if (rating < 1400) return "1000_1400";
  if (rating < 1800) return "1400_1800";
  return "over_1800";
}

/** The compact profile the coach sees: themes with their counts, and nothing else about the player. */
export function coachProfile(profile: Profile, rating: number | null | undefined): CoachProfile {
  return {
    ratingBand: ratingBand(rating),
    gamesAnalysed: profile.gamesAnalysed,
    clearMistakes: profile.clearMistakes,
    themes: profile.themes
      // A record finding is only passed on if its group names are plain names; anything else stays on screen only.
      .filter((theme) => !theme.comparison || (NAME_PATTERN.test(theme.comparison.a) && NAME_PATTERN.test(theme.comparison.b)))
      .map((theme) => ({
      id: theme.id,
      key: theme.key,
      kind: theme.kind,
      label: theme.label,
      definition: theme.definition,
      count: theme.count,
      games: theme.games,
      gamesAnalysed: theme.gamesAnalysed,
      phase: theme.phase,
      featured: theme.featured,
      chances: theme.chances,
        comparison: theme.comparison,
      })),
  };
}

/**
 * Everything the coach is told about one game: a summary and its key fact rows. No PGN, no other moves,
 * no other games. Also returns which real fact row each local ID stands for, so the screen can link back.
 */
export function gameReviewRequest(
  summary: GameSummary,
  table: FactTable,
  profile: Profile,
  coach: CoachId,
): { request: GameReviewRequest; factIds: Record<string, string> } {
  const factIds: Record<string, string> = {};
  const facts: CoachFact[] = keyMoments(table).map((row, index) => {
    const id = `F${index + 1}`;
    factIds[id] = row.id;
    return {
      id,
      moveNumber: row.moveNumber,
      played: row.played,
      // A key moment always has a legal engine move; the fallback keeps the type honest.
      best: row.best ?? row.played,
      loss: Math.round(row.loss),
      winBefore: Math.round(row.winBefore),
      winAfter: Math.round(row.winAfter),
      phase: row.phase,
      patterns: row.patterns,
      pieces: row.pieces,
      lostPiece: row.lostPiece,
      timeSpent: row.timeSpent,
      themes: themesOfFact(profile, row.id),
    };
  });
  const game: CoachGame = {
    color: summary.playerColor,
    outcome: summary.outcome,
    ending: summary.ending,
    opening: summary.opening && NAME_PATTERN.test(summary.opening) ? summary.opening : null,
    moves: table.rows.length,
    clearMistakes: table.rows.filter((row) => row.clear).length,
  };
  return { request: { kind: "game", coach, profile: coachProfile(profile, summary.playerRating), game, facts }, factIds };
}

export function profileSummaryRequest(profile: Profile, rating: number | null | undefined, coach: CoachId): ProfileSummaryRequest {
  return { kind: "profile", coach, profile: coachProfile(profile, rating) };
}
