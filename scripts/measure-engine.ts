// Measures engine speed and repeatability on real games. Usage: tsx scripts/measure-engine.ts [depth...]
import { readFileSync } from "node:fs";
import { Engine } from "../src/core/engine.ts";
import { parseGame } from "../src/core/pgn.ts";
import type { RawGame } from "../src/core/types.ts";
import { createNodeEngineTransport } from "./node-engine.ts";

const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/antwacky-2026-11-sample.json", import.meta.url), "utf8")) as {
  games: RawGame[];
};
// One depth per run: this engine build can only be started once per process.
const depths = process.argv.slice(2, 3).map(Number).filter(Boolean);

for (const depth of depths.length ? depths : [12]) {
  const engine = new Engine(createNodeEngineTransport(), { depth, hashMb: 16 });
  await engine.init();
  let positions = 0;
  const started = performance.now();
  const firstPass: string[] = [];
  for (const raw of fixture.games) {
    const game = parseGame(raw, "antwacky");
    const fens = [game.moves[0]!.fenBefore, ...game.moves.map((move) => move.fenAfter)];
    for (const fen of fens) {
      const result = await engine.analyse(fen);
      firstPass.push(JSON.stringify(result));
      positions++;
    }
  }
  const seconds = (performance.now() - started) / 1000;
  // Repeat the first game in reverse order: every answer must match the first pass exactly.
  const game = parseGame(fixture.games[0]!, "antwacky");
  const fens = [game.moves[0]!.fenBefore, ...game.moves.map((move) => move.fenAfter)];
  let mismatches = 0;
  for (let index = fens.length - 1; index >= 0; index--) {
    if (JSON.stringify(await engine.analyse(fens[index]!)) !== firstPass[index]) mismatches++;
  }
  console.log(
    `depth ${depth}: ${positions} positions in ${seconds.toFixed(1)}s, ${((seconds * 1000) / positions).toFixed(0)} ms each, ` +
      `${(seconds / fixture.games.length).toFixed(1)}s per game; repeat check: ${mismatches} of ${fens.length} differ`,
  );
  engine.terminate();
}
