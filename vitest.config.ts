import { defineConfig } from "vitest/config";

// Tests run in plain Node: the truth-carrying code (facts, detectors, validator) has no I/O.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
