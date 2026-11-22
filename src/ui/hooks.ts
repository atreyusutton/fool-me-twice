import { useSyncExternalStore } from "react";
import type { PlayerSession, SessionState } from "../app/session.ts";

export function useSession(session: PlayerSession): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}
