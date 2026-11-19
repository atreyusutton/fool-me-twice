import { Engine, type EngineSetting, type EngineTransport } from "../core/engine.ts";
import { MotifError } from "../core/errors.ts";

const ENGINE_URL = "/engine/stockfish-19-lite-single.js";

/** Stockfish in a Web Worker, so analysis never blocks the page. */
function createWorkerTransport(): EngineTransport {
  let worker: Worker;
  try {
    worker = new Worker(ENGINE_URL);
  } catch (error) {
    throw new MotifError("engine", "This browser could not start the chess engine.", { cause: error });
  }
  return {
    send: (command) => worker.postMessage(command),
    onLine: (listener) => {
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data === "string") listener(event.data);
      };
    },
    onError: (listener) => {
      worker.onerror = (event) => {
        event.preventDefault();
        listener(new Error(event.message || "The engine file could not be loaded."));
      };
    },
    terminate: () => worker.terminate(),
  };
}

let shared: Promise<Engine> | null = null;

/** One engine for the whole visit. If it fails to start, the next call tries again from scratch. */
export function getBrowserEngine(setting: EngineSetting): Promise<Engine> {
  shared ??= (async () => {
    const engine = new Engine(createWorkerTransport(), setting);
    try {
      await engine.init();
    } catch (error) {
      engine.terminate();
      shared = null;
      throw error;
    }
    return engine;
  })();
  return shared;
}

export function resetBrowserEngine(): void {
  const current = shared;
  shared = null;
  current?.then((engine) => engine.terminate()).catch(() => {
    // The engine never started, so there is nothing to stop.
  });
}
