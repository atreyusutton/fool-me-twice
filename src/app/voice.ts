import { useSyncExternalStore } from "react";
import { gameReviewToWire, profileSummaryToWire, type CoachWire } from "../core/coach/schema.ts";
import type { CoachRequest, GameReview, ProfileSummary } from "../core/coach/types.ts";
import { lineParts, type LineId, type LinePart, type LineValues, type Speaker } from "../core/lines.ts";
import type { VoicePart, VoiceRequest } from "../core/voice.ts";

/** One piece of checked coach text that can be read aloud. */
export interface VoiceLine {
  /** The same coach and words always have the same id, so a line is fetched once per visit. */
  id: string;
  payload: VoiceRequest;
}

/** Describes a line for the voice route. The route checks the reply again before it speaks. */
export function voiceLine(request: CoachRequest, reply: GameReview | ProfileSummary, parts: VoicePart[]): VoiceLine {
  const wire: CoachWire = request.kind === "game" ? gameReviewToWire(reply as GameReview) : profileSummaryToWire(reply as ProfileSummary);
  const words = parts.map((part) => (part === "headline" ? wire.headline : part === "closing" ? wire.closing.text : (wire.items[part]?.text ?? "")));
  return { id: `${request.coach}|${words.join("|")}`, payload: { request, reply: wire, parts } };
}

/** One of the app's fixed lines, ready for the screen (`parts`) and for the voice (`voice`). */
export interface FixedLine {
  parts: LinePart[];
  voice: VoiceLine;
}

/**
 * Builds a fixed line with its values filled in. The same file of lines is used by the voice route,
 * which builds the words again from the line's name and values and never takes text from here.
 */
export function fixedLine(line: LineId, speaker: Speaker, values: LineValues = {}): FixedLine {
  const built = lineParts(line, speaker, values);
  // A value the line does not accept is a bug in the caller; say so on screen and stay silent.
  const parts: LinePart[] = built.ok ? built.parts : [{ type: "text", text: `(This line could not be built: ${built.error}.)` }];
  if (!built.ok) console.error(`Fool Me Twice: the line "${line}" could not be built.`, built.error);
  return { parts, voice: { id: `${speaker}|${line}|${JSON.stringify(values)}`, payload: { line, speaker, values } } };
}

/** True while a line is being fetched or played, so a screen can wait for it to finish. */
export function voiceBusy(): boolean {
  return state.status !== "idle";
}

export interface VoiceState {
  /** Null until the Worker has said whether a voice key is configured. */
  available: boolean | null;
  /** The player's choice: read new coach lines aloud as they appear. Off until they turn it on. */
  sound: boolean;
  /** The line being fetched or played. */
  lineId: string | null;
  status: "idle" | "loading" | "playing";
  /** Why the last line could not be played, in words for the player. */
  problem: string | null;
}

const SOUND_KEY = "fmt-sound";
const listeners = new Set<() => void>();
// One fetch per line per visit, shared by anyone who asks while it is still on its way.
const clips = new Map<string, Promise<string>>();
let audio: HTMLAudioElement | null = null;
let requestNumber = 0;

function readSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "on";
  } catch (error) {
    console.warn("Fool Me Twice: could not read the sound choice.", error);
    return false;
  }
}

let state: VoiceState = { available: null, sound: readSound(), lineId: null, status: "idle", problem: null };

function update(patch: Partial<VoiceState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (state.available === null && !checking) void checkAvailable();
  return () => listeners.delete(listener);
}

let checking = false;
async function checkAvailable(): Promise<void> {
  checking = true;
  let available = false;
  try {
    const response = await fetch("/api/health");
    if (response.ok) available = ((await response.json()) as { voice?: boolean }).voice === true;
  } catch (error) {
    console.warn("Fool Me Twice: the voice service could not be reached; the coaches stay silent.", error);
  }
  update({ available });
}

export function useVoice(): VoiceState {
  return useSyncExternalStore(subscribe, () => state);
}

export function setSound(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch (error) {
    console.warn("Fool Me Twice: could not save the sound choice.", error);
  }
  if (!on) stop();
  update({ sound: on });
}

export function stop(): void {
  requestNumber++;
  if (audio) {
    audio.pause();
    audio = null;
  }
  if (state.status !== "idle") update({ lineId: null, status: "idle" });
}

function fetchClip(line: VoiceLine): Promise<string> {
  const known = clips.get(line.id);
  if (known) return known;
  const clip = requestClip(line);
  clips.set(line.id, clip);
  // A failed fetch is not remembered, so pressing play again tries again.
  clip.catch(() => clips.delete(line.id));
  return clip;
}

async function requestClip(line: VoiceLine): Promise<string> {
  const response = await fetch("/api/voice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(line.payload) });
  if (!response.ok) {
    let message = `The voice service answered ${response.status}.`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch (error) {
      console.warn("Fool Me Twice: the voice service sent an error that could not be read.", error);
    }
    throw new Error(message);
  }
  return URL.createObjectURL(await response.blob());
}

/**
 * Reads one line aloud, stopping whatever was playing. `byPlayer` is true for a press of the play
 * button; a line started automatically may be blocked by the browser until the player has clicked
 * something, and that is not reported as a failure.
 */
export async function speak(line: VoiceLine, byPlayer: boolean): Promise<void> {
  stop();
  const mine = ++requestNumber;
  update({ lineId: line.id, status: "loading", problem: null });
  try {
    const url = await fetchClip(line);
    if (mine !== requestNumber) return;
    const element = new Audio(url);
    audio = element;
    element.addEventListener("ended", () => {
      if (audio === element) {
        audio = null;
        update({ lineId: null, status: "idle" });
      }
    });
    await element.play();
    if (mine === requestNumber) update({ status: "playing" });
  } catch (error) {
    if (mine !== requestNumber) return;
    audio = null;
    const blocked = error instanceof DOMException && error.name === "NotAllowedError";
    if (blocked && !byPlayer) {
      update({ lineId: null, status: "idle" });
      return;
    }
    console.warn("Fool Me Twice: a coach line could not be played.", error);
    update({ lineId: null, status: "idle", problem: blocked ? "The browser blocked the sound. Press play again." : `No voice just now. ${error instanceof Error ? error.message : ""}`.trim() });
  }
}
