import { useSyncExternalStore } from "react";

/** The player the coaching tabs lead to when the current page is not a player's page. */
export interface PlayerRef {
  username: string;
  demo: boolean;
}

const KEY = "fmt-player";
const DEMO: PlayerRef = { username: "", demo: true };
const listeners = new Set<() => void>();
let current: PlayerRef | null = null;

function read(): PlayerRef {
  if (current) return current;
  current = DEMO;
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored && /^[a-z0-9_-]{1,50}$/.test(stored)) current = { username: stored, demo: false };
  } catch (error) {
    console.warn("Fool Me Twice: could not read the last player.", error);
  }
  return current;
}

/** Called once a player's games have loaded, so a mistyped name is never remembered. */
export function rememberPlayer(username: string, demo: boolean): void {
  const next: PlayerRef = demo ? DEMO : { username: username.toLowerCase(), demo: false };
  if (read().demo === next.demo && read().username === next.username) return;
  current = next;
  try {
    if (demo) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, next.username);
  } catch (error) {
    console.warn("Fool Me Twice: could not save the last player.", error);
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The last player whose games loaded on this device, or the demo player. */
export function useLastPlayer(): PlayerRef {
  return useSyncExternalStore(subscribe, read);
}
