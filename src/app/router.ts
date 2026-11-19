import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "how" }
  | { name: "profile"; username: string; demo: boolean }
  | { name: "game"; username: string; demo: boolean; gameId: string }
  | { name: "missing" };

export const DEMO_USERNAME = "antwacky";

export function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "how" && parts.length === 1) return { name: "how" };
  if (parts[0] === "demo") {
    if (parts.length === 1) return { name: "profile", username: DEMO_USERNAME, demo: true };
    if (parts[1] === "g" && parts[2]) return { name: "game", username: DEMO_USERNAME, demo: true, gameId: parts[2] };
  }
  if (parts[0] === "p" && parts[1]) {
    const username = parts[1].toLowerCase();
    if (parts.length === 2) return { name: "profile", username, demo: false };
    if (parts[2] === "g" && parts[3]) return { name: "game", username, demo: false, gameId: parts[3] };
  }
  return { name: "missing" };
}

export function profilePath(username: string, demo: boolean): string {
  return demo ? "/demo" : `/p/${encodeURIComponent(username.toLowerCase())}`;
}
export function gamePath(username: string, demo: boolean, gameId: string): string {
  return `${profilePath(username, demo)}/g/${encodeURIComponent(gameId)}`;
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
  if (path === window.location.pathname) return;
  window.history.pushState(null, "", path);
  for (const listener of listeners) listener();
  window.scrollTo(0, 0);
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}
