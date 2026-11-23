// Shared data shapes. Everything a player sees about chess is one of these, built by code.

export type Color = "white" | "black";
export type Outcome = "win" | "loss" | "draw";
export type Ending = "checkmate" | "resignation" | "time" | "abandonment" | "draw" | "other";
export type Phase = "opening" | "middlegame" | "endgame";
export type PieceName = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

/** One game as the Chess.com public API returns it (only the fields Motif uses). */
export interface RawGame {
  url: string;
  pgn?: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  uuid: string;
  time_class: string;
  rules: string;
  eco?: string;
  white: RawSide;
  black: RawSide;
}
export interface RawSide {
  rating: number;
  result: string;
  username: string;
}

export interface TimeControl {
  /** Starting time in seconds. */
  base: number;
  /** Seconds added after each move. */
  increment: number;
}

/** What Motif knows about a game without replaying it. */
export interface GameSummary {
  uuid: string;
  url: string;
  endTime: number;
  timeClass: string;
  timeControl: TimeControl | null;
  rated: boolean;
  playerColor: Color;
  playerRating: number;
  opponentName: string;
  opponentRating: number;
  outcome: Outcome;
  ending: Ending;
  /** Opening family, from the API's opening link (for example "Sicilian Defense"). */
  opening: string | null;
  /** Full opening name from the same link. */
  openingFull: string | null;
  /** The player's clock, in seconds, after their last move. Null when the record has no clocks. */
  finalClock: number | null;
  plies: number;
}

export interface ParsedMove {
  /** 1 for White's first move, 2 for Black's first move, and so on. */
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  /** Long form used by the engine, for example "e2e4" or "e7e8q". */
  uci: string;
  fenBefore: string;
  fenAfter: string;
  piece: PieceName;
  captured: PieceName | null;
  /** Seconds left on the mover's clock after the move. */
  clockLeft: number | null;
  /** Seconds the mover spent on the move. */
  timeSpent: number | null;
}

export interface ParsedGame {
  summary: GameSummary;
  moves: ParsedMove[];
}

/** The engine's verdict on one position, from the side to move. Exactly one of `cp` and `mate` is set. */
export interface EngineResult {
  /** Centipawns for the side to move. */
  cp: number | null;
  /** Moves to forced mate: positive when the side to move mates, negative when it gets mated. */
  mate: number | null;
  /** The engine's preferred move in long form, or null when the game is over in this position. */
  best: string | null;
  depth: number;
  /**
   * The line the engine expects from here, in long form, starting with `best`. Kept from the same
   * search that gave the score. Missing on results saved before lines were kept.
   */
  pv?: string[];
}

export type PatternTag = "hung_piece" | "missed_capture" | "missed_mate" | "allowed_mate" | "time_trouble" | "rushed";
export type StrengthTag = "found_mate" | "took_free_piece";

/** One row per move by the player. The coach may only point at these. */
export interface FactRow {
  /** Stable ID: game uuid plus ply. */
  id: string;
  gameId: string;
  ply: number;
  moveNumber: number;
  color: Color;
  /** The move played, from the game record. */
  played: string;
  /** The engine's preferred move, checked legal. Null only when the engine had none. */
  best: string | null;
  /** True when the move played is the engine's preferred move. */
  playedBest: boolean;
  /** Winning chance (0 to 100) for the player before and after the move. */
  winBefore: number;
  winAfter: number;
  /** Points of winning chance the move gave up (never negative). */
  loss: number;
  phase: Phase;
  clockLeft: number | null;
  timeSpent: number | null;
  /** True when the loss is large enough that a quick engine search is not in doubt. */
  clear: boolean;
  patterns: PatternTag[];
  strengths: StrengthTag[];
  /** Piece types involved in the move, the engine's move and any piece lost. Used by the wording check. */
  pieces: PieceName[];
  /** The piece the opponent's best reply wins, when the move left one hanging. */
  lostPiece: PieceName | null;
  fenBefore: string;
  fenAfter: string;
  /** Long form of the move played and the engine's move, for drawing arrows. */
  playedUci: string;
  bestUci: string | null;
}

export interface FactTable {
  gameId: string;
  engineSetting: string;
  factsVersion: string;
  rows: FactRow[];
  /** Winning chance for the player after every ply, starting with the opening position. */
  winLine: number[];
}
