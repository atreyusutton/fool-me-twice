import { useEffect, type ReactNode } from "react";
import { speak, stop, useVoice, type VoiceLine } from "../../app/voice.ts";
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
  voice,
  children,
}: {
  who: FigureId;
  mood?: Mood;
  big?: boolean;
  size?: number;
  /** The checked line this bubble shows, when it can be read aloud. */
  voice?: VoiceLine | null;
  children: ReactNode;
}) {
  const sound = useVoice();
  const canSpeak = Boolean(voice) && sound.available === true;
  const mine = Boolean(voice) && sound.lineId === voice!.id;
  const lineId = canSpeak ? voice!.id : null;
  // With sound on, a new line is read as it appears. The line is looked up by id, so a re-render
  // with the same words does not start it again.
  useEffect(() => {
    if (lineId && voice && sound.sound) void speak(voice, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the line's id and the sound switch only
  }, [lineId, sound.sound]);
  // Leaving the screen stops the voice.
  useEffect(() => stop, []);
  const speaking = mine && sound.status === "playing";
  return (
    <div className={`say${big ? " big" : ""}`} style={{ "--coach": COACH_COLOR[who] } as React.CSSProperties}>
      <Figure who={who} mood={speaking ? "talking" : mood} size={size ?? (big ? 112 : 72)} decorative />
      <div className={`bubble${big ? " big" : ""}`}>
        <span className="who">
          {NAMES[who]}
          {canSpeak && (
            <button
              className="speak"
              onClick={() => (mine ? stop() : void speak(voice!, true))}
              aria-label={mine ? `Stop ${NAMES[who]}` : `Hear ${NAMES[who]} say this`}
              title={mine ? "Stop" : "Hear it"}
            >
              {mine && sound.status === "loading" ? <span className="spinner tiny" aria-hidden="true" /> : <span aria-hidden="true">{mine ? "■" : "▶"}</span>}
            </button>
          )}
        </span>
        {children}
        {canSpeak && !sound.lineId && sound.problem && (
          <p className="source-note" role="status">
            {sound.problem}
          </p>
        )}
      </div>
    </div>
  );
}

export function coachName(coach: CoachId): string {
  return PERSONAS[coach].name;
}
