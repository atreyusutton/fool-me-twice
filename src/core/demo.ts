import type { PlayerInfo, RatingInfo } from "./chesscom.ts";
import { gameReviewRequest, profileSummaryRequest } from "./coach/request.ts";
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
  request: CoachRequest;
  factIds: Record<string, string>;
}

/**
 * Every coach request the app can make for a set of analysed games: the profile summary, then one per game
 * that has key moments. The recorder, the eval and the app all build requests through the same functions,
 * so a recorded reply is found again by its hash.
 */
export function planCoachRequests(summaries: GameSummary[], tables: FactTable[], profile: Profile): PlannedCoachRequest[] {
  const planned: PlannedCoachRequest[] = [];
  const summaryRequest = profileSummaryRequest(profile, summaries[0]?.playerRating);
  if (summaryRequest.profile.themes.length > 0) planned.push({ key: "profile", request: summaryRequest, factIds: {} });
  for (const table of tables) {
    const summary = summaries.find((entry) => entry.uuid === table.gameId);
    if (!summary) continue;
    const { request, factIds } = gameReviewRequest(summary, table, profile);
    if (needsModel(request)) planned.push({ key: summary.uuid, request, factIds });
  }
  return planned;
}

/** A game with no key moments has nothing to explain, so the model is not asked and code writes the short note. */
export function needsModel(request: CoachRequest): boolean {
  return request.kind === "profile" || request.facts.length > 0;
}
