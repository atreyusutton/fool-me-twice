import type { ThemeKey, ThemeKind } from "../profile.ts";
import type { CoachId } from "./personas.ts";
import type { Color, Ending, Outcome, PatternTag, Phase, PieceName } from "../types.ts";

/** One key moment as the coach sees it. Local IDs (F1, F2, ...) keep the request small and the same shape every time. */
export interface CoachFact {
  id: string;
  moveNumber: number;
  played: string;
  best: string;
  /** Points of winning chance given up, and the chance before and after, as whole numbers. */
  loss: number;
  winBefore: number;
  winAfter: number;
  phase: Phase;
  patterns: PatternTag[];
  /** Every piece type the coach may name when talking about this moment. */
  pieces: PieceName[];
  lostPiece: PieceName | null;
  /** Seconds spent on the move, when the record has clocks. */
  timeSpent: number | null;
  /** IDs of the themes this moment is evidence for. */
  themes: string[];
}

export interface CoachTheme {
  id: string;
  key: ThemeKey;
  kind: ThemeKind;
  label: string;
  definition: string;
  count: number;
  games: number;
  gamesAnalysed: number;
  phase: Phase | null;
  featured: boolean;
  /** For strengths: how often the chance came up. */
  chances: number | null;
  /** For record findings: the two groups compared, with scores in percent. */
  comparison: { a: string; aScore: number; aGames: number; b: string; bScore: number; bGames: number } | null;
}

export interface CoachProfile {
  /** Rating band, used only to pitch the tone. */
  ratingBand: RatingBand;
  gamesAnalysed: number;
  clearMistakes: number;
  themes: CoachTheme[];
}

export type RatingBand = "under_1000" | "1000_1400" | "1400_1800" | "over_1800" | "unknown";

export interface CoachGame {
  color: Color;
  outcome: Outcome;
  ending: Ending;
  opening: string | null;
  /** Number of moves the player made. */
  moves: number;
  /** How many clear mistakes the game had in total (the facts list holds at most six). */
  clearMistakes: number;
}

export interface GameReviewRequest {
  kind: "game";
  /** Which character speaks. It changes the wording only. */
  coach: CoachId;
  profile: CoachProfile;
  game: CoachGame;
  facts: CoachFact[];
}
export interface ProfileSummaryRequest {
  kind: "profile";
  coach: CoachId;
  profile: CoachProfile;
}
export type CoachRequest = GameReviewRequest | ProfileSummaryRequest;

/** What the model may write for one game. `text` holds words and tokens only, never a move or a number. */
export interface GameReview {
  headline: string;
  moments: { fact: string; theme: string | null; text: string }[];
  takeaway: { theme: string | null; text: string };
}
export interface ProfileSummary {
  headline: string;
  themes: { theme: string; text: string }[];
  focus: { theme: string; text: string };
}
export type CoachReply = GameReview | ProfileSummary;

/** Where the text on screen came from. Shown to the player in the cost disclosure. */
export type ReplySource = "model" | "model_retry" | "code" | "code_no_model";

export interface CoachUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CoachAttempt {
  /** The model's raw output for this attempt, kept so the eval can re-check it. */
  raw: string;
  ok: boolean;
  /** Which validator rule failed, and why. Null when the attempt passed. */
  failure: { rule: number; detail: string } | null;
  usage: CoachUsage;
}

export interface CoachResult<T extends CoachReply = CoachReply> {
  reply: T;
  source: ReplySource;
  model: string | null;
  promptVersion: string;
  attempts: CoachAttempt[];
}
