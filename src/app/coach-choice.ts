import { useSyncExternalStore } from "react";
import { DEFAULT_COACH, isCoachId, type CoachId } from "../core/coach/personas.ts";

const KEY = "fmt-coach";
const listeners = new Set<() => void>();
let current: CoachId | null = null;

function read(): CoachId {
  if (current) return current;
  try {
    const stored = window.localStorage.getItem(KEY);
    current = isCoachId(stored) ? stored : DEFAULT_COACH;
  } catch (error) {
    console.warn("Fool Me Twice: could not read the saved coach.", error);
    current = DEFAULT_COACH;
  }
  return current;
}

export function getCoach(): CoachId {
  return read();
}

export function setCoach(coach: CoachId): void {
  current = coach;
  try {
    window.localStorage.setItem(KEY, coach);
  } catch (error) {
    console.warn("Fool Me Twice: could not save the coach choice.", error);
  }
  for (const listener of listeners) listener();
}

export function subscribeCoach(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The coach the player picked. Remembered on the device. */
export function useCoach(): CoachId {
  return useSyncExternalStore(subscribeCoach, read);
}
