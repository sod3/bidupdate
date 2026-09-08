import { describe, expect, it } from "vitest";
import { committedCrashMultiplier, flightPayloadNumber, spectatorFlightHasEnded, visibleFlightCrashMultiplier } from "@/lib/premium-games/flightPresentation";

describe("Flight X cash-out presentation", () => {
  it("keeps the committed crash separate from the player's locked cash-out", () => {
    const payload = { cashedOutMultiplier: 1.67, crashMultiplier: 6.42 };
    expect(flightPayloadNumber(payload, "cashedOutMultiplier")).toBe(1.67);
    expect(committedCrashMultiplier(payload)).toBe(6.42);
    expect(spectatorFlightHasEnded(1.67, 6.42, true)).toBe(false);
    expect(spectatorFlightHasEnded(6.41, 6.42, true)).toBe(false);
    expect(spectatorFlightHasEnded(6.42, 6.42, true)).toBe(true);
    expect(visibleFlightCrashMultiplier(payload)).toBe(6.42);
  });

  it("does not invent an invalid 1.00x crash from missing payload data", () => {
    expect(committedCrashMultiplier({}, 1.87)).toBe(1.87);
    expect(flightPayloadNumber({ cashedOutMultiplier: null }, "cashedOutMultiplier")).toBeNull();
    expect(visibleFlightCrashMultiplier({ crashMultiplier: 1, cashedOutMultiplier: 1.54 })).toBe(1.54);
  });
});
