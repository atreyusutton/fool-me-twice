import { fallbackGameReview, fallbackProfileSummary } from "./fallback.ts";
import { profileBlock, PROMPT_VERSION, requestBlock, retryMessage } from "./prompt.ts";
import { gameReviewToWire, profileSummaryToWire, wireToGameReview, wireToProfileSummary, type CoachWire } from "./schema.ts";
import type { CoachAttempt, CoachReply, CoachRequest, CoachResult, CoachUsage, ReplySource } from "./types.ts";
import { validateReply } from "./validator.ts";

/** The three parts of the prompt after the system instructions, in order. Only `retry` is new on a second attempt. */
export interface ModelInput {
  profile: string;
  request: string;
  retry: string | null;
}
export interface ModelOutput {
  text: string;
  usage: CoachUsage;
  /** Why the model stopped. Anything other than a normal finish counts as a failed attempt. */
  stopReason: string | null;
}
export type ModelCall = (input: ModelInput) => Promise<ModelOutput>;

function toReply(request: CoachRequest, wire: CoachWire): CoachReply {
  return request.kind === "game" ? wireToGameReview(wire) : wireToProfileSummary(wire);
}

/** The text built by code, in the same wire shape as a model reply. */
export function codeBuiltWire(request: CoachRequest): CoachWire {
  return request.kind === "game" ? gameReviewToWire(fallbackGameReview(request)) : profileSummaryToWire(fallbackProfileSummary(request));
}

/** A reply made entirely by code: used when there is no model, and when the model fails the check twice. */
export function codeBuiltResult(request: CoachRequest, source: ReplySource, attempts: CoachAttempt[] = [], model: string | null = null): CoachResult {
  return { reply: toReply(request, codeBuiltWire(request)), source, model, promptVersion: PROMPT_VERSION, attempts };
}

/**
 * Asks the model, checks the reply, retries once with the reason, then falls back to code-built text.
 * Whatever happens, the result is a reply that passed the check or was built by code.
 */
export async function runCoach(request: CoachRequest, model: string, call: ModelCall): Promise<CoachResult> {
  const attempts: CoachAttempt[] = [];
  let retry: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const output = await call({ profile: profileBlock(request), request: requestBlock(request), retry });
    const finished = output.stopReason === null || output.stopReason === "end_turn";
    const validation = finished
      ? validateReply(request, output.text)
      : ({ ok: false, rule: 0, detail: `the model stopped before finishing (${output.stopReason})` } as const);
    if (validation.ok) {
      attempts.push({ raw: output.text, ok: true, failure: null, usage: output.usage });
      return { reply: toReply(request, validation.wire), source: attempt === 1 ? "model" : "model_retry", model, promptVersion: PROMPT_VERSION, attempts };
    }
    attempts.push({ raw: output.text, ok: false, failure: { rule: validation.rule, detail: validation.detail }, usage: output.usage });
    // A refusal will not change on a retry, so go straight to the code-built text.
    if (output.stopReason === "refusal") break;
    retry = `Your earlier reply was:\n${output.text}\n\n${retryMessage(validation.rule, validation.detail)}`;
  }
  return codeBuiltResult(request, "code", attempts, model);
}
