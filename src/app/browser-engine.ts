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

const engines = new Map<number, Promise<Engine>>();

/** How many engines to run side by side: leave one processor core for the page, and never more than three. */
export function engineCount(): number {
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(3, cores - 1));
}

/** One engine per slot for the whole visit. If one fails to start, the next call tries again from scratch. */
export function getBrowserEngine(setting: EngineSetting, slot = 0): Promise<Engine> {
  let engine = engines.get(slot);
  if (!engine) {
    engine = (async () => {
      const created = new Engine(createWorkerTransport(), setting);
      try {
        await created.init();
      } catch (error) {
        created.terminate();
        engines.delete(slot);
        throw error;
      }
      return created;
    })();
    engines.set(slot, engine);
  }
  return engine;
}

export function resetBrowserEngines(): void {
  for (const engine of engines.values()) {
    engine.then((started) => started.terminate()).catch(() => {
      // That engine never started, so there is nothing to stop.
    });
  }
  engines.clear();
}
