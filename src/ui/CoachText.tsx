import { renderParts } from "../core/coach/tokens.ts";
import type { CoachRequest } from "../core/coach/types.ts";

/**
 * Shows coach text. The words come from the coach; every move and number is filled in here
 * from the fact table, so the coach never has the chance to get one wrong.
 */
export function CoachText({ text, request }: { text: string; request: CoachRequest }) {
  return (
    <>
      {renderParts(text, request).map((part, index) => {
        if (part.type === "text") return <span key={index}>{part.text}</span>;
        if (part.type === "move") {
          return (
            <span key={index} className={`san fact ${part.role}`} title={part.role === "played" ? "The move played, from the game record" : "The engine's move"}>
              {part.text}
            </span>
          );
        }
        return (
          <span key={index} className="num fact" title="From the engine's fact table">
            {part.text}
          </span>
        );
      })}
    </>
  );
}
