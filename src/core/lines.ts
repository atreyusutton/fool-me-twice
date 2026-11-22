import { COACH_IDS, type CoachId } from "./coach/personas.ts";
import { SAN_PATTERN } from "./coach/schema.ts";
import { spokenMove } from "./speech.ts";

/**
 * The fixed lines: what the coaches say in practice and on the opening guide, and what Blundy says
 * in the drill. They are written for the app and hold no chess facts of their own. Every move, name
 * and number in them is a slot, filled in by code from the engine's check, the fact table or the
 * opening book. The screen and the voice route both build the words from this one file, so the voice
 * can only ever say a line that exists here.
 */
export type Speaker = CoachId | "blundy";

type SlotKind = "move" | "points" | "count" | "name";
interface Slot {
  kind: SlotKind;
  /** A slot that may be null, for a name the book does not have. */
  optional?: boolean;
}
export type LineValues = Record<string, string | number | null>;

/** A piece of a line before its values are filled in: plain words, or a reference to a slot. */
type Piece = string | { slot: string; role?: "played" | "best"; noun?: string } | Piece[];

interface LineDef {
  who: "coach" | "blundy";
  slots: Record<string, Slot>;
  build: (speaker: Speaker, values: LineValues) => Piece[];
}

const PRACTICE: Record<CoachId, { ask: string; best: string; good: string; same: string; wrong: string; shown: string }> = {
  sherlock: {
    ask: "Look again, and this time observe. What should it have been?",
    best: "Precisely.",
    good: "It will serve.",
    same: "The same move as in the game. You see, but you do not observe.",
    wrong: "No. That will not do.",
    shown: "Mark it well. We shall meet this position again.",
  },
  pooh: {
    ask: "Let us think about it slowly this time. What would you play?",
    best: "That is the one. What a clever thing to find.",
    good: "That will do very nicely.",
    same: "Oh, bother. That is the same move as in the game.",
    wrong: "Oh, bother. Not that one.",
    shown: "Never mind. It will come round again, and then you will know.",
  },
  hook: {
    ask: "Show me the move you should have played. And mind your form.",
    best: "Good form. It pains me to say so.",
    good: "It will pass, you dog.",
    same: "Bad form! The very same move as in the game.",
    wrong: "Bad form!",
    shown: "Remember it. You will face this again before I am done with you.",
  },
  dracula: {
    ask: "You have another chance. Few are given one. Choose.",
    best: "Yes. You learn. I am pleased.",
    good: "Acceptable.",
    same: "The same move again. I have seen this before.",
    wrong: "No. Not that.",
    shown: "Remember it. It will return. Such things always do.",
  },
};

const GUIDE: Record<CoachId, string> = {
  sherlock: "Every opening leaves a trail. This is yours, taken from your own games.",
  pooh: "This is how your games in this opening usually begin, and the place where they wander off the path.",
  hook: "A captain knows his own waters. Here is your opening, and the spot where you run aground.",
  dracula: "You return to this opening again and again. I approve of habits. Here is where yours breaks.",
};

/** What Blundy says about his own move. */
const BLUNDY_MOVES: ((move: Piece) => Piece[])[] = [
  (move) => ["I play ", move, ". I meant to do that."],
  (move) => [move, "! Is that good? It felt good."],
  (move) => ["Behold: ", move, ". Somebody told me it is in the book."],
  (move) => [move, ". I have never lost with this move. I have never won with it either."],
  (move) => ["Here comes ", move, ". My trousers are full of moves like this."],
];
export const BLUNDY_MOVE_LINES = BLUNDY_MOVES.length;

const phrases = (speaker: Speaker) => PRACTICE[speaker as CoachId];
const move: Slot = { kind: "move" };
const points: Slot = { kind: "points" };
const count: Slot = { kind: "count" };
const name: Slot = { kind: "name" };
const maybeName: Slot = { kind: "name", optional: true };

const DEFS = {
  "practice.ask": { who: "coach", slots: { played: move }, build: (s) => ["Here you played ", { slot: "played", role: "played" }, ". ", phrases(s).ask] },
  "practice.shown": { who: "coach", slots: { best: move }, build: (s) => ["The engine's move was ", { slot: "best", role: "best" }, ". ", phrases(s).shown] },
  "practice.best": { who: "coach", slots: { move }, build: (s) => [phrases(s).best, " ", { slot: "move", role: "best" }, " is the engine's move."] },
  "practice.good": {
    who: "coach",
    slots: { move, best: move, loss: points },
    build: (s) => [
      phrases(s).good,
      " ",
      { slot: "move" },
      " is not the engine's first choice, which was ",
      { slot: "best", role: "best" },
      ", but it gives up only ",
      { slot: "loss" },
      " of winning chance.",
    ],
  },
  "practice.same": {
    who: "coach",
    slots: { move, loss: points },
    build: (s) => [phrases(s).same, " ", { slot: "move", role: "played" }, " gives up ", { slot: "loss" }, " of winning chance."],
  },
  "practice.wrong": {
    who: "coach",
    slots: { move, loss: points },
    build: (s) => [phrases(s).wrong, " ", { slot: "move", role: "played" }, " gives up ", { slot: "loss" }, " of winning chance."],
  },
  "practice.unchecked": {
    who: "coach",
    slots: { move },
    build: () => ["The engine could not be started to check ", { slot: "move" }, ", so here only the engine's own move counts. Try again, or see the answer."],
  },
  "practice.set": {
    who: "coach",
    slots: { right: count, missed: count },
    build: (_s, v) => [
      "That is the set. ",
      { slot: "right", noun: "position" },
      " right first time",
      Number(v.missed) > 0 ? [", ", { slot: "missed" }, " to see again."] : ".",
    ],
  },
  "guide.intro": { who: "coach", slots: {}, build: (s) => [GUIDE[s as CoachId]] },
  "drill.start_mine": { who: "blundy", slots: { family: name }, build: () => ["This is the ", { slot: "family" }, ". It is my move. Stand back."] },
  "drill.start_yours": {
    who: "blundy",
    slots: { family: name },
    build: () => ["This is the ", { slot: "family" }, ". It is your move. Take your time. I certainly would not."],
  },
  "drill.move": {
    who: "blundy",
    slots: { move, variant: count },
    build: (_s, v) => (BLUNDY_MOVES[Number(v.variant)] ?? BLUNDY_MOVES[0]!)({ slot: "move" }),
  },
  "drill.right": {
    who: "blundy",
    slots: { move, name: maybeName },
    build: (_s, v) => [{ slot: "move", role: "best" }, ". Hmph. That is in the book.", v.name ? [" You have reached the ", { slot: "name" }, "."] : "", " Let me think."],
  },
  "drill.not_book": {
    who: "blundy",
    slots: { move },
    build: () => ["Ha! ", { slot: "move", role: "played" }, " is not in the book. Even I know that, and I am me. Take it back and try again."],
  },
  "drill.other": {
    who: "blundy",
    slots: { move, name: maybeName, family: name },
    build: (_s, v) => [
      { slot: "move", role: "played" },
      " is a book move, but it belongs to ",
      v.name ? ["the ", { slot: "name" }] : "another opening",
      ". We are drilling the ",
      { slot: "family" },
      ". Again!",
    ],
  },
  "drill.done_clean": {
    who: "blundy",
    slots: { name: maybeName },
    build: (_s, v) => ["That is the end of the book for this line", v.name ? [": the ", { slot: "name" }] : "", ". You never left it. I am as surprised as you are."],
  },
  "drill.done_slips": {
    who: "blundy",
    slots: { name: maybeName, slips: count },
    build: (_s, v) => [
      "End of the line",
      v.name ? [": the ", { slot: "name" }] : "",
      ". You wandered off ",
      { slot: "slips", noun: "time" },
      ", but you got there. I wandered off years ago.",
    ],
  },
} satisfies Record<string, LineDef>;

export type LineId = keyof typeof DEFS;
const LINES: Record<string, LineDef> = DEFS;

/** An opening's name as the book writes it: letters, digits and light punctuation, nothing else. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9' .,:;()&/-]{0,119}$/;

export interface LinePart {
  type: "text" | "move" | "number" | "name";
  text: string;
  role?: "played" | "best";
}
export type LineResult = { ok: true; parts: LinePart[] } | { ok: false; error: string };

const plural = (value: number, noun: string) => `${value} ${value === 1 ? noun : `${noun}s`}`;

/**
 * Builds one fixed line with its values filled in, or refuses. A value must be what its slot says:
 * a move in chess notation, a small whole number, or an opening name. Anything else is refused, so
 * this cannot be used to say arbitrary words.
 */
export function lineParts(id: string, speaker: string, values: unknown): LineResult {
  const def = Object.hasOwn(LINES, id) ? LINES[id]! : null;
  if (!def) return { ok: false, error: `there is no line called "${id}"` };
  const isCoach = (COACH_IDS as readonly string[]).includes(speaker);
  if (def.who === "coach" ? !isCoach : speaker !== "blundy") return { ok: false, error: `"${speaker}" does not say the line "${id}"` };
  if (typeof values !== "object" || values === null || Array.isArray(values)) return { ok: false, error: "the values are not an object" };
  const given = values as Record<string, unknown>;
  for (const key of Object.keys(given)) if (!Object.hasOwn(def.slots, key)) return { ok: false, error: `the line "${id}" has no slot "${key}"` };
  const clean: LineValues = {};
  for (const [key, slot] of Object.entries(def.slots)) {
    const value = given[key];
    if (value === null || value === undefined) {
      if (!slot.optional) return { ok: false, error: `the line "${id}" needs "${key}"` };
      clean[key] = null;
    } else if (slot.kind === "move") {
      if (typeof value !== "string" || !SAN_PATTERN.test(value)) return { ok: false, error: `"${key}" is not a chess move` };
      clean[key] = value;
    } else if (slot.kind === "name") {
      if (typeof value !== "string" || !NAME_PATTERN.test(value)) return { ok: false, error: `"${key}" is not an opening name` };
      clean[key] = value;
    } else {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 999) return { ok: false, error: `"${key}" is not a small whole number` };
      clean[key] = value;
    }
  }
  const parts: LinePart[] = [];
  const add = (piece: Piece): void => {
    if (Array.isArray(piece)) {
      piece.forEach(add);
    } else if (typeof piece === "string") {
      if (piece) parts.push({ type: "text", text: piece });
    } else {
      const slot = def.slots[piece.slot]!;
      const value = clean[piece.slot];
      if (slot.kind === "move") parts.push({ type: "move", text: String(value), ...(piece.role ? { role: piece.role } : {}) });
      else if (slot.kind === "name") parts.push({ type: "name", text: String(value) });
      else if (slot.kind === "points") parts.push({ type: "number", text: plural(Number(value), "point") });
      else parts.push({ type: piece.noun ? "number" : "text", text: piece.noun ? plural(Number(value), piece.noun) : String(value) });
    }
  };
  add(def.build(speaker as Speaker, clean));
  return { ok: true, parts };
}

/** A fixed line as a voice should read it, with each move written out in words. */
export function lineSpeech(parts: LinePart[]): string {
  return parts
    .map((part) => (part.type === "move" ? spokenMove(part.text) : part.text))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
