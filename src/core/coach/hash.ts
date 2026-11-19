import type { CoachRequest } from "./types.ts";

/**
 * The cache key for a coach reply: a hash of the prompt version, the model and the whole request.
 * Change any of them and the key changes, so a stale reply is never reused. The request is built by
 * code in a fixed key order, so the same facts always serialise to the same bytes.
 */
export async function coachCacheKey(promptVersion: string, model: string, request: CoachRequest): Promise<string> {
  const bytes = new TextEncoder().encode(`${promptVersion}\n${model}\n${JSON.stringify(request)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
