import type { ReactNode } from "react";
import type { PlayerSession, SessionState } from "../app/session.ts";
import { DemoBanner } from "./DemoBanner.tsx";
import { useSession } from "./hooks.ts";
import { ErrorScreen, Loading } from "./Status.tsx";

/**
 * Wraps every screen that belongs to one player: waits for the games, shows a failed load with a way
 * forward, and keeps the demo notice and other notices in the same place on each screen.
 */
export function Player({ session, children }: { session: PlayerSession; children: (state: SessionState) => ReactNode }) {
  const state = useSession(session);
  if (state.phase === "error" && state.error) {
    return <ErrorScreen error={state.error} onRetry={() => void session.load()} />;
  }
  if (state.phase === "loading" || !state.tier1 || !state.player) {
    return <Loading title={state.loadingStep} detail={state.notices.at(-1) ?? `Player: ${state.username}`} />;
  }
  return (
    <div className="stack loose">
      <div className="stack tight">
        <DemoBanner state={state} />
        {state.notices.map((notice) => (
          <p className="notice small" key={notice}>
            {notice}
          </p>
        ))}
        {!state.cachePersistent && (
          <p className="notice small">
            This browser is not letting Fool Me Twice save its work, so the analysis will start again if you reload the page.
          </p>
        )}
      </div>
      {children(state)}
    </div>
  );
}
