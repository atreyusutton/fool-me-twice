import type { Tally } from "../core/tier1.ts";
import { formatPercent } from "./format.ts";

/** Wins, draws and losses as one bar, with the numbers always written next to it. */
export function TallyBar({ label, tally }: { label: string; tally: Tally }) {
  const summary = `${tally.wins} won, ${tally.draws} drawn, ${tally.losses} lost`;
  return (
    <div className="wdl">
      <div className="wdl-head">
        <span>{label}</span>
        <span className="muted small num">
          {tally.games === 0 ? "no games" : `${tally.wins}–${tally.draws}–${tally.losses} · ${formatPercent(tally.score)} score`}
        </span>
      </div>
      {tally.games > 0 && (
        <div className="wdl-bar" role="img" aria-label={`${label}: ${summary}`} title={summary}>
          {tally.wins > 0 && <span className="w" style={{ flexGrow: tally.wins }} />}
          {tally.draws > 0 && <span className="d" style={{ flexGrow: tally.draws }} />}
          {tally.losses > 0 && <span className="l" style={{ flexGrow: tally.losses }} />}
        </div>
      )}
    </div>
  );
}

export function TallyLegend() {
  return (
    <div className="legend" aria-hidden="true">
      <span>
        <i style={{ background: "var(--win)" }} />
        Won
      </span>
      <span>
        <i style={{ background: "var(--draw)" }} />
        Drawn
      </span>
      <span>
        <i style={{ background: "var(--loss)" }} />
        Lost
      </span>
      <span>Numbers read won–drawn–lost</span>
    </div>
  );
}
