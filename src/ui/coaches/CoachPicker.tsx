import { setCoach, useCoach } from "../../app/coach-choice.ts";
import { COACH_IDS, PERSONAS } from "../../core/coach/personas.ts";
import { COACH_COLOR, Figure } from "./Figure.tsx";

/** Four coaches, one choice. The choice is remembered on the device and can be changed from any screen. */
export function CoachPicker({ onPick }: { onPick?: () => void }) {
  const current = useCoach();
  return (
    <div className="grid-4" role="group" aria-label="Choose your coach">
      {COACH_IDS.map((id) => {
        const persona = PERSONAS[id];
        return (
          <button
            key={id}
            className="pick"
            aria-pressed={current === id}
            style={{ "--coach": COACH_COLOR[id] } as React.CSSProperties}
            onClick={() => {
              setCoach(id);
              onPick?.();
            }}
          >
            <Figure who={id} mood={current === id ? "pleased" : "idle"} size={104} decorative />
            <strong>{persona.name}</strong>
            <span className="tag">{persona.tagline}</span>
            <span className="credit">{persona.credit}</span>
          </button>
        );
      })}
    </div>
  );
}
