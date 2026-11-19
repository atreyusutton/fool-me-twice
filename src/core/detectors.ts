import { Chess } from "chess.js";
import { pieceName } from "./pgn.ts";
import { staticExchange, uciToSquares } from "./see.ts";
import type { EngineResult, PatternTag, PieceName, StrengthTag, TimeControl } from "./types.ts";

/**
 * The patterns Motif can prove. Each detector is a pure function of the position, the move played
 * and the engine's output. Nothing here asks a language model anything.
 */

/** A forced mate this short is one the coach will talk about. */
export const MATE_HORIZON = 3;
/** Material, in pawns, the opponent must win for a piece to count as left hanging (rook for knight is 2). */
export const HUNG_MIN_GAIN = 2;
/** Material, in pawns, a missed capture must have won: a piece's worth. */
export const MISSED_CAPTURE_MIN_GAIN = 3;
/** "Time trouble" is less than this share of the starting time. */
export const TIME_TROUBLE_SHARE = 0.1;
/** "Rushed" is a move in under this many seconds... */
export const RUSHED_SECONDS = 3;
/** ...with more than this share of the starting time still on the clock. */
export const RUSHED_CLOCK_SHARE = 0.5;

export interface DetectorInput {
  /** Position before the player's move (player to move) and after it (opponent to move). */
  fenBefore: string;
  fenAfter: string;
  /** The move played, in long form. */
  playedUci: string;
  /** The square the opponent's previous move captured on, if it was a capture. Taking back there is a trade, not a gift. */
  opponentCapturedOn: string | null;
  /** Engine output for the position before and after the move, each from its own side to move. */
  before: EngineResult;
  after: EngineResult;
  /** True when the move gave up enough winning chance to be beyond doubt. */
  clear: boolean;
  /** Seconds on the player's clock after the move, and seconds spent on it. */
  clockLeft: number | null;
  timeSpent: number | null;
  timeControl: TimeControl | null;
}

export interface DetectorOutput {
  patterns: PatternTag[];
  strengths: StrengthTag[];
  /** The piece the opponent's best reply wins, when `hung_piece` fired. */
  lostPiece: PieceName | null;
}

const HANGABLE = new Set(["n", "b", "r", "q"]);

/** The piece left hanging by the move, if the engine's reply wins it by static exchange. */
export function hungPiece(input: Pick<DetectorInput, "fenAfter" | "after" | "clear">): PieceName | null {
  if (!input.clear || !input.after.best) return null;
  const reply = uciToSquares(input.after.best);
  const target = new Chess(input.fenAfter).get(reply.to as Parameters<Chess["get"]>[0]);
  if (!target || !HANGABLE.has(target.type)) return null;
  const gain = staticExchange(input.fenAfter, reply);
  if (gain === null || gain < HUNG_MIN_GAIN) return null;
  return pieceName(target.type);
}

/** Material the engine's move wins as a capture, unless it only takes back a piece the opponent just took. */
function freeCaptureGain(input: Pick<DetectorInput, "fenBefore" | "before" | "opponentCapturedOn">): number | null {
  if (!input.before.best) return null;
  const best = uciToSquares(input.before.best);
  if (best.to === input.opponentCapturedOn) return null;
  return staticExchange(input.fenBefore, best);
}

/** True when the engine's move was a capture winning at least a piece and the player played something else. */
export function missedCapture(
  input: Pick<DetectorInput, "fenBefore" | "before" | "playedUci" | "clear" | "opponentCapturedOn">,
): boolean {
  if (!input.clear || input.before.best === input.playedUci) return false;
  const gain = freeCaptureGain(input);
  return gain !== null && gain >= MISSED_CAPTURE_MIN_GAIN;
}

/** True when the engine's move was a capture winning at least a piece and the player played it. */
export function tookFreePiece(input: Pick<DetectorInput, "fenBefore" | "before" | "playedUci" | "opponentCapturedOn">): boolean {
  if (input.before.best !== input.playedUci) return false;
  const gain = freeCaptureGain(input);
  return gain !== null && gain >= MISSED_CAPTURE_MIN_GAIN;
}

const playerHadShortMate = (before: EngineResult) => before.mate !== null && before.mate > 0 && before.mate <= MATE_HORIZON;
/** After the player's move it is the opponent's turn: the mate is still on if the opponent is the one being mated. */
const playerStillMating = (after: EngineResult) => after.mate !== null && after.mate <= 0;

export function missedMate(input: Pick<DetectorInput, "before" | "after">): boolean {
  return playerHadShortMate(input.before) && !playerStillMating(input.after);
}
export function foundMate(input: Pick<DetectorInput, "before" | "after">): boolean {
  return playerHadShortMate(input.before) && playerStillMating(input.after);
}
export function allowedMate(input: Pick<DetectorInput, "before" | "after">): boolean {
  const alreadyBeingMated = input.before.mate !== null && input.before.mate < 0;
  const opponentHasShortMate = input.after.mate !== null && input.after.mate > 0 && input.after.mate <= MATE_HORIZON;
  return !alreadyBeingMated && opponentHasShortMate;
}

/** Seconds the player had when they started thinking about the move. */
function clockBeforeMove(input: Pick<DetectorInput, "clockLeft" | "timeSpent" | "timeControl">): number | null {
  if (input.clockLeft === null || input.timeSpent === null || !input.timeControl) return null;
  return input.clockLeft + input.timeSpent - input.timeControl.increment;
}

export function timeTrouble(input: Pick<DetectorInput, "clear" | "clockLeft" | "timeSpent" | "timeControl">): boolean {
  const clock = clockBeforeMove(input);
  if (!input.clear || clock === null || !input.timeControl) return false;
  return clock < input.timeControl.base * TIME_TROUBLE_SHARE;
}

export function rushed(input: Pick<DetectorInput, "clear" | "clockLeft" | "timeSpent" | "timeControl">): boolean {
  const clock = clockBeforeMove(input);
  if (!input.clear || clock === null || input.timeSpent === null || !input.timeControl) return false;
  return input.timeSpent < RUSHED_SECONDS && clock > input.timeControl.base * RUSHED_CLOCK_SHARE;
}

export function detect(input: DetectorInput): DetectorOutput {
  const patterns: PatternTag[] = [];
  const strengths: StrengthTag[] = [];
  const lostPiece = hungPiece(input);
  if (lostPiece) patterns.push("hung_piece");
  if (missedCapture(input)) patterns.push("missed_capture");
  if (missedMate(input)) patterns.push("missed_mate");
  if (allowedMate(input)) patterns.push("allowed_mate");
  if (timeTrouble(input)) patterns.push("time_trouble");
  if (rushed(input)) patterns.push("rushed");
  if (foundMate(input)) strengths.push("found_mate");
  if (tookFreePiece(input)) strengths.push("took_free_piece");
  return { patterns, strengths, lostPiece };
}
