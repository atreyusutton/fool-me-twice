import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MemoryKV, type StoreName } from "../src/core/kv.ts";

const STORES: StoreName[] = ["archives", "engine", "facts", "coach"];

/** A cache kept in one JSON file, so scripts do not repeat engine work between runs. */
export class FileKV extends MemoryKV {
  constructor(private readonly path: string) {
    super();
    if (existsSync(path)) {
      const saved = JSON.parse(readFileSync(path, "utf8")) as Partial<Record<StoreName, [string, unknown][]>>;
      for (const store of STORES) {
        for (const [key, value] of saved[store] ?? []) void super.set(store, key, value);
      }
    }
  }
  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const out: Partial<Record<StoreName, [string, unknown][]>> = {};
    for (const store of STORES) out[store] = this.entries(store);
    writeFileSync(this.path, JSON.stringify(out));
  }
}
