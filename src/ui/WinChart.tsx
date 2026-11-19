import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface ChartMarker {
  /** Index into the line: the position after this many plies. */
  index: number;
  label: string;
}

const WIDTH = 640;
const HEIGHT = 150;
const PAD = { top: 10, right: 12, bottom: 22, left: 34 };

/**
 * The player's winning chance across the game, one point per position. A single series, so the title
 * names it and there is no legend. Hovering or tapping reads out a position; clicking jumps to it.
 */
export function WinChart({
  line,
  current,
  markers,
  describe,
  onSelect,
}: {
  line: number[];
  current: number;
  markers: ChartMarker[];
  /** Text for the tooltip at a position, for example "12… Nf6". */
  describe: (index: number) => string;
  onSelect: (index: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const last = Math.max(1, line.length - 1);
  const x = (index: number) => PAD.left + (index / last) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + ((100 - value) / 100) * (HEIGHT - PAD.top - PAD.bottom);
  const path = line.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(last).toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z`;

  const indexFromPointer = (event: PointerEvent<SVGSVGElement>): number => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return 0;
    const scaled = ((event.clientX - box.left) / box.width) * WIDTH;
    const ratio = (scaled - PAD.left) / (WIDTH - PAD.left - PAD.right);
    return Math.min(last, Math.max(0, Math.round(ratio * last)));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowLeft") onSelect(Math.max(0, current - 1));
    else if (event.key === "ArrowRight") onSelect(Math.min(last, current + 1));
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const shown = hover ?? current;
  const shownValue = line[shown] ?? 50;
  const tipLeft = (x(shown) / WIDTH) * 100;

  return (
    <div className="chart">
      <div className="chart-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="slider"
          tabIndex={0}
          aria-label="Your winning chance through the game. Use the left and right arrow keys to move through the positions."
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={current}
          aria-valuetext={`${describe(current)}: winning chance ${Math.round(line[current] ?? 50)} percent`}
          onPointerMove={(event) => setHover(indexFromPointer(event))}
          onPointerLeave={() => setHover(null)}
          onClick={(event) => onSelect(indexFromPointer(event as unknown as PointerEvent<SVGSVGElement>))}
          onKeyDown={onKey}
        >
          {[0, 50, 100].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className={tick === 50 ? "grid mid" : "grid"} />
              <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className="tick">
                {tick}%
              </text>
            </g>
          ))}
          <path d={area} className="area" />
          <path d={path} className="line" />
          {markers.map((marker) => (
            <circle key={marker.index} cx={x(marker.index)} cy={y(line[marker.index] ?? 50)} r={4.5} className="marker" />
          ))}
          <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="cursor" />
          <circle cx={x(shown)} cy={y(shownValue)} r={4} className="cursor-dot" />
          <text x={PAD.left} y={HEIGHT - 5} className="tick">
            Start
          </text>
          <text x={WIDTH - PAD.right} y={HEIGHT - 5} textAnchor="end" className="tick">
            End
          </text>
        </svg>
        <div className="chart-tip" style={{ left: `clamp(70px, ${tipLeft}%, calc(100% - 70px))` }} aria-hidden="true">
          <strong className="num">{Math.round(shownValue)}%</strong> {describe(shown)}
        </div>
      </div>
      <p className="muted small">
        <span className="marker-key" aria-hidden="true" /> Key moments. Above 50% you were more likely to win than your opponent.
      </p>
    </div>
  );
}
