import { Chess } from "chess.js";
import { detect } from "./detectors.ts";
import { pieceName } from "./pgn.ts";
import { PIECE_VALUE, uciToSquares } from "./see.ts";
import type { EngineResult, FactRow, FactTable, ParsedGame, Phase, PieceName } from "./types.ts";
import { winChanceFromCp } from "./winchance.ts";

/** Part of the fact-table cache key. Raise it whenever the logic in this file or the detectors changes. */
export const FACTS_VERSION = "1";

/**
 * A move is a "clear" mistake when it gives up at least this many points of winning chance.
 * Below this a quick engine search can be wrong about which move was better, so the coach stays quiet.
 */
export const CLEAR_LOSS = 25;
/** The opening is the first ten moves. */
export const OPENING_MOVES = 10;
/** The endgame starts when both sides together have at most this much material besides pawns and kings. */
export const ENDGAME_MATERIAL = 20;

/** Winning chance (0 to 100) for the side to move. A forced mate is certain either way. */
export function winChance(result: EngineResult): number {
  if (result.mate !== null) return result.mate > 0 ? 100 : 0;
  return winChanceFromCp(result.cp ?? 0);
}

function nonPawnMaterial(fen: string): number {
  let total = 0;
  for (const char of fen.split(" ")[0] ?? "") {
    const lower = char.toLowerCase();
    if (lower === "n" || lower === "b" || lower === "r" || lower === "q") total += PIECE_VALUE[lower] ?? 0;
  }
  return total;
}

export function phaseOf(moveNumber: number, fenBefore: string): Phase {
  if (moveNumber <= OPENING_MOVES) return "opening";
  return nonPawnMaterial(fenBefore) <= ENDGAME_MATERIAL ? "endgame" : "middlegame";
}

/** The engine's move in the notation players read, or null if it is not legal in the position. */
function describeMove(fen: string, uci: string): { san: string; piece: PieceName; captured: PieceName | null } | null {
  try {
    const move = new Chess(fen).move(uciToSquares(uci));
    return { san: move.san, piece: pieceName(move.piece), captured: move.captured ? pieceName(move.captured) : null };
  } catch {
    // chess.js throws on an illegal move. An engine move that is not legal is never shown.
    return null;
  }
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Builds the fact table for one game. `evals[i]` is the engine result for the position before
 * ply `i + 1`; the last entry is the final position. Every chess fact the coach may use is made here.
 */
export function buildFactTable(game: ParsedGame, evals: EngineResult[], engineSetting: string): FactTable {
  if (evals.length !== game.moves.length + 1) {
    throw new Error(`Game ${game.summary.uuid}: expected ${game.moves.length + 1} engine results, got ${evals.length}.`);
  }
  const player = game.summary.playerColor;
  const playerToMoveAt = (index: number) => (index % 2 === 0) === (player === "white");
  const winLine = evals.map((result, index) => round1(playerToMoveAt(index) ? winChance(result) : 100 - winChance(result)));

  const rows: FactRow[] = [];
  // What the player's previous move missed, so a chance that stays on the board is counted once, not every move.
  let previousMissedCaptureOn: string | null = null;
  let previousMissedMate = false;
  let previousFoundMate = false;
  game.moves.forEach((move, index) => {
    if (move.color !== player) return;
    const opponentMove = index > 0 ? game.moves[index - 1] : undefined;
    const before = evals[index]!;
    const after = evals[index + 1]!;
    const winBefore = winLine[index]!;
    const winAfter = winLine[index + 1]!;
    const loss = round1(Math.max(0, winBefore - winAfter));
    const best = before.best ? describeMove(move.fenBefore, before.best) : null;
    // Without a legal engine move to compare against, the row cannot be called a clear mistake.
    const clear = loss >= CLEAR_LOSS && best !== null;
    const detected = detect({
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      playedUci: move.uci,
      opponentCapturedOn: opponentMove?.captured ? opponentMove.uci.slice(2, 4) : null,
      before,
      after,
      clear,
      clockLeft: move.clockLeft,
      timeSpent: move.timeSpent,
      timeControl: game.summary.timeControl,
    });

    const missedCaptureOn = detected.patterns.includes("missed_capture") && before.best ? before.best.slice(2, 4) : null;
    const missedMateNow = detected.patterns.includes("missed_mate");
    if (missedCaptureOn && missedCaptureOn === previousMissedCaptureOn) {
      detected.patterns = detected.patterns.filter((tag) => tag !== "missed_capture");
    }
    if (missedMateNow && previousMissedMate) {
      detected.patterns = detected.patterns.filter((tag) => tag !== "missed_mate");
    }
    // A mating sequence of several moves is one checkmate found, not several.
    const foundMateNow = detected.strengths.includes("found_mate");
    if (foundMateNow && previousFoundMate) {
      detected.strengths = detected.strengths.filter((tag) => tag !== "found_mate");
    }
    previousMissedCaptureOn = missedCaptureOn;
    previousMissedMate = missedMateNow;
    previousFoundMate = foundMateNow;

    const pieces = new Set<PieceName>([move.piece]);
    if (move.captured) pieces.add(move.captured);
    if (best) {
      pieces.add(best.piece);
      if (best.captured) pieces.add(best.captured);
    }
    if (detected.lostPiece) pieces.add(detected.lostPiece);
    if (detected.patterns.includes("missed_mate") || detected.patterns.includes("allowed_mate") || detected.strengths.includes("found_mate")) {
      pieces.add("king");
    }

    rows.push({
      id: `${game.summary.uuid}:${move.ply}`,
      gameId: game.summary.uuid,
      ply: move.ply,
      moveNumber: move.moveNumber,
      color: move.color,
      played: move.san,
      best: best?.san ?? null,
      playedBest: before.best === move.uci,
      winBefore,
      winAfter,
      loss,
      phase: phaseOf(move.moveNumber, move.fenBefore),
      clockLeft: move.clockLeft,
      timeSpent: move.timeSpent,
      clear,
      patterns: detected.patterns,
      strengths: detected.strengths,
      pieces: [...pieces],
      lostPiece: detected.lostPiece,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      playedUci: move.uci,
      bestUci: best ? before.best : null,
    });
  });
  return { gameId: game.summary.uuid, engineSetting, factsVersion: FACTS_VERSION, rows, winLine };
}

/** Every position of a game in order: the start, then the position after each move. */
export function positionsOf(game: ParsedGame): string[] {
  const first = game.moves[0];
  if (!first) return [];
  return [first.fenBefore, ...game.moves.map((move) => move.fenAfter)];
}

/** The rows the coach may talk about: clear mistakes, plus short mates missed or allowed. */
export function isKeyMoment(row: FactRow): boolean {
  return row.clear || row.patterns.includes("missed_mate") || row.patterns.includes("allowed_mate");
}

/** At most `limit` key moments, the costliest ones, returned in game order. */
export function keyMoments(table: FactTable, limit = 6): FactRow[] {
  return table.rows
    .filter(isKeyMoment)
    .sort((a, b) => b.loss - a.loss || a.ply - b.ply)
    .slice(0, limit)
    .sort((a, b) => a.ply - b.ply);
}
