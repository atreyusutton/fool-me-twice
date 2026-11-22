// npm run eval: checks the recorded coach replies and the validator itself, and prints the numbers
// quoted in the README. It needs no API key and makes no network calls.
//
// Part 1, the recording: is every reply the demo shows one that passes today's validator, and how often
//   did the model need its retry or the code fallback when the demo was recorded?
// Part 2, the validator: take every recorded reply that passed, break it in a known way (an invented move,
//   a number, an unknown ID, a wrong theme link, a wrong piece, a wrong phase), and confirm each is rejected.
import { existsSync, readFileSync } from "node:fs";
import { coachCacheKey } from "../src/core/coach/hash.ts";
import { COACH_IDS, PERSONAS } from "../src/core/coach/personas.ts";
import { PROMPT_VERSION } from "../src/core/coach/prompt.ts";
import { codeBuiltWire } from "../src/core/coach/run.ts";
import { gameReviewToWire, profileSummaryToWire, type CoachWire } from "../src/core/coach/schema.ts";
import type { CoachRequest, CoachResult, GameReview, ProfileSummary } from "../src/core/coach/types.ts";
import { validateReply } from "../src/core/coach/validator.ts";
import { planCoachRequests, type DemoRecording } from "../src/core/demo.ts";
import { FACTS_VERSION } from "../src/core/facts.ts";
import { summarizeGame } from "../src/core/pgn.ts";
import { buildProfile } from "../src/core/profile.ts";
import { computeTier1 } from "../src/core/tier1.ts";
import type { GameSummary, PieceName } from "../src/core/types.ts";

const PATH = new URL("../public/demo/recording.json", import.meta.url).pathname;
if (!existsSync(PATH)) {
  console.error("No recording at public/demo/recording.json. Run `npm run record-demo` first (it needs an API key).");
  process.exit(1);
}
const recording = JSON.parse(readFileSync(PATH, "utf8")) as DemoRecording;
const problems: string[] = [];
const percent = (part: number, whole: number) => (whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(1)}%`);

const summaries = [
  ...recording.games.map((game) => summarizeGame(game, recording.username)).filter((summary): summary is GameSummary => summary !== null),
  ...recording.olderGames,
];
const tables = recording.facts.map(([, table]) => table);
const profile = buildProfile(tables, computeTier1(summaries));
const planned = COACH_IDS.flatMap((coach) => planCoachRequests(summaries, tables, profile, coach));
const byCoach = new Map(COACH_IDS.map((coach) => [coach, { model: 0, model_retry: 0, code: 0, code_no_model: 0 }]));
const recorded = new Map(recording.coach);

if (recording.promptVersion !== PROMPT_VERSION) problems.push(`the recording used prompt ${recording.promptVersion}, the code has ${PROMPT_VERSION}`);
if (recording.factsVersion !== FACTS_VERSION) problems.push(`the recording used facts version ${recording.factsVersion}, the code has ${FACTS_VERSION}`);

const toWire = (request: CoachRequest, result: CoachResult): CoachWire =>
  request.kind === "game" ? gameReviewToWire(result.reply as GameReview) : profileSummaryToWire(result.reply as ProfileSummary);

// Part 1
const sources = { model: 0, model_retry: 0, code: 0, code_no_model: 0 };
const rejectedByRule = new Map<number, number>();
const rejections: string[] = [];
const usage = { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
const passing: { request: CoachRequest; wire: CoachWire }[] = [];
let shownValid = 0;
let found = 0;
for (const item of planned) {
  const hash = await coachCacheKey(PROMPT_VERSION, recording.model, item.request);
  const result = recorded.get(hash);
  if (!result) {
    problems.push(`no recorded reply for ${item.coach} on ${item.key} (the recording is out of date: run npm run record-demo)`);
    continue;
  }
  found++;
  sources[result.source]++;
  byCoach.get(item.coach)![result.source]++;
  const wire = toWire(item.request, result);
  if (validateReply(item.request, wire).ok) {
    shownValid++;
    if (result.source === "model" || result.source === "model_retry") passing.push({ request: item.request, wire });
  } else {
    problems.push(`the recorded reply for ${item.key} does not pass the validator`);
  }
  for (const attempt of result.attempts) {
    usage.calls++;
    usage.input += attempt.usage.inputTokens;
    usage.cacheRead += attempt.usage.cacheReadTokens;
    usage.cacheWrite += attempt.usage.cacheWriteTokens;
    usage.output += attempt.usage.outputTokens;
    // Each raw attempt is checked again, so the recorded verdicts are today's validator's verdicts.
    const now = validateReply(item.request, attempt.raw);
    if (now.ok !== attempt.ok) problems.push(`an attempt for ${item.key} was recorded as ${attempt.ok ? "passing" : "failing"} but today's validator disagrees`);
    if (!attempt.ok && attempt.failure) {
      rejectedByRule.set(attempt.failure.rule, (rejectedByRule.get(attempt.failure.rule) ?? 0) + 1);
      rejections.push(`${item.coach}, rule ${attempt.failure.rule}: ${attempt.failure.detail}`);
    }
  }
  // The code-built text for the same request must always pass: it is the safety net.
  if (!validateReply(item.request, codeBuiltWire(item.request)).ok) problems.push(`the code-built text for ${item.key} does not pass the validator`);
}

// Part 2
const ALL_PIECES: PieceName[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];
type Mutation = { name: string; expectRule: number; apply: (wire: CoachWire, request: CoachRequest) => CoachWire | null };
const editItem = (wire: CoachWire, index: number, patch: Partial<CoachWire["items"][number]>): CoachWire => ({
  ...wire,
  items: wire.items.map((item, position) => (position === index ? { ...item, ...patch } : item)),
});
const appendTo = (wire: CoachWire, text: string): CoachWire | null => (wire.items[0] ? editItem(wire, 0, { text: `${wire.items[0].text} ${text}` }) : null);
const MUTATIONS: Mutation[] = [
  { name: "an invented move", expectRule: 4, apply: (wire) => appendTo(wire, "Better was Nf3.") },
  { name: "an invented square", expectRule: 4, apply: (wire) => appendTo(wire, "Watch the weak point on e5.") },
  { name: "castling written out", expectRule: 4, apply: (wire) => appendTo(wire, "You could have played O-O.") },
  { name: "a number in digits", expectRule: 4, apply: (wire) => appendTo(wire, "That cost about 40 points.") },
  { name: "a count in words", expectRule: 4, apply: (wire) => ({ ...wire, closing: { ...wire.closing, text: `${wire.closing.text} You did this three times.` } }) },
  { name: "an unknown fact or theme ID", expectRule: 2, apply: (wire, request) => (wire.items[0] ? editItem(wire, 0, { ref: request.kind === "game" ? "F9" : "T99", theme: request.kind === "game" ? wire.items[0].theme : "T99" }) : null) },
  { name: "a token for an unknown ID", expectRule: 2, apply: (wire) => appendTo(wire, "The engine preferred [[best:F9]].") },
  { name: "a token for a field that does not exist", expectRule: 3, apply: (wire, request) => appendTo(wire, request.kind === "game" ? "The engine scored it [[eval:F1]]." : "It scored [[eval:T1]].") },
  {
    name: "a theme the moment is not evidence for",
    expectRule: 5,
    apply: (wire, request) => {
      if (request.kind !== "game") return null;
      for (const [index, fact] of request.facts.entries()) {
        const wrong = request.profile.themes.find((theme) => !fact.themes.includes(theme.id));
        if (wrong) return editItem(wire, index, { theme: wrong.id });
      }
      return null;
    },
  },
  {
    name: "a piece the fact row does not involve",
    expectRule: 6,
    apply: (wire, request) => {
      if (request.kind !== "game") return appendTo(wire, "You keep losing your queen.");
      for (const [index, fact] of request.facts.entries()) {
        const wrong = ALL_PIECES.find((piece) => !fact.pieces.includes(piece));
        if (wrong) return editItem(wire, index, { text: `${wire.items[index]!.text} It lost your ${wrong}.` });
      }
      return null;
    },
  },
  { name: "a piece named in the headline", expectRule: 6, apply: (wire) => ({ ...wire, headline: "The queen went astray" }) },
  {
    name: "the wrong phase of the game",
    expectRule: 7,
    apply: (wire, request) => {
      if (request.kind !== "game") return null;
      const index = request.facts.findIndex((fact) => fact.phase !== "endgame");
      return index < 0 ? null : editItem(wire, index, { text: `${wire.items[index]!.text} This was in the endgame.` });
    },
  },
  {
    name: "the wrong result",
    expectRule: 7,
    apply: (wire, request) => (request.kind !== "game" ? null : { ...wire, headline: request.game.outcome === "win" ? "How you lost this game" : "How you won this game" }),
  },
  { name: "an extra field", expectRule: 1, apply: (wire) => ({ ...wire, note: "Qh5 was strong" }) as CoachWire },
  { name: "a missing moment or theme", expectRule: 1, apply: (wire) => (wire.items.length > 0 ? { ...wire, items: wire.items.slice(1) } : null) },
];
const mutationRows: { name: string; tried: number; rejected: number; byExpectedRule: number }[] = [];
for (const mutation of MUTATIONS) {
  const row = { name: mutation.name, tried: 0, rejected: 0, byExpectedRule: 0 };
  for (const { request, wire } of passing) {
    const broken = mutation.apply(wire, request);
    if (!broken) continue;
    row.tried++;
    const verdict = validateReply(request, broken);
    if (!verdict.ok) {
      row.rejected++;
      if (verdict.rule === mutation.expectRule) row.byExpectedRule++;
    } else {
      problems.push(`the validator accepted a reply with ${mutation.name}`);
    }
  }
  mutationRows.push(row);
}
const tried = mutationRows.reduce((sum, row) => sum + row.tried, 0);
const rejected = mutationRows.reduce((sum, row) => sum + row.rejected, 0);

const modelRequests = sources.model + sources.model_retry + sources.code;
console.log("Fool Me Twice eval");
console.log("==================");
console.log(`Recording: ${recording.username}, ${recording.games.length} ${recording.timeClass} games, recorded ${recording.recordedAt.slice(0, 10)}`);
console.log(`Model: ${recording.model} · prompt ${recording.promptVersion} · engine ${recording.engineSetting}`);
console.log("");
console.log("1. Recorded coach replies");
const perCoach = planned.length / COACH_IDS.length;
console.log(`   Requests the app can make:        ${planned.length} (${COACH_IDS.length} coaches × ${perCoach}: 1 profile summary and ${perCoach - 1} game reviews each)`);
console.log(`   Found in the recording:           ${found} of ${planned.length}`);
console.log(`   Passed the validator first time:  ${sources.model} of ${modelRequests} (${percent(sources.model, modelRequests)})`);
console.log(`   Passed after one retry:           ${sources.model_retry} of ${modelRequests} (${percent(sources.model_retry, modelRequests)})`);
console.log(`   Replaced by code-built text:      ${sources.code} of ${modelRequests} (${percent(sources.code, modelRequests)})`);
console.log(`   Replies shown that pass today:    ${shownValid} of ${found} (${percent(shownValid, found)})`);
console.log("   By coach (first time / after retry / code-built):");
for (const coach of COACH_IDS) {
  const row = byCoach.get(coach)!;
  console.log(`     ${PERSONAS[coach].name.padEnd(18)} ${String(row.model).padStart(2)} / ${String(row.model_retry).padStart(2)} / ${String(row.code).padStart(2)}`);
}
if (rejections.length > 0) {
  console.log(`   Rejected attempts by rule:        ${[...rejectedByRule.entries()].sort((a, b) => a[0] - b[0]).map(([rule, count]) => `rule ${rule} × ${count}`).join(", ")}`);
  for (const line of rejections) console.log(`     - ${line}`);
}
console.log(`   Model calls: ${usage.calls} · tokens: ${usage.cacheRead.toLocaleString("en-US")} read from cache, ${usage.cacheWrite.toLocaleString("en-US")} written to cache, ${usage.input.toLocaleString("en-US")} new input, ${usage.output.toLocaleString("en-US")} output`);
console.log("");
console.log("2. Validator against deliberately broken replies");
for (const row of mutationRows) {
  console.log(`   ${row.name.padEnd(42)} ${String(row.rejected).padStart(3)} of ${String(row.tried).padStart(3)} rejected`);
}
console.log(`   Total: ${rejected} of ${tried} rejected (${percent(rejected, tried)})`);
console.log("");
if (problems.length > 0) {
  console.log(`FAILED: ${problems.length} problem(s)`);
  for (const problem of [...new Set(problems)]) console.log(`  - ${problem}`);
  process.exit(1);
}
console.log("PASSED");
