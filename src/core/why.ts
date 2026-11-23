import { Chess } from "chess.js";
import type { LinePart } from "./lines.ts";
import { pieceName } from "./pgn.ts";
import { PIECE_VALUE, uciToSquares } from "./see.ts";
import type { Color, PieceName } from "./types.ts";

/**
 * Why a move was worse, as far as it can be proven. The engine gives the line it expects after the
 * move played and after its own move. Code plays both lines out with the rules library and counts
 * what is captured and whether it ends in checkmate. Nothing here is written by a language model,
 * and when the two lines differ only in position, it says so instead of guessing.
 */

export interface LineStep {
  uci: string;
  san: string;
  /** The position after the move. */
  fen: string;
}

export interface LineOutcome {
  steps: LineStep[];
  /** Who is checkmated at the end of the line, if anyone. */
  mated: "player" | "opponent" | null;
  /** The player's pieces captured along the line, and the opponent's pieces the player captured. */
  lost: PieceName[];
  won: PieceName[];
  /** A pawn that reaches the last rank along the line. */
  playerPromotes: PieceName | null;
  opponentPromotes: PieceName | null;
}

/** A line is followed for this many moves, then on until the captures stop, and never past the limit. */
export const LINE_MOVES = 6;
export const LINE_MOVES_LIMIT = 10;

/** Plays the engine's line from a position. Stops at the first move that is not legal. */
export function followLine(fen: string, ucis: string[], player: Color): LineOutcome {
  const outcome: LineOutcome = { steps: [], mated: null, lost: [], won: [], playerPromotes: null, opponentPromotes: null };
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    // A position the rules library cannot read has no line to follow.
    return outcome;
  }
  for (const uci of ucis) {
    if (outcome.steps.length >= LINE_MOVES_LIMIT) break;
    const mover: Color = chess.turn() === "w" ? "white" : "black";
    let move;
    try {
      move = chess.move(uciToSquares(uci));
    } catch {
      // The rest of the line is dropped; what was played so far is still true.
      break;
    }
    // Past the usual length, the line goes on only while pieces are still being taken.
    if (outcome.steps.length >= LINE_MOVES && !move.captured && !move.promotion) {
      chess.undo();
      break;
    }
    if (move.captured) (mover === player ? outcome.won : outcome.lost).push(pieceName(move.captured));
    if (move.promotion) {
      if (mover === player) outcome.playerPromotes = pieceName(move.promotion);
      else outcome.opponentPromotes = pieceName(move.promotion);
    }
    outcome.steps.push({ uci, san: move.san, fen: chess.fen() });
  }
  if (chess.isCheckmate()) outcome.mated = (chess.turn() === "w" ? "white" : "black") === player ? "player" : "opponent";
  return outcome;
}

const VALUE: Record<PieceName, number> = { pawn: PIECE_VALUE.p!, knight: PIECE_VALUE.n!, bishop: PIECE_VALUE.b!, rook: PIECE_VALUE.r!, queen: PIECE_VALUE.q!, king: 0 };

/** Material gained by the player along a line, in pawns. A promotion counts as the new piece less the pawn. */
export function materialSwing(outcome: LineOutcome): number {
  const sum = (pieces: PieceName[]) => pieces.reduce((total, piece) => total + VALUE[piece], 0);
  const promotion = (piece: PieceName | null) => (piece ? VALUE[piece] - VALUE.pawn : 0);
  return sum(outcome.won) - sum(outcome.lost) + promotion(outcome.playerPromotes) - promotion(outcome.opponentPromotes);
}

const COUNT_WORD = ["no", "a", "two", "three", "four", "five", "six", "seven", "eight"];
const ORDER: PieceName[] = ["queen", "rook", "bishop", "knight", "pawn"];

/** "a knight and two pawns" */
function listPieces(pieces: PieceName[]): string {
  const groups = ORDER.map((piece) => ({ piece, count: pieces.filter((item) => item === piece).length })).filter((group) => group.count > 0);
  const words = groups.map((group) => `${COUNT_WORD[group.count] ?? group.count} ${group.piece}${group.count > 1 ? "s" : ""}`);
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** What a line comes to, in words: "you lose a knight and win a pawn". */
export function describeOutcome(outcome: LineOutcome): string {
  if (outcome.mated === "player") return "you are checkmated";
  if (outcome.mated === "opponent") return "it is checkmate";
  const parts: string[] = [];
  if (outcome.lost.length > 0 && outcome.won.length > 0) parts.push(`you lose ${listPieces(outcome.lost)} and win ${listPieces(outcome.won)}`);
  else if (outcome.lost.length > 0) parts.push(`you lose ${listPieces(outcome.lost)} and win nothing back`);
  else if (outcome.won.length > 0) parts.push(`you win ${listPieces(outcome.won)} and lose nothing`);
  if (outcome.opponentPromotes) parts.push(`your opponent's pawn becomes a ${outcome.opponentPromotes}`);
  if (outcome.playerPromotes) parts.push(`your pawn becomes a ${outcome.playerPromotes}`);
  return parts.length > 0 ? parts.join(", and ") : "no material changes hands";
}

const text = (value: string): LinePart => ({ type: "text", text: value });
const moves = (steps: LineStep[]): LinePart[] => steps.flatMap((step, index) => [...(index > 0 ? [text(" ")] : []), { type: "move", text: step.san } as LinePart]);

export interface Why {
  /** What follows the move played, what follows the engine's move, and what the difference comes to. */
  played: LinePart[];
  best: LinePart[];
  verdict: string;
  /** False when neither line shows a difference in material or a checkmate: the reason is positional. */
  proven: boolean;
}

/**
 * The explanation for one move. `afterPlayed` is the engine's line from the position after the move
 * played (the opponent moves first); `fromBefore` is its line from the position before, which starts
 * with the engine's own move.
 */
export function explain(playedSan: string, afterPlayed: LineOutcome, fromBefore: LineOutcome): Why {
  const playedMove: LinePart = { type: "move", text: playedSan, role: "played" };
  const played: LinePart[] =
    afterPlayed.steps.length === 0
      ? [text("After "), playedMove, text(", the engine has no line to show.")]
      : [text("After "), playedMove, text(", the engine expects "), ...moves(afterPlayed.steps), text(`. Along that line ${describeOutcome(afterPlayed)}.`)];

  const [first, ...rest] = fromBefore.steps;
  const best: LinePart[] = !first
    ? [text("The engine has no line to show for its own move.")]
    : [
        text("The engine's "),
        { type: "move", text: first.san, role: "best" },
        ...(rest.length > 0 ? [text(" is followed by "), ...moves(rest)] : []),
        text(`. Along that line ${describeOutcome(fromBefore)}.`),
      ];

  const gap = materialSwing(fromBefore) - materialSwing(afterPlayed);
  let verdict: string;
  let proven = true;
  if (afterPlayed.mated === "player" && fromBefore.mated !== "player") verdict = "That is the difference: your move walks into checkmate, and the engine's move does not.";
  else if (fromBefore.mated === "opponent" && afterPlayed.mated !== "opponent") verdict = "That is the difference: the engine's move forces checkmate, and yours lets it go.";
  else if (gap > 0) {
    // Only what is taken along the lines as shown is counted, and the sentence says so.
    verdict = `Counting what is taken along the two lines shown, the engine's line leaves you better off by the value of ${COUNT_WORD[gap] ?? gap} pawn${gap === 1 ? "" : "s"}.`;
  }
  else {
    proven = false;
    verdict =
      "Neither line wins more material than the other as far as the engine looked. The difference is in the position, and that is not something this app can prove, so it is not explained here.";
  }
  return { played, best, verdict, proven };
}
