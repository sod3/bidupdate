import { describe, expect, it } from "vitest";
import {
  AI_FAVORED_PERCENT,
  PLAYER_TARGET_WIN_PERCENT,
  isAiFavoredRoll,
} from "../../scripts/game-ai.mjs";

describe("single-player AI difficulty", () => {
  it("uses a challenging AI profile without forcing a winner", () => {
    expect(AI_FAVORED_PERCENT).toBe(90);
    expect(PLAYER_TARGET_WIN_PERCENT).toBe(10);
    expect(
      Array.from({ length: 100 }, (_, roll) => roll).filter(isAiFavoredRoll),
    ).toHaveLength(90);
  });

  it("rejects values outside the random roll range", () => {
    expect(isAiFavoredRoll(-1)).toBe(false);
    expect(isAiFavoredRoll(100)).toBe(false);
    expect(isAiFavoredRoll(12.5)).toBe(false);
  });
});
