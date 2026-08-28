import { describe, expect, it } from "vitest";
import { premiumGameDefinitions, type PremiumGameId } from "@/lib/premium-games/definitions";
import { createFlightCrash, createPremiumOutcome, flightElapsedFor, flightMultiplierAt } from "@/lib/premium-games/engine";
import { carSelectorAngle, roulettePresentation } from "@/lib/premium-games/presentation";

const settledGames = Object.keys(premiumGameDefinitions).filter((gameId) => gameId !== "flight-x") as Array<Exclude<PremiumGameId, "flight-x">>;

describe("premium shared game engine", () => {
  it("is deterministic for the same committed seed and wager", () => {
    for (const gameId of settledGames) {
      const selection = { id: premiumGameDefinitions[gameId].options[0].id, amount: 20 };
      expect(createPremiumOutcome(gameId, `seed:${gameId}`, [selection])).toEqual(createPremiumOutcome(gameId, `seed:${gameId}`, [selection]));
    }
  });

  it("only creates finite bounded server-priced results", () => {
    for (const gameId of settledGames) {
      const selection = { id: premiumGameDefinitions[gameId].options[0].id, amount: 20 };
      for (let index = 0; index < 120; index += 1) {
        const outcome = createPremiumOutcome(gameId, `${gameId}:sample:${index}`, [selection]);
        expect(["WIN", "LOSS", "PUSH"]).toContain(outcome.result);
        expect(Number.isFinite(outcome.payout)).toBe(true);
        expect(outcome.payout).toBeGreaterThanOrEqual(0);
        expect(outcome.payout).toBeLessThanOrEqual(2000);
        expect(outcome.multiplier).toBeGreaterThanOrEqual(0);
        expect(outcome.multiplier).toBeLessThanOrEqual(100);
      }
    }
  });

  it("uses an invertible Flight X display curve and bounded committed endpoint", () => {
    for (const multiplier of [1, 1.05, 1.5, 2, 5, 25, 100]) {
      expect(flightMultiplierAt(flightElapsedFor(multiplier))).toBeCloseTo(multiplier, 2);
    }
    for (let index = 0; index < 500; index += 1) {
      const crash = createFlightCrash(`flight:seed:${index}`);
      expect(crash).toBeGreaterThanOrEqual(1);
      expect(crash).toBeLessThanOrEqual(100);
    }
  });

  it("maps roulette numbers and car winners to distinct animation landings", () => {
    const rouletteLandings = Array.from({ length: 37 }, (_, number) => roulettePresentation(number).ballAngle % 360);
    expect(new Set(rouletteLandings.map((angle) => angle.toFixed(5))).size).toBe(37);
    expect(new Set(Array.from({ length: 6 }, (_, index) => carSelectorAngle(index) % 360)).size).toBe(6);
  });

  it("produces varied results across independent premium-round seeds", () => {
    const rouletteNumbers = new Set<number>();
    const carWinners = new Set<string>();
    for (let index = 0; index < 600; index += 1) {
      const roulette = createPremiumOutcome("royal-roulette", `roulette:${index}`, [{ id: "RED", amount: 20 }]).payload as Record<string, unknown>;
      const car = createPremiumOutcome("car-roulette", `car:${index}`, [{ id: "FALCON_X", amount: 20 }]).payload as Record<string, unknown>;
      rouletteNumbers.add(Number(roulette.number));
      carWinners.add(String(car.car));
    }
    expect(rouletteNumbers.size).toBeGreaterThan(32);
    expect(carWinners.size).toBe(6);
  });
});
