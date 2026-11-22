// Copies the Stockfish web build out of node_modules so the browser can load it as a Web Worker.
// Runs after `npm install` and before dev/build, so the engine is never committed to git.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "stockfish", "bin");
const to = join(root, "public", "engine");
const files = ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"];

if (!existsSync(from)) {
  console.error("Stockfish is not installed. Run `npm install` first.");
  process.exit(1);
}
mkdirSync(to, { recursive: true });
for (const file of files) copyFileSync(join(from, file), join(to, file));
copyFileSync(join(root, "node_modules", "stockfish", "Copying.txt"), join(to, "COPYING.txt"));
console.log(`Stockfish engine copied to public/engine (${files.length} files).`);
