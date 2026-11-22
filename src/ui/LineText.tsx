import type { LinePart } from "../core/lines.ts";

/** Shows one of the app's fixed lines. Moves and numbers are marked as values put in by code. */
export function LineText({ parts }: { parts: LinePart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "move") return <span key={index} className={`san fact${part.role ? ` ${part.role}` : ""}`}>{part.text}</span>;
        if (part.type === "number") return <span key={index} className="num fact">{part.text}</span>;
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}
