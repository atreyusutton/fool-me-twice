import { playerPath } from "../app/router.ts";
import type { SessionState } from "../app/session.ts";
import { formatDate } from "./format.ts";
import { Link } from "./Link.tsx";

/** Shown on every demo screen, so recorded results are never mistaken for live ones. */
export function DemoBanner({ state }: { state: SessionState }) {
  if (!state.recording) return null;
  return (
    <p className="notice calm small" role="note">
      <strong>Recorded demo.</strong> {state.player?.displayName ?? state.username}&apos;s real games, analysed and coached on{" "}
      {formatDate(Date.parse(state.recording.recordedAt) / 1000)} and played back from a file. No API key needed.{" "}
      <Link href={playerPath(state.username, false)}>Run it live instead</Link>
    </p>
  );
}
