import type { CoachEntry } from "../app/session.ts";
import type { CoachUsage } from "../core/coach/types.ts";

const SOURCE_LINE: Record<string, string> = {
  model: "Written by the language model and checked by code.",
  model_retry: "Written by the language model. Its first reply failed the check and was sent back once; this is the second, which passed.",
  code: "The language model's replies failed the check, so this text was built by code from the engine facts.",
  code_no_model: "Text built by code from the engine facts.",
};

const total = (usages: CoachUsage[], field: keyof CoachUsage) => usages.reduce((sum, usage) => sum + usage[field], 0);

/**
 * Says where the words on screen came from and what they cost. Every number here is a token count
 * reported by the API for this reply; nothing is estimated.
 */
export function CoachSource({ entry, extra }: { entry: CoachEntry | undefined; extra?: string }) {
  if (!entry) {
    return <p className="source-note">Text built by code from the engine facts. {extra}</p>;
  }
  const { result } = entry;
  const usages = result.attempts.map((attempt) => attempt.usage);
  const failures = result.attempts.filter((attempt) => !attempt.ok);
  const line = entry.status === "loading" ? entry.note : (entry.note ?? SOURCE_LINE[result.source]);
  return (
    <div className="source-note" aria-live="polite">
      <p>
        {entry.status === "loading" && <span className="spinner tiny" aria-hidden="true" />}
        {line} {extra}
      </p>
      {entry.status === "ready" && usages.length > 0 && (
        <details className="why">
          <summary>What this text cost</summary>
          <dl className="cost">
            <dt>Model</dt>
            <dd>{result.model ?? "none"}</dd>
            <dt>Prompt version</dt>
            <dd>{result.promptVersion}</dd>
            <dt>Requests</dt>
            <dd className="num">{usages.length}</dd>
            <dt>Read from the prompt cache</dt>
            <dd className="num">{total(usages, "cacheReadTokens").toLocaleString()} tokens</dd>
            <dt>Written to the prompt cache</dt>
            <dd className="num">{total(usages, "cacheWriteTokens").toLocaleString()} tokens</dd>
            <dt>New input</dt>
            <dd className="num">{total(usages, "inputTokens").toLocaleString()} tokens</dd>
            <dt>Output</dt>
            <dd className="num">{total(usages, "outputTokens").toLocaleString()} tokens</dd>
          </dl>
          <p>
            {entry.fromCache
              ? "This reply was saved earlier and reused, so showing it now cost nothing. The counts are from when it was written."
              : "This reply was written just now and is saved on this device, so opening it again costs nothing."}
          </p>
          {failures.map((attempt, index) => (
            <p key={index}>
              Rejected reply: rule {attempt.failure?.rule}, {attempt.failure?.detail}.
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
