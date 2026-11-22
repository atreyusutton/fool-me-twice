/** The cache stores. Each one maps to a row of the caching table in the spec. */
export type StoreName = "archives" | "engine" | "facts" | "coach" | "practice";

export interface KV {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  set<T>(store: StoreName, key: string, value: T): Promise<void>;
  getMany<T>(store: StoreName, keys: string[]): Promise<(T | undefined)[]>;
}

/** In-memory cache: used in tests, in scripts, and in the browser when IndexedDB is unavailable. */
export class MemoryKV implements KV {
  private readonly stores = new Map<StoreName, Map<string, unknown>>();

  private store(name: StoreName): Map<string, unknown> {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    return store;
  }
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.store(store).get(key) as T | undefined;
  }
  async set<T>(store: StoreName, key: string, value: T): Promise<void> {
    this.store(store).set(key, value);
  }
  async getMany<T>(store: StoreName, keys: string[]): Promise<(T | undefined)[]> {
    const map = this.store(store);
    return keys.map((key) => map.get(key) as T | undefined);
  }
  /** All entries of one store, for writing the recorded demo. */
  entries(store: StoreName): [string, unknown][] {
    return [...this.store(store).entries()];
  }
}

/** Reads from a preloaded layer first (the recorded demo), then falls through to the real cache. */
export class LayeredKV implements KV {
  constructor(
    private readonly top: KV,
    private readonly base: KV,
  ) {}
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return (await this.top.get<T>(store, key)) ?? (await this.base.get<T>(store, key));
  }
  async set<T>(store: StoreName, key: string, value: T): Promise<void> {
    await this.base.set(store, key, value);
  }
  async getMany<T>(store: StoreName, keys: string[]): Promise<(T | undefined)[]> {
    const fromTop = await this.top.getMany<T>(store, keys);
    const missing = keys.filter((_, index) => fromTop[index] === undefined);
    if (missing.length === 0) return fromTop;
    const fromBase = await this.base.getMany<T>(store, missing);
    let next = 0;
    return fromTop.map((value) => value ?? fromBase[next++]);
  }
}
