import { Chess } from "chess.js";
import type { Color, Ending, GameSummary, Outcome, ParsedGame, ParsedMove, PieceName, RawGame, TimeControl } from "./types.ts";

const PIECE_NAMES: Record<string, PieceName> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

export function pieceName(symbol: string): PieceName {
  const name = PIECE_NAMES[symbol.toLowerCase()];
  if (!name) throw new Error(`Unknown piece symbol "${symbol}"`);
  return name;
}

const LOSS_CODES = new Set(["checkmated", "resigned", "timeout", "abandoned", "lose"]);
const ENDING_BY_CODE: Record<string, Ending> = {
  checkmated: "checkmate",
  resigned: "resignation",
  timeout: "time",
  abandoned: "abandonment",
};

export function outcomeFromCode(code: string): Outcome {
  if (code === "win") return "win";
  if (LOSS_CODES.has(code)) return "loss";
  return "draw";
}

/** "600" or "600+5" in seconds. Daily games ("1/86400") have no usable clock and return null. */
export function parseTimeControl(value: string): TimeControl | null {
  const match = /^(\d+)(?:\+(\d+))?$/.exec(value);
  if (!match) return null;
  return { base: Number(match[1]), increment: Number(match[2] ?? 0) };
}

/** Clock comments in move order, in seconds. Chess.com writes one `[%clk h:mm:ss(.d)]` after every move. */
export function parseClocks(pgn: string): number[] {
  const clocks: number[] = [];
  for (const match of pgn.matchAll(/\[%clk (\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g)) {
    clocks.push(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
  }
  return clocks;
}

/** Opening names from the API's opening link, e.g. ".../openings/Sicilian-Defense-Open-2...Nc6". */
export function openingFromEcoUrl(eco: string | undefined): { family: string | null; full: string | null } {
  if (!eco) return { family: null, full: null };
  const slug = eco.split("/openings/")[1];
  if (!slug) return { family: null, full: null };
  const full = decodeURIComponent(slug).replace(/-/g, " ").trim();
  // The family is the name up to its first "kind" word; the rest is the variation.
  const family = /^(.*?\b(?:Defense|Opening|Game|Gambit|Countergambit|Attack|System))\b/.exec(full)?.[1];
  const withoutMoves = full.replace(/\s+\d+\..*$/, "");
  return { family: family ?? withoutMoves.split(" ").slice(0, 3).join(" "), full };
}

function countPlies(pgn: string): number {
  const moveText = pgn.split(/\n\n/).slice(1).join(" ");
  const withoutComments = moveText.replace(/\{[^}]*\}/g, " ");
  return withoutComments.split(/\s+/).filter((token) => /^[a-hKQRBNO]/.test(token)).length;
}

/** Everything about a game that needs no replay. Returns null for games Motif does not handle. */
export function summarizeGame(raw: RawGame, username: string): GameSummary | null {
  if (raw.rules !== "chess" || !raw.pgn) return null;
  const lower = username.toLowerCase();
  const playerColor: Color | null =
    raw.white.username.toLowerCase() === lower ? "white" : raw.black.username.toLowerCase() === lower ? "black" : null;
  if (!playerColor) return null;
  const player = raw[playerColor];
  const opponent = raw[playerColor === "white" ? "black" : "white"];
  const outcome = outcomeFromCode(player.result);
  const loserCode = outcome === "win" ? opponent.result : player.result;
  const ending: Ending = outcome === "draw" ? "draw" : (ENDING_BY_CODE[loserCode] ?? "other");
  const clocks = parseClocks(raw.pgn);
  const plies = countPlies(raw.pgn);
  let finalClock: number | null = null;
  if (clocks.length === plies && plies > 0) {
    // White's clocks sit at even indexes, Black's at odd ones.
    const parity = playerColor === "white" ? 0 : 1;
    for (let index = clocks.length - 1; index >= 0; index--) {
      if (index % 2 === parity) {
        finalClock = clocks[index] ?? null;
        break;
      }
    }
  }
  const opening = openingFromEcoUrl(raw.eco);
  return {
    uuid: raw.uuid,
    url: raw.url,
    endTime: raw.end_time,
    timeClass: raw.time_class,
    timeControl: parseTimeControl(raw.time_control),
    rated: raw.rated,
    playerColor,
    playerRating: player.rating,
    opponentName: opponent.username,
    opponentRating: opponent.rating,
    outcome,
    ending,
    opening: opening.family,
    openingFull: opening.full,
    finalClock,
    plies,
  };
}

/** Replays a game with chess.js so every move and position comes from the rules, not from text. */
export function parseGame(raw: RawGame, username: string): ParsedGame {
  const summary = summarizeGame(raw, username);
  if (!summary || !raw.pgn) throw new Error(`Game ${raw.uuid} is not a standard chess game for ${username}.`);
  const chess = new Chess();
  chess.loadPgn(raw.pgn);
  const history = chess.history({ verbose: true });
  const clocks = parseClocks(raw.pgn);
  const hasClocks = clocks.length === history.length && summary.timeControl !== null;
  const base = summary.timeControl?.base ?? 0;
  const increment = summary.timeControl?.increment ?? 0;

  const moves: ParsedMove[] = history.map((move, index) => {
    const clockLeft = hasClocks ? (clocks[index] ?? null) : null;
    let timeSpent: number | null = null;
    if (clockLeft !== null) {
      const previous = index >= 2 ? (clocks[index - 2] ?? base) : base;
      // The clock shown is after the increment was added, so add it back to get thinking time.
      timeSpent = Math.max(0, Math.round((previous + increment - clockLeft) * 10) / 10);
    }
    return {
      ply: index + 1,
      moveNumber: Math.floor(index / 2) + 1,
      color: move.color === "w" ? "white" : "black",
      san: move.san,
      uci: move.from + move.to + (move.promotion ?? ""),
      fenBefore: move.before,
      fenAfter: move.after,
      piece: pieceName(move.piece),
      captured: move.captured ? pieceName(move.captured) : null,
      clockLeft,
      timeSpent,
    };
  });
  return { summary: { ...summary, plies: moves.length }, moves };
}
