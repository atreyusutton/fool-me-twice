// Development tool: analyses the demo player's latest games and prints what the facts and detectors say,
// so thresholds can be checked by eye. Usage: tsx scripts/tune.ts [depth] [games] [--moves]
import { DEFAULT_ENGINE_SETTING } from "../src/core/engine.ts";
import { isKeyMoment } from "../src/core/facts.ts";
import { FileKV } from "./file-kv.ts";
import { analyseGames, createApi, stopEngine } from "./pipeline.ts";

const depth = Number(process.argv[2] ?? DEFAULT_ENGINE_SETTING.depth);
const count = Number(process.argv[3] ?? 25);
const showMoves = process.argv.includes("--moves");
const kv = new FileKV(new URL(`../.cache/tune-kv-d${depth}.json`, import.meta.url).pathname);
const api = createApi(kv);

const recent = await api.getRecentGames("antwacky", { timeClass: "rapid", limit: count });
let totalSeconds = 0;
let totalPositions = 0;
const tagCounts = new Map<string, { count: number; games: Set<string> }>();
let clearCount = 0;
const { tables } = await analyseGames(recent.games, "antwacky", kv, { ...DEFAULT_ENGINE_SETTING, depth }, (index, table, game, seconds, fromCache) => {
  totalSeconds += seconds;
  totalPositions += game.moves.length + 1;
  const key = table.rows.filter(isKeyMoment);
  clearCount += table.rows.filter((row) => row.clear).length;
  for (const row of table.rows) {
    for (const tag of [...row.patterns, ...row.strengths]) {
      const entry = tagCounts.get(tag) ?? { count: 0, games: new Set<string>() };
      entry.count++;
      entry.games.add(table.gameId);
      tagCounts.set(tag, entry);
    }
  }
  console.log(
    `#${index + 1} ${game.summary.outcome} as ${game.summary.playerColor} vs ${game.summary.opponentName}, ${game.moves.length} plies, ` +
      `${seconds.toFixed(1)}s (${fromCache} cached), key moments ${key.length}  ${game.summary.url}`,
  );
  if (showMoves) {
    for (const row of key) {
      console.log(
        `    ${row.moveNumber}${row.color === "white" ? "." : "..."} ${row.played} (best ${row.best}) ` +
          `${row.winBefore}→${row.winAfter} loss ${row.loss} ${row.phase} spent ${row.timeSpent}s left ${row.clockLeft}s ` +
          `[${row.patterns.join(",")}]${row.lostPiece ? ` lost:${row.lostPiece}` : ""}`,
      );
    }
  }
});
kv.save();
stopEngine();
console.log(`\ndepth ${depth}: ${tables.length} games, ${totalPositions} positions, ${totalSeconds.toFixed(1)}s engine time, ${(totalSeconds / tables.length).toFixed(1)}s per game`);
console.log(`clear mistakes: ${clearCount} (${(clearCount / tables.length).toFixed(1)} per game)`);
for (const [tag, entry] of [...tagCounts.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${tag}: ${entry.count} times in ${entry.games.size} games`);
}
// Machine-readable dump for comparing depths.
if (process.argv.includes("--json")) {
  const { writeFileSync } = await import("node:fs");
  const rows = tables.flatMap((table) => table.rows.filter(isKeyMoment).map((row) => ({ id: row.id, loss: row.loss, best: row.best, patterns: row.patterns })));
  writeFileSync(new URL(`../.cache/tune-d${depth}.json`, import.meta.url), JSON.stringify(rows));
}
