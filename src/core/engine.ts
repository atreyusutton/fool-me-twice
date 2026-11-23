import { Chess } from "chess.js";
import { MotifError } from "./errors.ts";
import type { KV } from "./kv.ts";
import type { EngineResult } from "./types.ts";

/** How the engine is reached: a Web Worker in the browser, the same build as a module in Node scripts. */
export interface EngineTransport {
  send(command: string): void;
  /** Registers the one listener for engine output lines. */
  onLine(listener: (line: string) => void): void;
  /** Registers the one listener for a crash. */
  onError(listener: (error: unknown) => void): void;
  terminate(): void;
}

export interface EngineSetting {
  /** Fixed search depth for every position, so the same position always gives the same answer. */
  depth: number;
  /** Hash table size in MB. */
  hashMb: number;
}

export const ENGINE_BUILD = "sf19-lite-single";
export const DEFAULT_ENGINE_SETTING: EngineSetting = { depth: 14, hashMb: 16 };

/** Part of every cache key: change the build or the search and old results are never reused. */
export function engineSettingKey(setting: EngineSetting): string {
  return `${ENGINE_BUILD}/d${setting.depth}/h${setting.hashMb}`;
}

/**
 * The position without its move counters: pieces, side to move, castling rights, en passant square.
 * Two games that reach the same position share one engine result.
 */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** A position where the game is over needs no engine: the rules decide it. */
export function terminalResult(fen: string): EngineResult | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { cp: null, mate: 0, best: null, depth: 0 };
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { cp: 0, mate: null, best: null, depth: 0 };
  return null;
}

export class Engine {
  private ready: Promise<void> | null = null;
  private lineHandler: ((line: string) => void) | null = null;
  private failure: MotifError | null = null;
  private rejectCurrent: ((error: MotifError) => void) | null = null;

  constructor(
    private readonly transport: EngineTransport,
    readonly setting: EngineSetting = DEFAULT_ENGINE_SETTING,
  ) {
    transport.onLine((line) => this.lineHandler?.(line));
    transport.onError((error) => {
      this.failure = new MotifError("engine", "The chess engine stopped unexpectedly.", { cause: error });
      this.rejectCurrent?.(this.failure);
    });
  }

  private waitFor(command: string, done: (line: string) => boolean, timeoutMs: number): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      const lines: string[] = [];
      const timer = setTimeout(() => {
        cleanup();
        reject(new MotifError("engine", `The chess engine did not answer "${command.split(" ")[0]}" in time.`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.lineHandler = null;
        this.rejectCurrent = null;
      };
      this.rejectCurrent = (error) => {
        cleanup();
        reject(error);
      };
      this.lineHandler = (line) => {
        lines.push(line);
        if (done(line)) {
          cleanup();
          resolve(lines);
        }
      };
      this.transport.send(command);
    });
  }

  /** Starts the engine once. Later calls reuse the same start. */
  init(): Promise<void> {
    this.ready ??= (async () => {
      await this.waitFor("uci", (line) => line === "uciok", 30_000);
      this.transport.send(`setoption name Hash value ${this.setting.hashMb}`);
      await this.waitFor("isready", (line) => line === "readyok", 30_000);
    })();
    return this.ready;
  }

  /** One fixed-depth search. The position is sent with fresh move counters, matching `positionKey`. */
  async analyse(fen: string): Promise<EngineResult> {
    const terminal = terminalResult(fen);
    if (terminal) return terminal;
    await this.init();
    // Clearing the engine's memory first means the answer depends only on this position,
    // not on what was searched before. That is what makes a result safe to cache by position.
    this.transport.send("ucinewgame");
    await this.waitFor("isready", (line) => line === "readyok", 30_000);
    this.transport.send(`position fen ${positionKey(fen)} 0 1`);
    const lines = await this.waitFor(`go depth ${this.setting.depth}`, (line) => line.startsWith("bestmove"), 60_000);
    return parseSearchOutput(lines);
  }

  terminate(): void {
    this.transport.terminate();
  }
}

/** How many moves of the engine's expected line are kept with a result. */
export const MAX_LINE_MOVES = 12;

/** Reads the last full "info" line and the "bestmove" line of one search. */
export function parseSearchOutput(lines: string[]): EngineResult {
  let cp: number | null = null;
  let mate: number | null = null;
  let depth = 0;
  let pv: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("info") || !line.includes(" pv ")) continue;
    // Bounds are partial answers from inside a search; only exact scores count.
    if (line.includes("lowerbound") || line.includes("upperbound")) continue;
    const score = / score (cp|mate) (-?\d+)/.exec(line);
    const depthMatch = / depth (\d+)/.exec(line);
    if (!score || !depthMatch) continue;
    depth = Number(depthMatch[1]);
    pv = (/ pv (.+)$/.exec(line)?.[1] ?? "").trim().split(/\s+/).filter((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)).slice(0, MAX_LINE_MOVES);
    if (score[1] === "cp") {
      cp = Number(score[2]);
      mate = null;
    } else {
      mate = Number(score[2]);
      cp = null;
    }
  }
  const bestLine = lines.find((line) => line.startsWith("bestmove"));
  const best = bestLine ? (/^bestmove (\S+)/.exec(bestLine)?.[1] ?? null) : null;
  if ((cp === null && mate === null) || !best || best === "(none)") {
    throw new MotifError("engine", "The chess engine gave an answer Motif could not read.");
  }
  // The line is only trusted when it begins with the move the engine chose.
  return pv[0] === best ? { cp, mate, best, depth, pv } : { cp, mate, best, depth };
}

export interface AnalysisProgress {
  positionsDone: number;
  positionsTotal: number;
  /** How many of the positions done so far came from the cache instead of the engine. */
  positionsFromCache: number;
}

/**
 * Engine results for a list of positions, in order. Cached positions are returned without a search,
 * and each new result is stored as soon as it is known, so an interrupted run loses nothing.
 */
export async function analysePositions(
  fens: string[],
  engine: () => Promise<Engine>,
  kv: KV,
  settingKey: string,
  onProgress?: (progress: AnalysisProgress) => void,
  shouldStop?: () => boolean,
  /** Search again when a saved result has no line. The search is the same, so the score does not change. */
  needLine = false,
): Promise<EngineResult[] | null> {
  const keys = fens.map((fen) => `${positionKey(fen)}|${settingKey}`);
  const cached = await kv.getMany<EngineResult>("engine", keys);
  const results: EngineResult[] = [];
  let fromCache = 0;
  for (let index = 0; index < fens.length; index++) {
    if (shouldStop?.()) return null;
    let result = cached[index];
    if (result && needLine && !result.pv && result.best) result = undefined;
    if (result) {
      fromCache++;
    } else {
      const fen = fens[index]!;
      result = terminalResult(fen) ?? (await (await engine()).analyse(fen));
      await kv.set("engine", keys[index]!, result);
    }
    results.push(result);
    onProgress?.({ positionsDone: index + 1, positionsTotal: fens.length, positionsFromCache: fromCache });
  }
  return results;
}
