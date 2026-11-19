import { ChessCom } from "../src/core/chesscom.ts";
import { analysePositions, Engine, engineSettingKey, type EngineSetting } from "../src/core/engine.ts";
import { buildFactTable, positionsOf } from "../src/core/facts.ts";
import type { KV } from "../src/core/kv.ts";
import { parseGame } from "../src/core/pgn.ts";
import type { FactTable, ParsedGame, RawGame } from "../src/core/types.ts";
import { createNodeEngineTransport } from "./node-engine.ts";

/** Chess.com asks scripts to identify themselves. No personal details are sent. */
export const SCRIPT_HEADERS = { "User-Agent": "motif-chess-coach/0.1 (take-home project; demo recorder)" };

export function createApi(kv: KV): ChessCom {
  return new ChessCom({ fetch, kv, headers: SCRIPT_HEADERS, onNotice: (notice) => console.warn(notice.message) });
}

let sharedEngine: Engine | null = null;

/** Parses and analyses games with the same code the browser runs. One engine per process. */
export async function analyseGames(
  rawGames: RawGame[],
  username: string,
  kv: KV,
  setting: EngineSetting,
  onGame?: (index: number, table: FactTable, game: ParsedGame, seconds: number, fromCache: number) => void,
): Promise<{ games: ParsedGame[]; tables: FactTable[] }> {
  const settingKey = engineSettingKey(setting);
  const getEngine = async () => {
    if (sharedEngine && sharedEngine.setting.depth !== setting.depth) throw new Error("One engine setting per process.");
    sharedEngine ??= new Engine(createNodeEngineTransport(), setting);
    await sharedEngine.init();
    return sharedEngine;
  };
  const games: ParsedGame[] = [];
  const tables: FactTable[] = [];
  for (const [index, raw] of rawGames.entries()) {
    const game = parseGame(raw, username);
    const started = performance.now();
    let fromCache = 0;
    const evals = await analysePositions(positionsOf(game), getEngine, kv, settingKey, (progress) => {
      fromCache = progress.positionsFromCache;
    });
    if (!evals) throw new Error("Analysis was stopped.");
    const table = buildFactTable(game, evals, settingKey);
    games.push(game);
    tables.push(table);
    onGame?.(index, table, game, (performance.now() - started) / 1000, fromCache);
  }
  return { games, tables };
}

export function stopEngine(): void {
  sharedEngine?.terminate();
  sharedEngine = null;
}
