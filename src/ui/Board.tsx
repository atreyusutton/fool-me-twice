import type { Color } from "../core/types.ts";

export interface BoardArrow {
  /** Long-form move, for example "g1f3". */
  uci: string;
  kind: "played" | "best";
}

const FILES = "abcdefgh";
const PIECE_WORD: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

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

/**
 * A board that only shows positions: every piece comes from a FEN produced by the rules library.
 * Arrows mark the move played and the engine's move; the same information is in the text beside the board.
 */
export function Board({
  fen,
  orientation,
  lastMove,
  arrows = [],
  label,
}: {
  fen: string;
  orientation: Color;
  lastMove?: string | null;
  arrows?: BoardArrow[];
  label: string;
}) {
  const pieces = piecesFromFen(fen);
  const ranks = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "white" ? [...FILES] : [...FILES].reverse();
  const marked = new Set(lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : []);

  return (
    <div className="board-wrap">
      <div className="board" role="img" aria-label={label}>
        {ranks.map((rank, rowIndex) =>
          files.map((file, columnIndex) => {
            const square = `${file}${rank}`;
            const piece = pieces.get(square);
            const dark = (FILES.indexOf(file) + rank) % 2 === 1;
            return (
              <div key={square} className={`sq ${dark ? "dark" : "light"}${marked.has(square) ? " marked" : ""}`}>
                {columnIndex === 0 && <span className="coord rank">{rank}</span>}
                {rowIndex === 7 && <span className="coord file">{file}</span>}
                {piece && (
                  <img
                    src={`/pieces/${piece === piece.toUpperCase() ? "w" : "b"}${piece.toUpperCase()}.svg`}
                    alt={`${piece === piece.toUpperCase() ? "white" : "black"} ${PIECE_WORD[piece.toLowerCase()]}`}
                    draggable={false}
                  />
                )}
              </div>
            );
          }),
        )}
        <svg className="arrows" viewBox="0 0 8 8" aria-hidden="true">
          <defs>
            <marker id="head-played" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--loss)" />
            </marker>
            <marker id="head-best" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--win)" />
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
                stroke={arrow.kind === "played" ? "var(--loss)" : "var(--win)"}
                strokeWidth={0.16}
                strokeLinecap="round"
                strokeDasharray={arrow.kind === "best" ? undefined : "0.3 0.22"}
                markerEnd={`url(#head-${arrow.kind})`}
                opacity={0.92}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
