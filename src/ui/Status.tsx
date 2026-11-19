import type { ReactNode } from "react";
import type { MotifError } from "../core/errors.ts";
import { Link } from "./Link.tsx";

export function Loading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="status" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <h2>{title}</h2>
      {detail && <p className="muted">{detail}</p>}
    </div>
  );
}

const ERROR_COPY: Record<MotifError["kind"], { title: string; next: string }> = {
  not_found: { title: "No player by that name", next: "Check the spelling. It is the name in your Chess.com profile address." },
  closed: { title: "This account is closed", next: "Motif does not coach from closed accounts. Try another player or the demo." },
  rate_limited: { title: "Chess.com asked us to slow down", next: "Wait a minute, then try again. Nothing was lost." },
  network: { title: "Could not reach Chess.com", next: "Check your connection, then try again. Games already saved on this device still open." },
  api: { title: "Chess.com sent something unexpected", next: "Try again in a moment." },
  no_games: { title: "No games to review yet", next: "Play a few games on Chess.com, or look at the demo to see what Motif does." },
  engine: { title: "The chess engine did not start", next: "Reload the page. If it keeps failing, try a current version of Chrome, Firefox or Safari." },
  coach: { title: "The coach is unavailable", next: "The review still works, with text built directly from the engine facts." },
};

export function ErrorScreen({ error, onRetry, children }: { error: MotifError; onRetry?: () => void; children?: ReactNode }) {
  const copy = ERROR_COPY[error.kind];
  return (
    <div className="status" role="alert">
      <h2>{copy.title}</h2>
      <p>{error.message}</p>
      <p className="muted">{copy.next}</p>
      <div className="row" style={{ justifyContent: "center" }}>
        {onRetry && error.kind !== "not_found" && error.kind !== "closed" && (
          <button className="btn" onClick={onRetry}>
            Try again
          </button>
        )}
        <Link className="btn secondary" href="/">
          Choose another player
        </Link>
        <Link className="btn secondary" href="/demo">
          See the demo
        </Link>
      </div>
      {children}
    </div>
  );
}
