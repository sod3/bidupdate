import { describe, expect, it } from "vitest";
import { premiumGameDefinitions, type PremiumGameId } from "@/lib/premium-games/definitions";
import { PREMIUM_TARGET_WIN_PERCENT, createFlightCrash, createPremiumOutcome, flightElapsedFor, flightMultiplierAt } from "@/lib/premium-games/engine";
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

  it("targets very hard results with about 10% winning rounds", () => {
    expect(PREMIUM_TARGET_WIN_PERCENT).toBe(10);
    for (const gameId of settledGames) {
      const selection = { id: premiumGameDefinitions[gameId].options[0].id, amount: 20 };
      const outcomes = Array.from({ length: 1_000 }, (_, index) => createPremiumOutcome(gameId, `${gameId}:difficulty:${index}`, [selection]));
      const winRate = outcomes.filter((outcome) => outcome.result === "WIN").length / outcomes.length;
      expect(winRate).toBeGreaterThan(0.07);
      expect(winRate).toBeLessThan(0.13);
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
    const survivals = Array.from({ length: 2_000 }, (_, index) => createFlightCrash(`flight:survival:${index}`));
    const launchSurvivalRate = survivals.filter((crash) => crash > 1).length / survivals.length;
    expect(launchSurvivalRate).toBeGreaterThan(0.07);
    expect(launchSurvivalRate).toBeLessThan(0.13);
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
