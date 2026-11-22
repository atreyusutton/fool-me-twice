import { useSyncExternalStore } from "react";

export type PlayerView =
  | { name: "you" }
  | { name: "games" }
  | { name: "game"; gameId: string }
  | { name: "practice"; theme: string | null }
  | { name: "openings" }
  | { name: "opening"; key: string }
  | { name: "drill"; key: string };

export type ProcessPage = "story" | "transcripts" | "truth";

export type Route =
  | { name: "home" }
  | { name: "process"; page: ProcessPage; session: string | null }
  | { name: "player"; username: string; demo: boolean; view: PlayerView }
  | { name: "missing" };

export const DEMO_USERNAME = "antwacky";

function parseView(parts: string[]): PlayerView | null {
  if (parts.length === 0) return { name: "you" };
  const [first, second, third] = parts;
  if (first === "games" && parts.length === 1) return { name: "games" };
  if (first === "g" && second && parts.length === 2) return { name: "game", gameId: second };
  if (first === "practice" && parts.length <= 2) return { name: "practice", theme: second ?? null };
  if (first === "openings") {
    if (parts.length === 1) return { name: "openings" };
    if (second && parts.length === 2) return { name: "opening", key: second };
    if (second && third === "drill" && parts.length === 3) return { name: "drill", key: second };
  }
  return null;
}

export function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: "home" };
  // The version 1 address still works.
  if (parts[0] === "how" && parts.length === 1) return { name: "process", page: "story", session: null };
  if (parts[0] === "process") {
    if (parts.length === 1) return { name: "process", page: "story", session: null };
    if (parts[1] === "truth" && parts.length === 2) return { name: "process", page: "truth", session: null };
    if (parts[1] === "transcripts" && parts.length <= 3) return { name: "process", page: "transcripts", session: parts[2] ?? null };
    return { name: "missing" };
  }
  if (parts[0] === "demo") {
    const view = parseView(parts.slice(1));
    return view ? { name: "player", username: DEMO_USERNAME, demo: true, view } : { name: "missing" };
  }
  if (parts[0] === "p" && parts[1]) {
    const view = parseView(parts.slice(2));
    return view ? { name: "player", username: parts[1].toLowerCase(), demo: false, view } : { name: "missing" };
  }
  return { name: "missing" };
}

/** The address of a player's page. `sub` is the part after the player, for example "practice". */
export function playerPath(username: string, demo: boolean, sub = ""): string {
  const base = demo ? "/demo" : `/p/${encodeURIComponent(username.toLowerCase())}`;
  return sub ? `${base}/${sub}` : base;
}
export function gamePath(username: string, demo: boolean, gameId: string, ply?: number): string {
  return `${playerPath(username, demo, `g/${encodeURIComponent(gameId)}`)}${ply ? `?ply=${ply}` : ""}`;
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function navigate(path: string): void {
  if (path === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", path);
  for (const listener of listeners) listener();
  window.scrollTo(0, 0);
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}
export function useSearch(): string {
  return useSyncExternalStore(subscribe, () => window.location.search);
}
