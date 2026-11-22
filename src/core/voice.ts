import { MAX_REQUEST_BYTES, parseCoachRequest } from "./coach/schema.ts";
import type { CoachRequest } from "./coach/types.ts";
import { validateReply } from "./coach/validator.ts";
import { lineParts, lineSpeech, type LineValues, type Speaker } from "./lines.ts";
import { speakableText } from "./speech.ts";

/**
 * One designed voice per coach. Each was made from a written description of the book character
 * (ElevenLabs Voice Design); none imitates a real person or a film performance. To change a voice,
 * design or pick another and put its ID here.
 */
export const VOICE_IDS: Record<Speaker, string> = {
  sherlock: "AXaklIIrMHLfVKsSVoNq",
  pooh: "hepALIAWdiCCuqE3K7D7",
  hook: "CR4Y7tJe9CzAjMOXjfpR",
  dracula: "cJsKugLChZUfDWK0YV9V",
  blundy: "x03blhDaw6f54DLKVGK9",
};

export const DEFAULT_VOICE_MODEL = "eleven_multilingual_v2";
export const VOICE_FORMAT = "mp3_44100_64";

/** Which pieces of a reply to read: the headline, the closing, or one item by its place in the list. */
export type VoicePart = "headline" | "closing" | number;

/** A piece of a checked coach reply. */
export interface ReplyVoiceRequest {
  request: CoachRequest;
  /** The reply in the shape the model answers in. It is checked again before anything is spoken. */
  reply: unknown;
  parts: VoicePart[];
}
/** One of the app's fixed lines (`src/core/lines.ts`), with the values for its slots. */
export interface LineVoiceRequest {
  line: string;
  speaker: Speaker;
  values: LineValues;
}
export type VoiceRequest = ReplyVoiceRequest | LineVoiceRequest;

export const MAX_VOICE_BYTES = MAX_REQUEST_BYTES + 8_000;
export const MAX_VOICE_PARTS = 3;
export const MAX_SPOKEN_LENGTH = 900;

export type VoiceText = { ok: true; speaker: Speaker; text: string } | { ok: false; error: string };

/**
 * Turns a voice request into the words to speak, or refuses. The voice route is not a general
 * text-to-speech door. It reads two things only: a coach reply that passes the same validator as
 * the screen, with the values filled in from the fact table the request carries; or one of the
 * app's own fixed lines, whose slots take a chess move, a small number or an opening name.
 */
export function voiceText(payload: unknown): VoiceText {
  if (typeof payload !== "object" || payload === null) return { ok: false, error: "the request is not an object" };
  if ("line" in payload) {
    const { line, speaker, values } = payload as Partial<LineVoiceRequest>;
    const built = lineParts(String(line), String(speaker), values);
    if (!built.ok) return { ok: false, error: built.error };
    return { ok: true, speaker: speaker as Speaker, text: lineSpeech(built.parts) };
  }
  const { request, reply, parts } = payload as Partial<ReplyVoiceRequest>;
  const parsed = parseCoachRequest(request);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const checked = validateReply(parsed.request, reply);
  if (!checked.ok) return { ok: false, error: `the reply fails rule ${checked.rule}: ${checked.detail}` };
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > MAX_VOICE_PARTS) {
    return { ok: false, error: `parts must list one to ${MAX_VOICE_PARTS} pieces of the reply` };
  }
  const pieces: string[] = [];
  for (const part of parts as unknown[]) {
    if (part === "headline") pieces.push(checked.wire.headline);
    else if (part === "closing") pieces.push(checked.wire.closing.text);
    else if (typeof part === "number" && Number.isInteger(part) && checked.wire.items[part]) pieces.push(checked.wire.items[part].text);
    else return { ok: false, error: "parts names a piece the reply does not have" };
  }
  const text = pieces
    .map((piece) => speakableText(piece, parsed.request))
    // A headline has no full stop; give the voice a pause between pieces.
    .map((piece) => (/[.!?]$/.test(piece) ? piece : `${piece}.`))
    .join(" ");
  if (text.length > MAX_SPOKEN_LENGTH) return { ok: false, error: "the text is too long to speak" };
  return { ok: true, speaker: parsed.request.coach, text };
}

/** The cache key for one spoken line: the same voice, model and words always give the same audio. */
export async function voiceCacheKey(voiceId: string, model: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${voiceId}\n${model}\n${VOICE_FORMAT}\n${text}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
