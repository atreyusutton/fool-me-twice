import type { ReactNode } from "react";
import { PERSONAS, type CoachId } from "../../core/coach/personas.ts";
import { COACH_COLOR, Figure, type FigureId, type Mood } from "./Figure.tsx";

const NAMES: Record<FigureId, string> = {
  sherlock: PERSONAS.sherlock.name,
  pooh: PERSONAS.pooh.name,
  hook: PERSONAS.hook.name,
  dracula: PERSONAS.dracula.name,
  blundy: "Blundy McBlunderpants",
};

/** A figure with a speech bubble: how every coach (and Blundy) talks. */
export function Say({
  who,
  mood = "idle",
  big = false,
  size,
  children,
}: {
  who: FigureId;
  mood?: Mood;
  big?: boolean;
  size?: number;
  children: ReactNode;
}) {
  return (
    <div className={`say${big ? " big" : ""}`} style={{ "--coach": COACH_COLOR[who] } as React.CSSProperties}>
      <Figure who={who} mood={mood} size={size ?? (big ? 112 : 72)} decorative />
      <div className={`bubble${big ? " big" : ""}`}>
        <span className="who">{NAMES[who]}</span>
        {children}
      </div>
    </div>
  );
}

export function coachName(coach: CoachId): string {
  return PERSONAS[coach].name;
}
