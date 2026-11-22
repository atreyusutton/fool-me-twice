export type MotifErrorKind =
  | "not_found"
  | "closed"
  | "rate_limited"
  | "network"
  | "api"
  | "no_games"
  | "engine"
  | "coach";

/** An error with a kind the interface can turn into a clear message and a next step. */
export class MotifError extends Error {
  readonly kind: MotifErrorKind;
  constructor(kind: MotifErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MotifError";
    this.kind = kind;
  }
}

export function toMotifError(error: unknown, fallbackKind: MotifErrorKind = "api"): MotifError {
  if (error instanceof MotifError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new MotifError(fallbackKind, message, { cause: error });
}
