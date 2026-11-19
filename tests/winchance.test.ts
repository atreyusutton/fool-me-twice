import { describe, expect, it } from "vitest";
import { winChanceFromCp } from "../src/core/winchance.ts";

describe("winChanceFromCp", () => {
  it("is even at a level score", () => {
    expect(winChanceFromCp(0)).toBe(50);
  });
  it("is symmetric around a level score", () => {
    expect(winChanceFromCp(150) + winChanceFromCp(-150)).toBeCloseTo(100, 10);
  });
  it("matches the published curve at known points", () => {
    expect(winChanceFromCp(100)).toBeCloseTo(59.1, 1);
    expect(winChanceFromCp(300)).toBeCloseTo(75.1, 1);
    expect(winChanceFromCp(-800)).toBeCloseTo(5.0, 1);
  });
});
