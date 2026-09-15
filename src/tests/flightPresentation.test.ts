import { describe, expect, it } from "vitest";
import { createFlightCrash } from "@/lib/premium-games/engine";
import { committedCrashMultiplier, createNaturalFlightCrash, effectiveFlightCrashMultiplier, flightCrashFromHistory, flightPayloadNumber, mergeFlightHistory, spectatorFlightHasEnded, visibleFlightCrashMultiplier } from "@/lib/premium-games/flightPresentation";

describe("Flight X cash-out presentation", () => {
  it("keeps the committed crash separate from the player's locked cash-out", () => {
    const payload = { cashedOutMultiplier: 1.67, crashMultiplier: 6.42 };
    expect(flightPayloadNumber(payload, "cashedOutMultiplier")).toBe(1.67);
    expect(committedCrashMultiplier(payload)).toBe(6.42);
    expect(spectatorFlightHasEnded(1.67, 6.42, true)).toBe(false);
    expect(spectatorFlightHasEnded(6.41, 6.42, true)).toBe(false);
    expect(spectatorFlightHasEnded(6.42, 6.42, true)).toBe(true);
    expect(visibleFlightCrashMultiplier(payload)).toBe(6.42);
    expect(effectiveFlightCrashMultiplier("RESULT", false, 6.42, 3.7)).toBe(6.42);
    expect(effectiveFlightCrashMultiplier("BETTING", false, 6.42, 3.7)).toBe(3.7);
  });

  it("never substitutes a player's cash-out for the committed crash", () => {
    expect(committedCrashMultiplier({}, 1.87)).toBe(1.87);
    expect(flightPayloadNumber({ cashedOutMultiplier: null }, "cashedOutMultiplier")).toBeNull();
    expect(visibleFlightCrashMultiplier({ crashMultiplier: 1, cashedOutMultiplier: 1.54 })).toBe(1);
    expect(visibleFlightCrashMultiplier({ crashMultiplier: 30.47, cashedOutMultiplier: 30.56 })).toBe(30.47);
  });

  it("produces the natural long-tail variation used by spectator rounds", () => {
    expect(createNaturalFlightCrash(() => 0)).toBe(1);
    expect(createNaturalFlightCrash(() => 0.91)).toBe(10);
    expect(createNaturalFlightCrash(() => 0.955)).toBe(19.99);
    expect(createNaturalFlightCrash(() => 0.982)).toBe(49.99);
    expect(createNaturalFlightCrash(() => 0.99)).toBe(89.99);
  });

  it("uses stored multipliers and keeps completed crashes newest first", () => {
    const older = { roundId: "flight-1", multiplier: 2.45, completedAt: "2026-09-15T10:00:00.000Z" };
    const newer = { roundId: "flight-2", multiplier: 18.72, completedAt: "2026-09-15T10:01:00.000Z" };
    expect(flightCrashFromHistory({ ...older, result: "LOSS", label: "wrong 1.31x", stake: 100, payout: 0, createdAt: older.completedAt })).toBe(2.45);
    expect(mergeFlightHistory([older], [newer, older])).toEqual([newer, older]);
  });

  it("keeps display, settlement, and history identical across many committed rounds", () => {
    for (let round = 0; round < 1_000; round += 1) {
      const crashMultiplier = createFlightCrash(`flight-authority-${round}`);
      const payload = { crashMultiplier, cashedOutMultiplier: crashMultiplier + 0.09 };
      const historyItem = {
        roundId: `flight-${round}`,
        result: "LOSS" as const,
        label: `FLEW AWAY AT ${crashMultiplier.toFixed(2)}×`,
        stake: 100,
        payout: 0,
        multiplier: crashMultiplier,
        createdAt: new Date(round * 1_000).toISOString(),
      };

      expect(committedCrashMultiplier(payload)).toBe(crashMultiplier);
      expect(visibleFlightCrashMultiplier(payload)).toBe(crashMultiplier);
      expect(flightCrashFromHistory(historyItem)).toBe(crashMultiplier);
      expect(Number(crashMultiplier.toFixed(2))).toBe(historyItem.multiplier);
    }
  });
});
