import type { Ending, GameSummary, Outcome } from "./types.ts";

/** Wins, losses and draws for a group of games, with the usual score (a draw counts as half a win). */
export interface Tally {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Score as a percentage, 0 to 100. */
  score: number;
}

export interface Tier1Finding {
  key: "color_gap" | "opening_gap";
  /** What the two sides of the comparison are, in plain words. */
  label: string;
  a: { name: string; tally: Tally };
  b: { name: string; tally: Tally };
  /** Score difference in points (a minus b). */
  gap: number;
}

export interface Tier1Stats {
  total: Tally;
  byColor: { white: Tally; black: Tally };
  byOpening: { name: string; tally: Tally }[];
  winsByEnding: Partial<Record<Ending, number>>;
  lossesByEnding: Partial<Record<Ending, number>>;
  vsHigherRated: Tally;
  vsLowerRated: Tally;
  /** Seconds left on the player's clock at the end, across games with clocks. */
  clockAtEnd: { average: number; lowest: number; games: number } | null;
  findings: Tier1Finding[];
  /** Date range of the games, as Unix seconds. */
  from: number | null;
  to: number | null;
}

/** A comparison is only reported with at least this many games on each side. */
export const TIER1_MIN_GAMES_PER_SIDE = 8;
/** ...and only when the score differs by at least this many points. */
export const TIER1_MIN_GAP = 15;

export function tally(outcomes: Outcome[]): Tally {
  const wins = outcomes.filter((outcome) => outcome === "win").length;
  const losses = outcomes.filter((outcome) => outcome === "loss").length;
  const draws = outcomes.length - wins - losses;
  const score = outcomes.length === 0 ? 0 : ((wins + draws / 2) / outcomes.length) * 100;
  return { games: outcomes.length, wins, losses, draws, score };
}

const tallyOf = (games: GameSummary[]) => tally(games.map((game) => game.outcome));

function countEndings(games: GameSummary[]): Partial<Record<Ending, number>> {
  const counts: Partial<Record<Ending, number>> = {};
  for (const game of games) counts[game.ending] = (counts[game.ending] ?? 0) + 1;
  return counts;
}

/** Statistics that need no engine. Computed at once from up to 100 games. */
export function computeTier1(games: GameSummary[]): Tier1Stats {
  const white = games.filter((game) => game.playerColor === "white");
  const black = games.filter((game) => game.playerColor === "black");
  const higher = games.filter((game) => game.opponentRating > game.playerRating);
  const lower = games.filter((game) => game.opponentRating < game.playerRating);

  const openings = new Map<string, GameSummary[]>();
  for (const game of games) {
    if (!game.opening) continue;
    const list = openings.get(game.opening) ?? [];
    list.push(game);
    openings.set(game.opening, list);
  }
  const byOpening = [...openings.entries()]
    .map(([name, list]) => ({ name, tally: tallyOf(list) }))
    .sort((a, b) => b.tally.games - a.tally.games || a.name.localeCompare(b.name));

  const clocks = games.map((game) => game.finalClock).filter((clock): clock is number => clock !== null);
  const clockAtEnd =
    clocks.length > 0
      ? {
          average: clocks.reduce((sum, clock) => sum + clock, 0) / clocks.length,
          lowest: Math.min(...clocks),
          games: clocks.length,
        }
      : null;

  const findings: Tier1Finding[] = [];
  const compare = (
    key: Tier1Finding["key"],
    label: string,
    a: { name: string; games: GameSummary[] },
    b: { name: string; games: GameSummary[] },
  ) => {
    if (a.games.length < TIER1_MIN_GAMES_PER_SIDE || b.games.length < TIER1_MIN_GAMES_PER_SIDE) return;
    const tallyA = tallyOf(a.games);
    const tallyB = tallyOf(b.games);
    const gap = tallyA.score - tallyB.score;
    if (Math.abs(gap) < TIER1_MIN_GAP) return;
    findings.push({ key, label, a: { name: a.name, tally: tallyA }, b: { name: b.name, tally: tallyB }, gap });
  };
  compare("color_gap", "Results by colour", { name: "White", games: white }, { name: "Black", games: black });
  // The one opening that differs most from the rest of the player's games, if any qualifies.
  let widest: { name: string; inside: GameSummary[]; outside: GameSummary[]; gap: number } | null = null;
  for (const [name, inside] of openings) {
    const outside = games.filter((game) => game.opening !== name);
    if (inside.length < TIER1_MIN_GAMES_PER_SIDE || outside.length < TIER1_MIN_GAMES_PER_SIDE) continue;
    const gap = tallyOf(inside).score - tallyOf(outside).score;
    if (!widest || Math.abs(gap) > Math.abs(widest.gap)) widest = { name, inside, outside, gap };
  }
  if (widest) {
    compare(
      "opening_gap",
      "Results by opening",
      { name: widest.name, games: widest.inside },
      { name: "All other openings", games: widest.outside },
    );
  }

  const times = games.map((game) => game.endTime);
  return {
    total: tallyOf(games),
    byColor: { white: tallyOf(white), black: tallyOf(black) },
    byOpening,
    winsByEnding: countEndings(games.filter((game) => game.outcome === "win")),
    lossesByEnding: countEndings(games.filter((game) => game.outcome === "loss")),
    vsHigherRated: tallyOf(higher),
    vsLowerRated: tallyOf(lower),
    clockAtEnd,
    findings,
    from: times.length ? Math.min(...times) : null,
    to: times.length ? Math.max(...times) : null,
  };
}
