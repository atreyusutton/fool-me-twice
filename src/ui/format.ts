import type { Ending, Outcome, TimeControl } from "../core/types.ts";

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatShortDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export const OUTCOME_WORD: Record<Outcome, string> = { win: "Won", loss: "Lost", draw: "Drew" };

export const ENDING_WORD: Record<Ending, string> = {
  checkmate: "checkmate",
  resignation: "resignation",
  time: "the clock",
  abandonment: "abandonment",
  draw: "a draw",
  other: "another way",
};

export function formatTimeControl(base: number, increment: number): string {
  const minutes = base % 60 === 0 ? String(base / 60) : (base / 60).toFixed(1);
  return increment > 0 ? `${minutes} min + ${increment}s` : `${minutes} min`;
}

/** "3-minute game" or "10 min + 5s game". Empty when the record has no time control. */
export function gameLength(timeControl: TimeControl | null): string {
  if (!timeControl) return "";
  if (timeControl.increment === 0 && timeControl.base % 60 === 0) return `${timeControl.base / 60}-minute game`;
  return `${formatTimeControl(timeControl.base, timeControl.increment)} game`;
}
