import { Chess } from "chess.js";
import { winChance } from "./facts.ts";
import type { Color, EngineResult, FactRow, FactTable, PatternTag, Phase } from "./types.ts";

/**
 * Puzzles are the player's own clear mistakes, turned around: the position before the move, and the
 * question "what should you have played?". Everything here is code and engine. No model is involved in
 * building a puzzle or in judging an answer.
 */
export interface Puzzle {
  /** The fact row's ID: game uuid plus ply. */
  id: string;
  gameId: string;
  ply: number;
  moveNumber: number;
  color: Color;
  phase: Phase;
  fen: string;
  /** The engine's move in this position. */
  answerUci: string;
  answerSan: string;
  /** What the player played in the game. */
  playedUci: string;
  playedSan: string;
  /** Winning chance (0 to 100) with the engine's move, and what the game move gave up. */
  winBefore: number;
  loss: number;
  patterns: PatternTag[];
}

/**
 * An answer is accepted when it gives up less than this many points of winning chance compared with
 * the engine's move. Well under the 25 points that make a "clear mistake", so a near-equal second move
 * counts and a real slip does not.
 */
export const PUZZLE_TOLERANCE = 8;

function isPuzzleRow(row: FactRow): boolean {
  return row.clear && row.best !== null && row.bestUci !== null && !row.playedBest;
}

/** Every clear mistake with an engine move, costliest first. */
export function buildPuzzles(tables: FactTable[]): Puzzle[] {
  return tables
    .flatMap((table) => table.rows.filter(isPuzzleRow))
    .sort((a, b) => b.loss - a.loss || a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      gameId: row.gameId,
      ply: row.ply,
      moveNumber: row.moveNumber,
      color: row.color,
      phase: row.phase,
      fen: row.fenBefore,
      answerUci: row.bestUci!,
      answerSan: row.best!,
      playedUci: row.playedUci,
      playedSan: row.played,
      winBefore: row.winBefore,
      loss: row.loss,
      patterns: row.patterns,
    }));
}

/** Plays a long-form move on a position. Null when the move is not legal there. */
export function playMove(fen: string, uci: string): { fen: string; san: string } | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return { fen: chess.fen(), san: move.san };
  } catch {
    // chess.js throws on an illegal move; for the caller that is simply "not a move".
    return null;
  }
}

export type Verdict =
  /** The engine's own move. */
  | { kind: "best" }
  /** A different move that keeps almost all of the winning chance. */
  | { kind: "good"; loss: number }
  /** A move that gives up too much. `sameAsGame` when it repeats the game's mistake. */
  | { kind: "wrong"; loss: number; sameAsGame: boolean }
  /** The engine could not be asked, so only the engine's own move can be accepted. */
  | { kind: "unchecked" };

/**
 * Judges an attempt. `afterAttempt` is the engine's result for the position after the attempted move
 * (the opponent to move), or null when no engine is available. The engine's move and the game's move
 * need no engine: both are already in the fact table.
 */
export function judgeAttempt(puzzle: Puzzle, attemptUci: string, afterAttempt: EngineResult | null): Verdict {
  if (attemptUci === puzzle.answerUci) return { kind: "best" };
  if (attemptUci === puzzle.playedUci) return { kind: "wrong", loss: Math.round(puzzle.loss), sameAsGame: true };
  if (!afterAttempt) return { kind: "unchecked" };
  const winAfter = 100 - winChance(afterAttempt);
  const loss = Math.max(0, puzzle.winBefore - winAfter);
  return loss < PUZZLE_TOLERANCE ? { kind: "good", loss: Math.round(loss) } : { kind: "wrong", loss: Math.round(loss), sameAsGame: false };
}

export interface PuzzleProgress {
  /** Times the puzzle was finished right, and times it was missed (a wrong first answer or a shown answer). */
  solved: number;
  missed: number;
  /** Whether the latest go was right first time. */
  lastRight: boolean;
  lastTried: number;
}
export type PracticeProgress = Record<string, PuzzleProgress>;

export function recordResult(progress: PracticeProgress, puzzleId: string, right: boolean, now: number): PracticeProgress {
  const before = progress[puzzleId] ?? { solved: 0, missed: 0, lastRight: false, lastTried: 0 };
  return {
    ...progress,
    [puzzleId]: { solved: before.solved + (right ? 1 : 0), missed: before.missed + (right ? 0 : 1), lastRight: right, lastTried: now },
  };
}

/**
 * The order to practise in: puzzles missed last time first, then ones never tried, then the rest.
 * Inside each group the costliest mistake comes first. `first` puts one chosen puzzle at the front.
 */
export function practiceQueue(puzzles: Puzzle[], progress: PracticeProgress, theme: string | null, first: string | null = null): Puzzle[] {
  const group = (puzzle: Puzzle): number => {
    const seen = progress[puzzle.id];
    if (puzzle.id === first) return -1;
    if (!seen) return 1;
    return seen.lastRight ? 2 : 0;
  };
  return puzzles
    .filter((puzzle) => theme === null || puzzle.id === first || (puzzle.patterns as string[]).includes(theme))
    .map((puzzle, index) => ({ puzzle, index }))
    .sort((a, b) => group(a.puzzle) - group(b.puzzle) || a.index - b.index)
    .map((item) => item.puzzle);
}
