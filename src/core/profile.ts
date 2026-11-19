import { isKeyMoment } from "./facts.ts";
import type { Tier1Finding, Tier1Stats } from "./tier1.ts";
import type { FactRow, FactTable, PatternTag, Phase, PieceName, StrengthTag } from "./types.ts";

/** A tier-2 theme needs at least this many occurrences... */
export const THEME_MIN_COUNT = 3;
/** ...in at least this many different games. */
export const THEME_MIN_GAMES = 3;
/** At most this many themes are featured. */
export const FEATURED_LIMIT = 3;

export type ThemeKey = PatternTag | StrengthTag | Tier1Finding["key"];
export type ThemeKind = "weakness" | "strength" | "record";

export interface Theme {
  /** Short ID the coach uses to point at the theme: T1, T2, ... */
  id: string;
  key: ThemeKey;
  kind: ThemeKind;
  /** Motif's own name for the pattern. */
  label: string;
  /** One plain sentence saying exactly what the code checked. */
  definition: string;
  /** Times it happened, and in how many different games. */
  count: number;
  games: number;
  /** Games the count was taken from. */
  gamesAnalysed: number;
  /** Occurrences per 100 of the player's moves. Null for tier-1 findings. */
  per100Moves: number | null;
  /** Where it concentrates, when at least half the occurrences are in one phase. */
  phase: Phase | null;
  /** Total winning chance given up across the occurrences. Zero for strengths and tier-1 findings. */
  totalLoss: number;
  /** For strengths: how often the chance came up at all (found plus missed). */
  chances: number | null;
  /** For "pieces left hanging": how many times each piece was the one lost. */
  lostPieces: Partial<Record<PieceName, number>> | null;
  /** The fact rows behind the theme, newest game first. Empty for tier-1 findings. */
  factIds: string[];
  featured: boolean;
  /** For tier-1 findings: the two sides of the comparison. */
  comparison: { a: string; aScore: number; aGames: number; b: string; bScore: number; bGames: number } | null;
}

export interface Profile {
  gamesAnalysed: number;
  movesAnalysed: number;
  clearMistakes: number;
  /** Themes that met the minimum, weaknesses first by cost, then strengths, then record findings. */
  themes: Theme[];
  /** Patterns that were seen but not often enough to call a theme. Shown with their counts, never coached on. */
  belowMinimum: { key: PatternTag; label: string; count: number; games: number }[];
  /** True when at least one weakness met the minimum. */
  enoughEvidence: boolean;
}

export const THEME_COPY: Record<PatternTag | StrengthTag, { label: string; definition: string; kind: ThemeKind }> = {
  hung_piece: {
    label: "Pieces left hanging",
    definition: "A clear mistake after which the engine's reply wins a knight, bishop, rook or queen.",
    kind: "weakness",
  },
  missed_capture: {
    label: "Free material not taken",
    definition: "A clear mistake where the engine's move was a capture winning at least a piece, and another move was played.",
    kind: "weakness",
  },
  missed_mate: {
    label: "Checkmates missed",
    definition: "A forced checkmate in three moves or fewer was available and was gone after the move played.",
    kind: "weakness",
  },
  allowed_mate: {
    label: "Checkmates allowed",
    definition: "A move that gave the opponent a forced checkmate in three moves or fewer.",
    kind: "weakness",
  },
  time_trouble: {
    label: "Mistakes with the clock running out",
    definition: "A clear mistake made with less than a tenth of the starting time left.",
    kind: "weakness",
  },
  rushed: {
    label: "Mistakes played too fast",
    definition: "A clear mistake played in under three seconds with more than half the starting time left.",
    kind: "weakness",
  },
  found_mate: {
    label: "Checkmates found",
    definition: "A forced checkmate in three moves or fewer was available and the move played kept it.",
    kind: "strength",
  },
  took_free_piece: {
    label: "Free material taken",
    definition: "The engine's move was a capture winning at least a piece, and it was played.",
    kind: "strength",
  },
};

const WEAKNESSES: PatternTag[] = ["hung_piece", "missed_capture", "missed_mate", "allowed_mate", "time_trouble", "rushed"];
/** Each strength is measured against the weakness that is its opposite. */
const STRENGTHS: { key: StrengthTag; missedAs: PatternTag }[] = [
  { key: "found_mate", missedAs: "missed_mate" },
  { key: "took_free_piece", missedAs: "missed_capture" },
];

function dominantPhase(rows: FactRow[]): Phase | null {
  const counts: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 };
  for (const row of rows) counts[row.phase]++;
  for (const phase of ["opening", "middlegame", "endgame"] as const) {
    if (rows.length > 0 && counts[phase] * 2 >= rows.length && counts[phase] > rows.length - counts[phase]) return phase;
  }
  return null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Rolls the fact tables up into the player's profile. `tables` must be newest game first.
 * Everything here is counting: no theme exists unless the rows behind it do.
 */
export function buildProfile(tables: FactTable[], tier1: Tier1Stats | null): Profile {
  const rows = tables.flatMap((table) => table.rows);
  const movesAnalysed = rows.length;
  const base = { gamesAnalysed: tables.length, featured: false, comparison: null };

  const weaknesses: Omit<Theme, "id">[] = [];
  const belowMinimum: Profile["belowMinimum"] = [];
  for (const key of WEAKNESSES) {
    const hits = rows.filter((row) => row.patterns.includes(key));
    const games = new Set(hits.map((row) => row.gameId)).size;
    if (hits.length === 0) continue;
    if (hits.length < THEME_MIN_COUNT || games < THEME_MIN_GAMES) {
      belowMinimum.push({ key, label: THEME_COPY[key].label, count: hits.length, games });
      continue;
    }
    let lostPieces: Theme["lostPieces"] = null;
    if (key === "hung_piece") {
      lostPieces = {};
      for (const row of hits) if (row.lostPiece) lostPieces[row.lostPiece] = (lostPieces[row.lostPiece] ?? 0) + 1;
    }
    weaknesses.push({
      ...base,
      key,
      kind: "weakness",
      label: THEME_COPY[key].label,
      definition: THEME_COPY[key].definition,
      count: hits.length,
      games,
      per100Moves: movesAnalysed > 0 ? round1((hits.length / movesAnalysed) * 100) : null,
      phase: dominantPhase(hits),
      totalLoss: round1(hits.reduce((sum, row) => sum + row.loss, 0)),
      chances: null,
      lostPieces,
      factIds: hits.map((row) => row.id),
    });
  }
  // The costliest weaknesses come first; ties go to the one seen more often.
  weaknesses.sort((a, b) => b.totalLoss - a.totalLoss || b.count - a.count || a.key.localeCompare(b.key));
  weaknesses.slice(0, FEATURED_LIMIT).forEach((theme) => (theme.featured = true));

  const strengths: Omit<Theme, "id">[] = [];
  for (const { key, missedAs } of STRENGTHS) {
    const hits = rows.filter((row) => row.strengths.includes(key));
    const games = new Set(hits.map((row) => row.gameId)).size;
    if (hits.length < THEME_MIN_COUNT || games < THEME_MIN_GAMES) continue;
    const missed = rows.filter((row) => row.patterns.includes(missedAs)).length;
    strengths.push({
      ...base,
      key,
      kind: "strength",
      label: THEME_COPY[key].label,
      definition: THEME_COPY[key].definition,
      count: hits.length,
      games,
      per100Moves: movesAnalysed > 0 ? round1((hits.length / movesAnalysed) * 100) : null,
      phase: dominantPhase(hits),
      totalLoss: 0,
      chances: hits.length + missed,
      lostPieces: null,
      factIds: hits.map((row) => row.id),
    });
  }

  const records: Omit<Theme, "id">[] = (tier1?.findings ?? []).map((finding) => ({
    ...base,
    gamesAnalysed: finding.a.tally.games + finding.b.tally.games,
    key: finding.key,
    kind: "record",
    label: finding.label,
    definition: "A difference in results between two groups of games, each with at least eight games.",
    count: finding.a.tally.games,
    games: finding.a.tally.games,
    per100Moves: null,
    phase: null,
    totalLoss: 0,
    chances: null,
    lostPieces: null,
    factIds: [],
    comparison: {
      a: finding.a.name,
      aScore: Math.round(finding.a.tally.score),
      aGames: finding.a.tally.games,
      b: finding.b.name,
      bScore: Math.round(finding.b.tally.score),
      bGames: finding.b.tally.games,
    },
  }));

  const themes: Theme[] = [...weaknesses, ...strengths, ...records].map((theme, index) => ({ ...theme, id: `T${index + 1}` }));
  return {
    gamesAnalysed: tables.length,
    movesAnalysed,
    clearMistakes: rows.filter((row) => row.clear).length,
    themes,
    belowMinimum,
    enoughEvidence: weaknesses.length > 0,
  };
}

/** The themes a fact row is evidence for, as theme IDs. */
export function themesOfFact(profile: Profile, factId: string): string[] {
  return profile.themes.filter((theme) => theme.factIds.includes(factId)).map((theme) => theme.id);
}

/** Rows worth showing for a theme on the profile: the costliest first for weaknesses, newest first otherwise. */
export function evidenceRows(theme: Theme, tables: FactTable[], limit: number): FactRow[] {
  const wanted = new Set(theme.factIds);
  const rows = tables.flatMap((table) => table.rows.filter((row) => wanted.has(row.id)));
  if (theme.kind === "weakness") rows.sort((a, b) => b.loss - a.loss);
  return rows.slice(0, limit);
}

export { isKeyMoment };
