import { renderParts } from "./coach/tokens.ts";
import type { CoachRequest } from "./coach/types.ts";

const PIECES: Record<string, string> = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" };

/** A square the way it is said aloud. The file is upper case so "a4" is not read as "a four". */
const square = (name: string) => `${name[0]!.toUpperCase()}${name[1]}`;

/**
 * One move in chess notation, written out for a voice: "Nxe5+" becomes "knight takes E5, check".
 * Pure code over the notation: nothing is added that the notation does not say.
 */
export function spokenMove(san: string): string {
  let rest = san;
  let ending = "";
  if (rest.endsWith("#")) ending = ", checkmate";
  else if (rest.endsWith("+")) ending = ", check";
  rest = rest.replace(/[+#]$/, "");
  if (rest === "O-O") return `castles kingside${ending}`;
  if (rest === "O-O-O") return `castles queenside${ending}`;

  let promotion = "";
  const promoted = /=([QRBN])$/.exec(rest);
  if (promoted) {
    promotion = `, promoting to a ${PIECES[promoted[1]!]}`;
    rest = rest.slice(0, -2);
  }
  const piece = /^([KQRBN])([a-h]?)([1-8]?)(x?)([a-h][1-8])$/.exec(rest);
  if (piece) {
    const [, letter, file, rank, takes, to] = piece;
    const from = file || rank ? ` on ${file ? `the ${file!.toUpperCase()} file` : `rank ${rank}`}` : "";
    return `${PIECES[letter!]}${from} ${takes ? "takes" : "to"} ${square(to!)}${ending}`;
  }
  const pawn = /^(?:([a-h])x)?([a-h][1-8])$/.exec(rest);
  if (pawn) {
    const [, fromFile, to] = pawn;
    return `${fromFile ? `${fromFile.toUpperCase()} pawn takes ` : "pawn to "}${square(to!)}${promotion}${ending}`;
  }
  // Not a move this function knows: say it as written, never guess.
  return san;
}

/**
 * Coach text as a voice should read it: the same checked words the screen shows, with each value
 * filled in from the fact table and each move written out by `spokenMove`.
 */
export function speakableText(text: string, request: CoachRequest): string {
  return renderParts(text, request)
    .map((part) => (part.type === "move" ? spokenMove(part.text) : part.text))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
