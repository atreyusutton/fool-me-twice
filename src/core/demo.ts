import type { PlayerInfo, RatingInfo } from "./chesscom.ts";
import { gameReviewRequest, profileSummaryRequest } from "./coach/request.ts";
import type { CoachId } from "./coach/personas.ts";
import type { CoachRequest, CoachResult } from "./coach/types.ts";
import type { Profile } from "./profile.ts";
import type { EngineResult, FactTable, GameSummary, RawGame } from "./types.ts";

/**
 * The recorded demo: one player's real games with everything Motif computed from them, saved to a file
 * by `npm run record-demo`. The app plays it back with no network, no engine and no API key.
 */
export interface DemoRecording {
  version: 1;
  /** ISO date and time of the recording. */
  recordedAt: string;
  username: string;
  timeClass: string;
  engineSetting: string;
  factsVersion: string;
  model: string;
  promptVersion: string;
  player: PlayerInfo;
  ratings: RatingInfo[];
  /** The analysed games, newest first, as Chess.com returned them. */
  games: RawGame[];
  /** Summaries of the older games that only feed the win, draw and loss record. */
  olderGames: GameSummary[];
  engine: [string, EngineResult][];
  facts: [string, FactTable][];
  /** Coach replies by cache key, each with its raw attempts and token counts. */
  coach: [string, CoachResult][];
}

export const DEMO_RECORDING_PATH = "/demo/recording.json";
export const DEMO_GAME_COUNT = 25;

export interface PlannedCoachRequest {
  /** "profile", or a game's uuid. */
  key: string;
  coach: CoachId;
  request: CoachRequest;
  factIds: Record<string, string>;
}

/**
 * Every coach request the app can make for a set of analysed games: the profile summary, then one per game
 * that has key moments. The recorder, the eval and the app all build requests through the same functions,
 * so a recorded reply is found again by its hash.
 */
export function planCoachRequests(summaries: GameSummary[], tables: FactTable[], profile: Profile, coach: CoachId): PlannedCoachRequest[] {
  const planned: PlannedCoachRequest[] = [];
  const summaryRequest = profileSummaryRequest(profile, summaries[0]?.playerRating, coach);
  if (summaryRequest.profile.themes.length > 0) planned.push({ key: "profile", coach, request: summaryRequest, factIds: {} });
  for (const table of tables) {
    const summary = summaries.find((entry) => entry.uuid === table.gameId);
    if (!summary) continue;
    const { request, factIds } = gameReviewRequest(summary, table, profile, coach);
    if (needsModel(request)) planned.push({ key: summary.uuid, coach, request, factIds });
  }
  return planned;
}

/** A game with no key moments has nothing to explain, so the model is not asked and code writes the short note. */
export function needsModel(request: CoachRequest): boolean {
  return request.kind === "profile" || request.facts.length > 0;
}

/** What `npm run eval` measured, written to `public/demo/eval.json` and shown on the Process pages. */
export interface EvalReport {
  username: string;
  games: number;
  timeClass: string;
  recordedAt: string;
  model: string;
  promptVersion: string;
  engineSetting: string;
  /** Coach requests the demo can make, and how many have a recorded reply. */
  requests: number;
  found: number;
  firstTime: number;
  afterRetry: number;
  codeBuilt: number;
  /** Recorded replies that pass the validator as it is today. */
  shownValid: number;
  byCoach: { coach: CoachId; name: string; firstTime: number; afterRetry: number; codeBuilt: number }[];
  rejectedByRule: { rule: number; count: number }[];
  usage: { calls: number; input: number; cacheRead: number; cacheWrite: number; output: number };
  /** Each way a passing reply was deliberately broken, and how many of the broken versions were rejected. */
  mutations: { name: string; tried: number; rejected: number }[];
  mutationsTried: number;
  mutationsRejected: number;
  passed: boolean;
}
export const EVAL_REPORT_PATH = "/demo/eval.json";
