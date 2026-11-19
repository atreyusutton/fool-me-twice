import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MotifError } from "../errors.ts";
import { SYSTEM_INSTRUCTIONS } from "./prompt.ts";
import type { ModelCall } from "./run.ts";
import { coachWireSchema } from "./schema.ts";

export const DEFAULT_COACH_MODEL = "claude-sonnet-5-5";

/**
 * The one place Motif calls the Claude API. Used by the Worker, and by the scripts that record the demo.
 *
 * Caching: the system instructions and the output format are identical for every request, and the
 * profile block is identical for every game of one profile. A cache breakpoint after each lets the API
 * reuse them, so a second game review pays full price only for that game's facts.
 */
export function createModelCall(apiKey: string, model: string): ModelCall {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return async (input) => {
    const content: Anthropic.TextBlockParam[] = [
      { type: "text", text: input.profile, cache_control: { type: "ephemeral" } },
      { type: "text", text: input.request },
    ];
    // A retry appends to the same user turn, so everything before it is still read from the cache.
    if (input.retry) content.push({ type: "text", text: input.retry });
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 16_000,
        system: [{ type: "text", text: SYSTEM_INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        // The task is wording, not problem solving: low effort keeps it quick and cheap.
        output_config: { effort: "low", format: zodOutputFormat(coachWireSchema) },
      });
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      return {
        text,
        stopReason: response.stop_reason,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new MotifError("coach", "The coach's API key was not accepted.", { cause: error });
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new MotifError("coach", "The coach is being asked too often right now.", { cause: error });
      }
      if (error instanceof Anthropic.BadRequestError) {
        throw new MotifError("coach", `The coach request was refused as malformed: ${error.message}`, { cause: error });
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new MotifError("coach", "The coach could not be reached.", { cause: error });
      }
      if (error instanceof Anthropic.APIError) {
        throw new MotifError("coach", `The coach service returned an error (${error.status ?? "unknown"}).`, { cause: error });
      }
      throw new MotifError("coach", "The coach failed unexpectedly.", { cause: error });
    }
  };
}
