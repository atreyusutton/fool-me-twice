import { existsSync, readFileSync } from "node:fs";

/** Reads the API key from the environment, or from `.dev.vars` (the same file the dev server uses). Never prints it. */
export function readApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const path = new URL("../.dev.vars", import.meta.url);
  if (!existsSync(path)) return null;
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith("ANTHROPIC_API_KEY="));
  const value = line?.slice("ANTHROPIC_API_KEY=".length).trim();
  return value && value !== "your-key-here" ? value : null;
}
