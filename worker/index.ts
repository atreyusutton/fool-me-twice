import { createModelCall, DEFAULT_COACH_MODEL } from "../src/core/coach/anthropic.ts";
import { PROMPT_VERSION } from "../src/core/coach/prompt.ts";
import { runCoach } from "../src/core/coach/run.ts";
import { MAX_REQUEST_BYTES, parseCoachRequest } from "../src/core/coach/schema.ts";
import { MotifError } from "../src/core/errors.ts";
import { DEFAULT_VOICE_MODEL, MAX_VOICE_BYTES, VOICE_FORMAT, VOICE_IDS, voiceCacheKey, voiceText } from "../src/core/voice.ts";

export interface Env {
  ANTHROPIC_API_KEY?: string;
  COACH_MODEL?: string;
  COACH_LIMIT?: RateLimit;
  ELEVENLABS_API_KEY?: string;
  VOICE_MODEL?: string;
  VOICE_LIMIT?: RateLimit;
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

/**
 * Reads one piece of checked coach text aloud. Like the coach route, this is not a general door:
 * it accepts a coach request and a reply, runs the same validator the screen relies on, fills in the
 * values from the fact table and only then asks for speech. Free text is refused.
 * The same voice, model and words are generated once and then served from Cloudflare's cache.
 */
async function voice(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.ELEVENLABS_API_KEY) return json({ error: "no_key", message: "No voice key is configured, so the coaches are silent." }, 503);

  const body = await request.text();
  if (body.length > MAX_VOICE_BYTES) return json({ error: "too_large" }, 413);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    // A body that is not JSON cannot be a voice request; tell the caller and stop.
    return json({ error: "invalid_json" }, 400);
  }
  const spoken = voiceText(payload);
  if (!spoken.ok) return json({ error: "invalid_request", message: spoken.error }, 400);

  const voiceId = VOICE_IDS[spoken.coach];
  const model = env.VOICE_MODEL || DEFAULT_VOICE_MODEL;
  const cacheKey = new Request(`https://voice.cache.invalid/${await voiceCacheKey(voiceId, model, spoken.text)}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-voice-cache": "hit" } });

  // Only a line that has to be generated counts against the limit.
  if (env.VOICE_LIMIT) {
    const address = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.VOICE_LIMIT.limit({ key: address });
    if (!success) return json({ error: "rate_limited", message: "Too many voice requests from this address. Try again in a minute." }, 429);
  }

  let speech: Response;
  try {
    speech = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${VOICE_FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ text: spoken.text, model_id: model }),
    });
  } catch (error) {
    console.error("voice call failed:", error);
    return json({ error: "voice_unavailable", message: "The voice service could not be reached." }, 502);
  }
  if (!speech.ok) {
    console.error("voice call refused:", speech.status, (await speech.text()).slice(0, 300));
    return json({ error: "voice_unavailable", message: "The voice service refused the request." }, 502);
  }
  const audio = await speech.arrayBuffer();
  context.waitUntil(
    caches.default.put(cacheKey, new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=2592000" } })),
  );
  return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-voice-cache": "miss" } });
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      // Tells the app whether live coaching is possible, without revealing the key.
      return json({ ok: true, coach: Boolean(env.ANTHROPIC_API_KEY), voice: Boolean(env.ELEVENLABS_API_KEY), model: env.COACH_MODEL || DEFAULT_COACH_MODEL, promptVersion: PROMPT_VERSION });
    }
    if (url.pathname === "/api/coach") return coach(request, env);
    if (url.pathname === "/api/voice") return voice(request, env, context);
    return json({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
