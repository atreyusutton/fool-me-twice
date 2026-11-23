/**
 * Measures how long the coding agent worked, from a Claude Code session log.
 *
 *   npx tsx scripts/agent-time.ts ~/.claude/projects/<project>/<session>.jsonl
 *
 * A request runs from a message I typed to the agent's last action before my next message, model calls
 * and the tools it ran included. A silent stretch of more than ten minutes inside a request is left
 * out: that is the agent waiting for me to approve something or answer a question, not working.
 * The log stays on my computer (it holds keys I pasted), so only the totals are in the repository.
 */
import { readFileSync } from "node:fs";

const MAX_SILENCE_MS = 10 * 60 * 1000;

interface Entry {
  type?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: { content?: unknown };
}

/** A message typed by the person, as opposed to a tool result sent back to the agent. */
function isRequest(entry: Entry): boolean {
  if (entry.type !== "user" || entry.isMeta) return false;
  const content = entry.message?.content;
  if (typeof content === "string") return true;
  return Array.isArray(content) && !content.some((part) => typeof part === "object" && part !== null && (part as { type?: string }).type === "tool_result");
}

const path = process.argv[2];
if (!path) {
  console.error("Give the path to a session log (.jsonl).");
  process.exit(1);
}

const entries: Entry[] = [];
for (const line of readFileSync(path, "utf8").split("\n")) {
  if (!line.trim()) continue;
  try {
    entries.push(JSON.parse(line) as Entry);
  } catch {
    // A line cut off mid-write at the end of a live log is skipped; every other line is counted.
    continue;
  }
}

const minutesByDay = new Map<string, number>();
let requests = 0;
let inRequest = false;
let day = "";
let previous = 0;
for (const entry of entries) {
  if (entry.isSidechain || !entry.timestamp || (entry.type !== "user" && entry.type !== "assistant")) continue;
  const at = Date.parse(entry.timestamp);
  if (isRequest(entry)) {
    requests++;
    inRequest = true;
    day = new Date(at).toLocaleDateString("en-CA");
  } else if (inRequest) {
    const gap = at - previous;
    if (gap <= MAX_SILENCE_MS) minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + gap / 60000);
  }
  previous = at;
}

const format = (minutes: number) => `${Math.floor(Math.round(minutes) / 60)} h ${Math.round(minutes) % 60} min`;
let total = 0;
for (const [date, minutes] of [...minutesByDay].sort()) {
  total += minutes;
  console.log(`${date}  ${format(minutes)}`);
}
console.log(`Total       ${format(total)} of agent working time across ${requests} requests`);
