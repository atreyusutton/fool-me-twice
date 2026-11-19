import { createRequire } from "node:module";
import type { EngineTransport } from "../src/core/engine.ts";

const require = createRequire(import.meta.url);

interface NodeStockfish {
  processCommand(command: string): void;
  terminate(): void;
}

/** The same Stockfish build the browser loads, run inside Node for the demo recording and measurements. */
export function createNodeEngineTransport(): EngineTransport {
  let lineListener: ((line: string) => void) | null = null;
  const stockfish = require("stockfish")("lite-single", (line: string) => lineListener?.(line)) as NodeStockfish;
  return {
    send: (command) => stockfish.processCommand(command),
    onLine: (listener) => {
      lineListener = listener;
    },
    onError: () => {
      // The Node build reports failures by throwing from processCommand, which the caller already sees.
    },
    terminate: () => stockfish.terminate(),
  };
}
