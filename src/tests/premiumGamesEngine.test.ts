import { describe, expect, it } from "vitest";
import { premiumGameDefinitions, type PremiumGameId } from "@/lib/premium-games/definitions";
import { PREMIUM_TARGET_WIN_PERCENT, createFlightCrash, createPremiumOutcome, flightCashoutPayout, flightElapsedFor, flightMultiplierAt, hasFlightCrashed, validateSelections } from "@/lib/premium-games/engine";
import { carSelectorAngle, roulettePresentation } from "@/lib/premium-games/presentation";

const settledGames = Object.keys(premiumGameDefinitions).filter((gameId) => gameId !== "flight-x") as Array<Exclude<PremiumGameId, "flight-x">>;

describe("premium shared game engine", () => {
  it("is deterministic for the same committed seed and wager", () => {
    for (const gameId of settledGames) {
      const selection = { id: premiumGameDefinitions[gameId].options[0].id, amount: 20 };
      expect(createPremiumOutcome(gameId, `seed:${gameId}`, [selection])).toEqual(createPremiumOutcome(gameId, `seed:${gameId}`, [selection]));
    }
  });

  it("settles Red vs Black directly from the same deck for opposing players", () => {
    for (let index = 0; index < 500; index += 1) {
      const seed = `red-black:shared-table:${index}`;
      const red = createPremiumOutcome("red-vs-black", seed, [{ id: "RED", amount: 100 }]);
      const black = createPremiumOutcome("red-vs-black", seed, [{ id: "BLACK", amount: 100 }]);
      expect(red.payload).toEqual(black.payload);
      expect(red.payload).not.toHaveProperty("difficulty");
      const payload = red.payload as Record<string, unknown>;
      const winner = payload.winner;
      if (payload.redHand === "HIGH CARD" && payload.blackHand === "HIGH CARD") {
        const highKey = (cards: unknown) => (cards as Array<{ rank: number }>).map((card) => card.rank === 1 ? 14 : card.rank).sort((a, b) => b - a);
        const redKey = highKey(payload.red);
        const blackKey = highKey(payload.black);
        const comparison = redKey.findIndex((rank, keyIndex) => rank !== blackKey[keyIndex]);
        const expected = comparison < 0 ? "TIE" : redKey[comparison] > blackKey[comparison] ? "RED" : "BLACK";
        expect(winner).toBe(expected);
      }
      if (winner === "RED") {
        expect(red).toMatchObject({ result: "WIN", payout: 195, multiplier: 1.95 });
        expect(black).toMatchObject({ result: "LOSS", payout: 0, multiplier: 0 });
        expect(1000 - 100 + red.payout).toBe(1095);
        expect(1000 - 100 + black.payout).toBe(900);
      } else if (winner === "BLACK") {
        expect(black).toMatchObject({ result: "WIN", payout: 195, multiplier: 1.95 });
        expect(red).toMatchObject({ result: "LOSS", payout: 0, multiplier: 0 });
        expect(1000 - 100 + black.payout).toBe(1095);
        expect(1000 - 100 + red.payout).toBe(900);
      } else {
        expect(red).toMatchObject({ result: "PUSH", payout: 100, multiplier: 1 });
        expect(black).toMatchObject({ result: "PUSH", payout: 100, multiplier: 1 });
        expect(1000 - 100 + red.payout).toBe(1000);
        expect(1000 - 100 + black.payout).toBe(1000);
      }
    }
  });

  it("rejects conflicting or non-kingdom Red vs Black selections", () => {
    expect(validateSelections("red-vs-black", [{ id: "RED", amount: 20 }])).toBe(true);
    expect(validateSelections("red-vs-black", [{ id: "BLACK", amount: 20 }])).toBe(true);
    expect(validateSelections("red-vs-black", [{ id: "RED", amount: 20 }, { id: "BLACK", amount: 20 }])).toBe(false);
    expect(validateSelections("red-vs-black", [{ id: "PAIR", amount: 20 }])).toBe(false);
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
    for (const gameId of settledGames.filter((id) => id !== "red-vs-black")) {
      const selection = { id: premiumGameDefinitions[gameId].options[0].id, amount: 20 };
      const outcomes = Array.from({ length: 1_000 }, (_, index) => createPremiumOutcome(gameId, `${gameId}:difficulty:${index}`, [selection]));
      const winRate = outcomes.filter((outcome) => outcome.result === "WIN").length / outcomes.length;
      expect(winRate).toBeGreaterThan(0.07);
      expect(winRate).toBeLessThan(0.13);
    }
  });

  it("uses an invertible Flight X display curve and weighted committed endpoint", () => {
    for (const multiplier of [1, 1.05, 1.5, 2, 5, 25, 100, 250]) {
      expect(flightMultiplierAt(flightElapsedFor(multiplier))).toBeCloseTo(multiplier, 2);
    }
    for (let index = 0; index < 500; index += 1) {
      const crash = createFlightCrash(`flight:seed:${index}`);
      expect(crash).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(crash)).toBe(true);
    }
    const survivals = Array.from({ length: 2_000 }, (_, index) => createFlightCrash(`flight:survival:${index}`));
    const launchSurvivalRate = survivals.filter((crash) => crash > 1).length / survivals.length;
    const survivalToTwo = survivals.filter((crash) => crash >= 2).length / survivals.length;
    expect(launchSurvivalRate).toBeGreaterThan(0.87);
    expect(launchSurvivalRate).toBeLessThan(0.93);
    expect(survivalToTwo).toBeGreaterThan(0.42);
    expect(survivalToTwo).toBeLessThan(0.48);
    expect(survivals.filter((crash) => crash >= 5).length).toBeLessThan(survivals.filter((crash) => crash >= 2).length);
    expect(survivals.filter((crash) => crash >= 10).length).toBeLessThan(survivals.filter((crash) => crash >= 5).length);
    expect(survivals.some((crash) => crash >= 20)).toBe(true);
    expect(survivals.some((crash) => crash >= 50)).toBe(true);
  });

  it("locks cash-out calculations to the exact pre-crash multiplier", () => {
    const crash = 3.5;
    const justBeforeCrash = flightElapsedFor(crash) - 10;
    expect(hasFlightCrashed(justBeforeCrash, crash)).toBe(false);
    expect(hasFlightCrashed(flightElapsedFor(crash), crash)).toBe(true);
    expect(flightCashoutPayout(250, 2.347)).toBe(586.75);
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
