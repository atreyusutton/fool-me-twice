// Records the demo: the demo player's latest rapid games, the engine's results, the fact tables and the
// coach's replies (with every raw attempt), into public/demo/recording.json.
//
//   npm run record-demo            reuses coach replies whose request and prompt have not changed
//   npm run record-demo -- --fresh asks the model again for everything
//
// Needs ANTHROPIC_API_KEY in .dev.vars. The app then plays the file back with no key at all.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createModelCall, DEFAULT_COACH_MODEL } from "../src/core/coach/anthropic.ts";
import { coachCacheKey } from "../src/core/coach/hash.ts";
import { PROMPT_VERSION } from "../src/core/coach/prompt.ts";
import { runCoach } from "../src/core/coach/run.ts";
import type { CoachResult } from "../src/core/coach/types.ts";
import { DEMO_GAME_COUNT, planCoachRequests, type DemoRecording } from "../src/core/demo.ts";
import { DEFAULT_ENGINE_SETTING, engineSettingKey, positionKey } from "../src/core/engine.ts";
import { FACTS_VERSION, positionsOf } from "../src/core/facts.ts";
import { summarizeGame } from "../src/core/pgn.ts";
import { buildProfile } from "../src/core/profile.ts";
import { computeTier1 } from "../src/core/tier1.ts";
import type { EngineResult, GameSummary } from "../src/core/types.ts";
import { readApiKey } from "./env.ts";
import { FileKV } from "./file-kv.ts";
import { analyseGames, createApi, stopEngine } from "./pipeline.ts";

const USERNAME = "antwacky";
const TIME_CLASS = "rapid";
const RECORD_GAME_LIMIT = 100;
const OUT = new URL("../public/demo/recording.json", import.meta.url).pathname;
const fresh = process.argv.includes("--fresh");

const apiKey = readApiKey();
if (!apiKey) {
  console.error("No API key. Copy .dev.vars.example to .dev.vars and add ANTHROPIC_API_KEY, then run this again.");
  process.exit(1);
}

const settingKey = engineSettingKey(DEFAULT_ENGINE_SETTING);
const kv = new FileKV(new URL(`../.cache/tune-kv-d${DEFAULT_ENGINE_SETTING.depth}.json`, import.meta.url).pathname);
const api = createApi(kv);

console.log(`Fetching ${USERNAME}'s latest ${TIME_CLASS} games from Chess.com`);
const player = await api.getPlayer(USERNAME);
const ratings = await api.getRatings(player.username);
const recent = await api.getRecentGames(player.username, { timeClass: TIME_CLASS, limit: RECORD_GAME_LIMIT });
const summaries = recent.games.map((game) => summarizeGame(game, player.username)).filter((summary): summary is GameSummary => summary !== null);
const analysedRaw = recent.games.filter((game) => summaries.slice(0, DEMO_GAME_COUNT).some((summary) => summary.uuid === game.uuid));

console.log(`Analysing ${analysedRaw.length} games at ${settingKey}`);
const { games, tables } = await analyseGames(analysedRaw, player.username, kv, DEFAULT_ENGINE_SETTING, (index, table, _game, seconds, fromCache) => {
  console.log(`  game ${index + 1}: ${table.rows.length} moves, ${seconds.toFixed(1)}s, ${fromCache} positions from cache`);
});
kv.save();
stopEngine();

const engine: [string, EngineResult][] = [];
const seen = new Set<string>();
for (const game of games) {
  for (const fen of positionsOf(game)) {
    const key = `${positionKey(fen)}|${settingKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await kv.get<EngineResult>("engine", key);
    if (result) engine.push([key, result]);
  }
}

const profile = buildProfile(tables, computeTier1(summaries));
const planned = planCoachRequests(summaries, tables, profile);
const model = DEFAULT_COACH_MODEL;
const previous = new Map<string, CoachResult>();
if (!fresh && existsSync(OUT)) {
  const old = JSON.parse(readFileSync(OUT, "utf8")) as DemoRecording;
  for (const [hash, result] of old.coach) previous.set(hash, result);
}

console.log(`Coach: ${planned.length} requests (${model}, prompt ${PROMPT_VERSION})`);
const call = createModelCall(apiKey, model);
const coach: [string, CoachResult][] = [];
let asked = 0;
const one = async (item: (typeof planned)[number]) => {
  const hash = await coachCacheKey(PROMPT_VERSION, model, item.request);
  let result = previous.get(hash);
  if (!result) {
    result = await runCoach(item.request, model, call);
    asked++;
  }
  coach.push([hash, result]);
  const usage = result.attempts.at(-1)?.usage;
  console.log(`  ${item.key === "profile" ? "profile" : item.key.slice(0, 8)}: ${result.source}${previous.has(hash) ? " (kept)" : ""}${usage ? `, cache read ${usage.cacheReadTokens}` : ""}`);
};
// The first request writes the shared prefix to the prompt cache; the rest then read it.
const [first, ...rest] = planned;
if (first) await one(first);
const CONCURRENCY = 4;
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let item = rest[next++]; item; item = rest[next++]) await one(item);
  }),
);

const recording: DemoRecording = {
  version: 1,
  recordedAt: new Date().toISOString(),
  username: player.username,
  timeClass: TIME_CLASS,
  engineSetting: settingKey,
  factsVersion: FACTS_VERSION,
  model,
  promptVersion: PROMPT_VERSION,
  player,
  ratings,
  games: analysedRaw,
  olderGames: summaries.slice(DEMO_GAME_COUNT),
  engine,
  facts: tables.map((table) => [`${table.gameId}|${settingKey}|f${FACTS_VERSION}`, table]),
  coach,
};
mkdirSync(new URL("../public/demo/", import.meta.url).pathname, { recursive: true });
writeFileSync(OUT, JSON.stringify(recording));
console.log(`\nWrote ${OUT}: ${games.length} games, ${engine.length} engine results, ${coach.length} coach replies (${asked} asked now).`);
console.log("Run `npm run eval` to check the recording and print the numbers for the README.");
