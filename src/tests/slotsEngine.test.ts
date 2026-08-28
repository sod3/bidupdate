import { describe, expect, it } from "vitest";
import {
  SLOT_PAYLINES,
  SLOT_STAKES,
  SLOT_SYMBOLS,
  createSlotOutcome,
  evaluateSlotGrid,
  weightedSlotSymbol,
  type SlotGrid,
} from "@/lib/slots/engine";

function seededRandom(seed = 777) {
  let value = seed >>> 0;
  return (maxExclusive: number) => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value % maxExclusive;
  };
}

describe("777 Slots server engine", () => {
  it("defines all stakes, ten weighted symbols, and five five-reel paylines", () => {
    expect(SLOT_STAKES).toEqual([10, 25, 50, 100, 250, 500]);
    expect(SLOT_SYMBOLS).toHaveLength(10);
    expect(SLOT_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0)).toBe(100);
    expect(SLOT_PAYLINES.map((line) => line.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("maps every probability-table boundary to the correct symbol", () => {
    let start = 0;
    for (const symbol of SLOT_SYMBOLS) {
      expect(weightedSlotSymbol(() => start)).toBe(symbol.id);
      expect(weightedSlotSymbol(() => start + symbol.weight - 1)).toBe(symbol.id);
      start += symbol.weight;
    }
  });

  it("pays an exact five-symbol line using the symbol multiplier", () => {
    const grid: SlotGrid = [
      ["SEVEN", "SEVEN", "SEVEN", "SEVEN", "SEVEN"],
      ["COIN", "EMERALD", "BELL", "RUBY", "STAR"],
      ["BONUS", "CHEST", "STAR", "CROWN", "WILD"],
    ];
    const result = evaluateSlotGrid(grid);
    expect(result.winningLines).toHaveLength(1);
    expect(result.winningLines[0]).toMatchObject({ id: 1, symbol: "SEVEN", multiplier: 30 });
    expect(result.totalMultiplier).toBe(30);
  });

  it("adds multiple payline multipliers without counting near-matches", () => {
    const grid: SlotGrid = [
      ["COIN", "COIN", "COIN", "COIN", "COIN"],
      ["CROWN", "EMERALD", "BELL", "RUBY", "CROWN"],
      ["STAR", "STAR", "STAR", "STAR", "STAR"],
    ];
    const result = evaluateSlotGrid(grid);
    expect(result.winningLines.map((line) => line.id)).toEqual([1, 3]);
    expect(result.totalMultiplier).toBe(12);
  });

  it("produces only valid server-priced outcomes for every stake", () => {
    const randomIndex = seededRandom(91);
    for (const stake of SLOT_STAKES) {
      for (let spin = 0; spin < 80; spin += 1) {
        const outcome = createSlotOutcome(stake, randomIndex);
        expect(outcome.grid).toHaveLength(3);
        expect(outcome.grid.every((row) => row.length === 5)).toBe(true);
        expect(outcome.payout).toBe(stake * outcome.totalMultiplier);
        expect(outcome.result === "LOSS").toBe(outcome.totalMultiplier === 0);
      }
    }
  });

  it("targets about 20% wins and 80% losses across a deterministic sample", () => {
    const randomIndex = seededRandom(2026);
    const outcomes = Array.from({ length: 2_000 }, () => createSlotOutcome(25, randomIndex));
    const winRate = outcomes.filter((outcome) => outcome.result !== "LOSS").length / outcomes.length;
    expect(winRate).toBeGreaterThan(0.17);
    expect(winRate).toBeLessThan(0.23);
  });

  it("rejects an invalid RNG index", () => {
    expect(() => weightedSlotSymbol((maximum) => maximum)).toThrow(/out-of-range/i);
  });
});
