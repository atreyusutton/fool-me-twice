import { Chess } from "chess.js";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Color } from "../core/types.ts";

export interface BoardArrow {
  /** Long-form move, for example "g1f3". */
  uci: string;
  kind: "played" | "best";
}

const FILES = "abcdefgh";
const PIECE_WORD: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const PROMOTIONS = ["q", "r", "b", "n"] as const;

/** Pieces by square name, read from the first field of a FEN. */
function piecesFromFen(fen: string): Map<string, string> {
  const pieces = new Map<string, string>();
  const rows = (fen.split(" ")[0] ?? "").split("/");
  rows.forEach((row, rowIndex) => {
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
      } else {
        pieces.set(`${FILES[file]}${8 - rowIndex}`, char);
        file++;
      }
    }
  });
  return pieces;
}

function squareCentre(square: string, orientation: Color): { x: number; y: number } {
  const file = FILES.indexOf(square[0] ?? "a");
  const rank = Number(square[1] ?? "1") - 1;
  return orientation === "white" ? { x: file + 0.5, y: 7 - rank + 0.5 } : { x: 7 - file + 0.5, y: rank + 0.5 };
}

/** Legal moves of the side to move, by starting square. The rules library is the only judge of legality. */
function legalMoves(fen: string): Map<string, { to: string; promotion: boolean }[]> {
  const moves = new Map<string, { to: string; promotion: boolean }[]>();
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch (error) {
    console.warn("Fool Me Twice: the board was given a position the rules library could not read.", error);
    return moves;
  }
  for (const move of chess.moves({ verbose: true })) {
    const list = moves.get(move.from) ?? [];
    if (!list.some((entry) => entry.to === move.to)) list.push({ to: move.to, promotion: move.promotion !== undefined });
    moves.set(move.from, list);
  }
  return moves;
}

/**
 * The board. Every piece comes from a FEN produced by the rules library. Without `onMove` it only shows
 * a position. With `onMove` the side to move can be played by clicking two squares, by dragging, or with
 * the keyboard (each square is a button); only legal moves are offered, and the move is reported in long
 * form (for example "e7e8q"). The board never decides whether a move is good.
 */
export function Board({
  fen,
  orientation,
  lastMove,
  arrows = [],
  label,
  onMove,
  tint,
  slide = false,
}: {
  fen: string;
  orientation: Color;
  lastMove?: string | null;
  arrows?: BoardArrow[];
  label: string;
  onMove?: (uci: string) => void;
  /** Colours the last move's squares: set by code from the engine's verdict. */
  tint?: "right" | "wrong" | null;
  /** Shows the last move arriving: the piece slides from the square it left. Off for moves the player dragged. */
  slide?: boolean;
}) {
  const pieces = piecesFromFen(fen);
  const ranks = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "white" ? [...FILES] : [...FILES].reverse();
  const marked = new Set(lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : []);
  const interactive = onMove !== undefined;
  const legal = useMemo(() => (interactive ? legalMoves(fen) : new Map<string, { to: string; promotion: boolean }[]>()), [fen, interactive]);

  // Selections belong to one position; they are dropped when the position changes.
  const [pick, setPick] = useState<{ fen: string; square: string } | null>(null);
  const [promotion, setPromotion] = useState<{ fen: string; from: string; to: string } | null>(null);
  const [drag, setDrag] = useState<{ square: string; dx: number; dy: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ square: string; x: number; y: number; moved: boolean } | null>(null);
  const picked = pick && pick.fen === fen ? pick.square : null;
  const pending = promotion && promotion.fen === fen ? promotion : null;
  const targets = new Map((picked ? (legal.get(picked) ?? []) : []).map((entry) => [entry.to, entry]));

  const attempt = (from: string, to: string) => {
    const move = legal.get(from)?.find((entry) => entry.to === to);
    if (!move || !onMove) return false;
    setPick(null);
    if (move.promotion) setPromotion({ fen, from, to });
    else onMove(`${from}${to}`);
    return true;
  };

  const press = (square: string) => {
    if (!interactive || pending) return;
    if (picked && picked !== square && attempt(picked, square)) return;
    setPick(legal.has(square) && picked !== square ? { fen, square } : null);
  };

  const squareAt = (clientX: number, clientY: number): string | null => {
    const box = boardRef.current?.getBoundingClientRect();
    if (!box) return null;
    const column = Math.floor(((clientX - box.left) / box.width) * 8);
    const row = Math.floor(((clientY - box.top) / box.height) * 8);
    if (column < 0 || column > 7 || row < 0 || row > 7) return null;
    return `${files[column]}${ranks[row]}`;
  };

  const onPointerDown = (event: ReactPointerEvent, square: string) => {
    if (!interactive || pending || event.button !== 0 || !legal.has(square)) return;
    dragStart.current = { square, x: event.clientX, y: event.clientY, moved: false };
  };

  useEffect(() => {
    if (!interactive) return;
    const onPointerMove = (event: PointerEvent) => {
      const start = dragStart.current;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 6) return;
      start.moved = true;
      setPick({ fen, square: start.square });
      setDrag({ square: start.square, dx, dy });
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = dragStart.current;
      dragStart.current = null;
      setDrag(null);
      if (!start?.moved) return;
      const target = squareAt(event.clientX, event.clientY);
      if (target && target !== start.square) attempt(start.square, target);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    // The handlers read the current position through `fen` and `legal`; both are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, fen, legal, orientation]);

  const whiteToMove = fen.split(" ")[1] !== "b";
  // How far, in squares as drawn, the last move's piece travelled to reach its square.
  const arrival = slide && lastMove ? { square: lastMove.slice(2, 4), from: squareCentre(lastMove.slice(0, 2), orientation), to: squareCentre(lastMove.slice(2, 4), orientation) } : null;
  return (
    <div className="board-wrap">
      <div
        ref={boardRef}
        className={`board${interactive ? " playable" : ""}${tint ? ` tint-${tint}` : ""}`}
        role={interactive ? "group" : "img"}
        aria-label={label}
      >
        {ranks.map((rank, rowIndex) =>
          files.map((file, columnIndex) => {
            const square = `${file}${rank}`;
            const piece = pieces.get(square);
            const dark = (FILES.indexOf(file) + rank) % 2 === 1;
            const target = targets.get(square);
            const classes = `sq ${dark ? "dark" : "light"}${marked.has(square) ? " marked" : ""}${picked === square ? " pick" : ""}${
              target ? (piece ? " target capture" : " target") : ""
            }`;
            const pieceName = piece ? `${piece === piece.toUpperCase() ? "white" : "black"} ${PIECE_WORD[piece.toLowerCase()]}` : null;
            const content = (
              <>
                {columnIndex === 0 && <span className="coord rank">{rank}</span>}
                {rowIndex === 7 && <span className="coord file">{file}</span>}
                {piece &&
                  (arrival?.square === square ? (
                    <img
                      // A new key for each position, so the slide plays again for each move.
                      key={fen}
                      src={`/pieces/${piece === piece.toUpperCase() ? "w" : "b"}${piece.toUpperCase()}.svg`}
                      alt={interactive ? "" : (pieceName ?? "")}
                      draggable={false}
                      className="arriving"
                      style={{ "--dx": arrival.from.x - arrival.to.x, "--dy": arrival.from.y - arrival.to.y } as React.CSSProperties}
                    />
                  ) : (
                    <img
                      src={`/pieces/${piece === piece.toUpperCase() ? "w" : "b"}${piece.toUpperCase()}.svg`}
                      alt={interactive ? "" : (pieceName ?? "")}
                      draggable={false}
                      className={drag?.square === square ? "dragging" : undefined}
                      style={drag?.square === square ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.12)` } : undefined}
                    />
                  ))}
              </>
            );
            if (!interactive) {
              return (
                <div key={square} className={classes}>
                  {content}
                </div>
              );
            }
            return (
              <button
                key={square}
                type="button"
                className={classes}
                aria-label={`${square}${pieceName ? `, ${pieceName}` : ""}${target ? ", can move here" : ""}`}
                aria-pressed={picked === square}
                onClick={() => press(square)}
                onPointerDown={(event) => onPointerDown(event, square)}
              >
                {content}
              </button>
            );
          }),
        )}
        <svg className="arrows" viewBox="0 0 8 8" aria-hidden="true">
          <defs>
            <marker id="head-played" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--played)" />
            </marker>
            <marker id="head-best" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--engine)" />
            </marker>
          </defs>
          {arrows.map((arrow) => {
            const from = squareCentre(arrow.uci.slice(0, 2), orientation);
            const to = squareCentre(arrow.uci.slice(2, 4), orientation);
            // Stop short of the centre so the arrowhead does not cover the piece.
            const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
            const endX = to.x - ((to.x - from.x) / length) * 0.28;
            const endY = to.y - ((to.y - from.y) / length) * 0.28;
            return (
              <line
                key={`${arrow.kind}-${arrow.uci}`}
                x1={from.x}
                y1={from.y}
                x2={endX}
                y2={endY}
                stroke={arrow.kind === "played" ? "var(--played)" : "var(--engine)"}
                strokeWidth={0.16}
                strokeLinecap="round"
                strokeDasharray={arrow.kind === "best" ? undefined : "0.3 0.22"}
                markerEnd={`url(#head-${arrow.kind})`}
                opacity={0.92}
              />
            );
          })}
        </svg>
        {pending && onMove && (
          <div className="promotion" role="dialog" aria-label="Choose a piece to promote to">
            {PROMOTIONS.map((letter) => (
              <button
                key={letter}
                type="button"
                aria-label={`Promote to ${PIECE_WORD[letter]}`}
                onClick={() => {
                  setPromotion(null);
                  onMove(`${pending.from}${pending.to}${letter}`);
                }}
              >
                <img src={`/pieces/${whiteToMove ? "w" : "b"}${letter.toUpperCase()}.svg`} alt="" draggable={false} />
              </button>
            ))}
            <button type="button" className="promotion-cancel" onClick={() => setPromotion(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
