import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coachCacheKey } from "../src/core/coach/hash.ts";
import { COACH_IDS } from "../src/core/coach/personas.ts";
import { PROMPT_VERSION } from "../src/core/coach/prompt.ts";
import { gameReviewToWire, profileSummaryToWire } from "../src/core/coach/schema.ts";
import type { GameReview, ProfileSummary } from "../src/core/coach/types.ts";
import { validateReply } from "../src/core/coach/validator.ts";
import { planCoachRequests, type DemoRecording } from "../src/core/demo.ts";
import { engineSettingKey, DEFAULT_ENGINE_SETTING } from "../src/core/engine.ts";
import { buildFactTable, FACTS_VERSION, positionsOf } from "../src/core/facts.ts";
import { parseGame, summarizeGame } from "../src/core/pgn.ts";
import { buildProfile } from "../src/core/profile.ts";
import { computeTier1 } from "../src/core/tier1.ts";
import { positionKey } from "../src/core/engine.ts";
import type { EngineResult, GameSummary } from "../src/core/types.ts";

// The demo must work with no key, no engine and no network. These tests fail if the recording
// has fallen behind the code (a new prompt, a new facts version), which means: run `npm run record-demo`.
const recording = JSON.parse(readFileSync(new URL("../public/demo/recording.json", import.meta.url), "utf8")) as DemoRecording;
const summaries = [
  ...recording.games.map((game) => summarizeGame(game, recording.username)).filter((summary): summary is GameSummary => summary !== null),
  ...recording.olderGames,
];
const tables = recording.facts.map(([, table]) => table);

describe("the recorded demo", () => {
  it("was recorded with the current engine setting, facts version and prompt", () => {
    expect(recording.engineSetting).toBe(engineSettingKey(DEFAULT_ENGINE_SETTING));
    expect(recording.factsVersion).toBe(FACTS_VERSION);
    expect(recording.promptVersion).toBe(PROMPT_VERSION);
    expect(recording.games).toHaveLength(25);
    expect(tables).toHaveLength(25);
  });

  it("holds a checked coach reply for every request the app can make", async () => {
    const replies = new Map(recording.coach);
    const profile = buildProfile(tables, computeTier1(summaries));
    for (const coach of COACH_IDS) {
      const planned = planCoachRequests(summaries, tables, profile, coach);
      expect(planned.length).toBeGreaterThan(1);
      for (const item of planned) {
        const result = replies.get(await coachCacheKey(PROMPT_VERSION, recording.model, item.request));
        expect(result, `${coach}'s reply for ${item.key}`).toBeDefined();
        const wire = item.request.kind === "game" ? gameReviewToWire(result!.reply as GameReview) : profileSummaryToWire(result!.reply as ProfileSummary);
        expect(validateReply(item.request, wire).ok, `${coach}'s reply for ${item.key} passes the validator`).toBe(true);
      }
    }
  });

  it("holds fact tables that today's code rebuilds exactly from the recorded engine results", () => {
    const engine = new Map(recording.engine);
    for (const raw of recording.games) {
      const game = parseGame(raw, recording.username);
      const evals = positionsOf(game).map((fen) => engine.get(`${positionKey(fen)}|${recording.engineSetting}`));
      expect(evals.every((result) => result !== undefined), `engine results for ${raw.uuid}`).toBe(true);
      const rebuilt = buildFactTable(game, evals as EngineResult[], recording.engineSetting);
      expect(rebuilt).toEqual(tables.find((table) => table.gameId === raw.uuid));
    }
  });
});
