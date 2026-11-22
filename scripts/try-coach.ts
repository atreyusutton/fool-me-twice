// Development tool: sends real coach requests for the demo player and prints the raw replies,
// the check result and the token counts. Usage: tsx scripts/try-coach.ts [games] [coach]
import { createModelCall, DEFAULT_COACH_MODEL } from "../src/core/coach/anthropic.ts";
import { DEFAULT_COACH, isCoachId } from "../src/core/coach/personas.ts";
import { gameReviewRequest, profileSummaryRequest } from "../src/core/coach/request.ts";
import { runCoach } from "../src/core/coach/run.ts";
import { DEFAULT_ENGINE_SETTING } from "../src/core/engine.ts";
import { buildProfile } from "../src/core/profile.ts";
import { computeTier1 } from "../src/core/tier1.ts";
import { readApiKey } from "./env.ts";
import { FileKV } from "./file-kv.ts";
import { analyseGames, createApi, stopEngine } from "./pipeline.ts";

const key = readApiKey();
if (!key) {
  console.error("No API key. Put ANTHROPIC_API_KEY in .dev.vars first.");
  process.exit(1);
}
const howMany = Number(process.argv[2] ?? 2);
const coach = isCoachId(process.argv[3]) ? process.argv[3] : DEFAULT_COACH;
const kv = new FileKV(new URL(`../.cache/tune-kv-d${DEFAULT_ENGINE_SETTING.depth}.json`, import.meta.url).pathname);
const recent = await createApi(kv).getRecentGames("antwacky", { timeClass: "rapid", limit: 25 });
const { games, tables } = await analyseGames(recent.games, "antwacky", kv, DEFAULT_ENGINE_SETTING);
kv.save();
stopEngine();
const profile = buildProfile(tables, computeTier1(games.map((game) => game.summary)));
const call = createModelCall(key, DEFAULT_COACH_MODEL);

const show = (title: string, result: Awaited<ReturnType<typeof runCoach>>) => {
  console.log(`\n=== ${title}: source=${result.source}`);
  for (const [index, attempt] of result.attempts.entries()) {
    const u = attempt.usage;
    console.log(`attempt ${index + 1}: ${attempt.ok ? "passed" : `FAILED rule ${attempt.failure?.rule}: ${attempt.failure?.detail}`}`);
    console.log(`  tokens: input ${u.inputTokens}, cache write ${u.cacheWriteTokens}, cache read ${u.cacheReadTokens}, output ${u.outputTokens}`);
    console.log(`  raw: ${attempt.raw}`);
  }
};

show("profile summary", await runCoach(profileSummaryRequest(profile, games[0]!.summary.playerRating, coach), DEFAULT_COACH_MODEL, call));
const withMoments = tables.map((table, index) => ({ table, game: games[index]! })).filter(({ table }) => table.rows.some((row) => row.clear));
for (const { table, game } of withMoments.slice(0, howMany)) {
  const { request } = gameReviewRequest(game.summary, table, profile, coach);
  console.log(`\nrequest: ${JSON.stringify(request.game)} facts=${request.facts.length}`);
  show(`game vs ${game.summary.opponentName}`, await runCoach(request, DEFAULT_COACH_MODEL, call));
}
