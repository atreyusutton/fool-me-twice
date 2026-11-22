import { createModelCall, DEFAULT_COACH_MODEL } from "../src/core/coach/anthropic.ts";
import { PROMPT_VERSION } from "../src/core/coach/prompt.ts";
import { runCoach } from "../src/core/coach/run.ts";
import { MAX_REQUEST_BYTES, parseCoachRequest } from "../src/core/coach/schema.ts";
import { MotifError } from "../src/core/errors.ts";

export interface Env {
  ANTHROPIC_API_KEY?: string;
  COACH_MODEL?: string;
  COACH_LIMIT?: RateLimit;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * The Worker exists so the API key never reaches a browser. It is not a general door to the model:
 * it accepts only a validated, size-limited fact payload and builds the prompt itself.
 */
async function coach(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "no_key", message: "No API key is configured, so the coach is off." }, 503);

  if (env.COACH_LIMIT) {
    const address = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.COACH_LIMIT.limit({ key: address });
    if (!success) return json({ error: "rate_limited", message: "Too many coach requests from this address. Try again in a minute." }, 429);
  }

  const body = await request.text();
  if (body.length > MAX_REQUEST_BYTES) return json({ error: "too_large" }, 413);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    // A body that is not JSON cannot be a coach request; tell the caller and stop.
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = parseCoachRequest(payload);
  if (!parsed.ok) return json({ error: "invalid_request", message: parsed.error }, 400);

  const model = env.COACH_MODEL || DEFAULT_COACH_MODEL;
  try {
    const result = await runCoach(parsed.request, model, createModelCall(env.ANTHROPIC_API_KEY, model));
    return json(result);
  } catch (error) {
    const message = error instanceof MotifError ? error.message : "The coach failed unexpectedly.";
    console.error("coach call failed:", error);
    return json({ error: "coach_unavailable", message }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      // Tells the app whether live coaching is possible, without revealing the key.
      return json({ ok: true, coach: Boolean(env.ANTHROPIC_API_KEY), model: env.COACH_MODEL || DEFAULT_COACH_MODEL, promptVersion: PROMPT_VERSION });
    }
    if (url.pathname === "/api/coach") return coach(request, env);
    return json({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
