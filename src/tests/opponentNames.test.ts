import { describe, expect, it } from "vitest";
import { FICTIONAL_OPPONENT_NAMES, fictionalOpponentNameAt } from "@/lib/opponentNames";

describe("fictional opponent names", () => {
  it("provides a broad pool of human-style dummy names without AI labels", () => {
    expect(FICTIONAL_OPPONENT_NAMES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(FICTIONAL_OPPONENT_NAMES).size).toBe(FICTIONAL_OPPONENT_NAMES.length);
    expect(FICTIONAL_OPPONENT_NAMES.every((name) => name.includes(" ") && !/\b(ai|bot|cpu)\b/i.test(name))).toBe(true);
  });

  it("rotates away from excluded names and safely wraps indexes", () => {
    const first = fictionalOpponentNameAt(0);
    expect(fictionalOpponentNameAt(0, [first])).not.toBe(first);
    expect(fictionalOpponentNameAt(FICTIONAL_OPPONENT_NAMES.length)).toBe(first);
  });
});
