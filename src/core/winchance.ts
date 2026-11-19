/**
 * Winning chance (0 to 100) for the side to move, from an engine score in centipawns.
 * This is the formula Lichess publishes for its accuracy model.
 */
export function winChanceFromCp(centipawns: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1);
}
