import { openDB, type IDBPDatabase } from "idb";
import { MemoryKV, type KV, type StoreName } from "../core/kv.ts";

const STORES: StoreName[] = ["archives", "engine", "facts", "coach"];

/** The browser cache. Everything about a player's games stays here, on their machine. */
class IndexedDbKV implements KV {
  constructor(private readonly db: IDBPDatabase) {}
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return (await this.db.get(store, key)) as T | undefined;
  }
  async set<T>(store: StoreName, key: string, value: T): Promise<void> {
    await this.db.put(store, value, key);
  }
  async getMany<T>(store: StoreName, keys: string[]): Promise<(T | undefined)[]> {
    const tx = this.db.transaction(store, "readonly");
    const values = await Promise.all(keys.map((key) => tx.store.get(key)));
    await tx.done;
    return values as (T | undefined)[];
  }
}

export interface OpenedCache {
  kv: KV;
  /** False when the browser refused IndexedDB (some private windows): work is then kept for this visit only. */
  persistent: boolean;
}

export async function openCache(): Promise<OpenedCache> {
  try {
    const db = await openDB("motif", 1, {
      upgrade(database) {
        for (const store of STORES) {
          if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
        }
      },
    });
    return { kv: new IndexedDbKV(db), persistent: true };
  } catch (error) {
    console.warn("Fool Me Twice: IndexedDB is unavailable, so results are kept in memory for this visit only.", error);
    return { kv: new MemoryKV(), persistent: false };
  }
}
