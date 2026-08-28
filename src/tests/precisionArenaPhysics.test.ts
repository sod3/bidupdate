import { describe, expect, it } from "vitest";
import { ARCHERY_TIERS, archeryRankFromPoints } from "@/lib/precision-arena/constants";
import { flightTimeToDistance, guidePoints, nextArcheryRound, planArcheryAiShot, scoreArcheryShot, solveAngleForTarget } from "@/lib/precision-arena/physics";

describe("Precision Arena physics", () => {
  it("solves a still-target bullseye using the same flight model", () => {
    const input = { power: .82, distance: 70, targetY: 3.6, targetVelocity: 0, windKmh: 7 };
    const angle = solveAngleForTarget(input.power, input.distance, input.targetY, input.windKmh);
    const impact = scoreArcheryShot({ ...input, angle });
    expect(impact.baseScore).toBe(100);
    expect(impact.radius).toBeLessThan(.02);
  });

  it("keeps the trajectory guide shorter than the full flight", () => {
    const input = { angle: 38, power: .8, distance: 80, targetY: 3.6, targetVelocity: 0, windKmh: -10 };
    const points = guidePoints(input);
    expect(points).toHaveLength(14);
    expect(points.at(-1)!.x).toBeLessThan(input.distance * .7);
    expect(flightTimeToDistance(input)).toBeGreaterThan(0);
  });

  it("gives favored AI a tighter plan than unfavored AI", () => {
    const values = [.99, .2, .99, .2];
    let index = 0;
    const common = { windKmh: -8, distance: 82, targetY: 3.6, targetVelocity: .4, accuracy: .75, random: () => values[index++ % values.length] };
    const favored = planArcheryAiShot({ ...common, favored: true });
    index = 0;
    const unfavored = planArcheryAiShot({ ...common, favored: false });
    expect(Math.abs(favored.angle - unfavored.angle)).toBeGreaterThan(.2);
  });

  it("generates deterministic but changing round conditions", () => {
    expect(nextArcheryRound(42, 2, 60, 90)).toEqual(nextArcheryRound(42, 2, 60, 90));
    expect(nextArcheryRound(42, 2, 60, 90)).not.toEqual(nextArcheryRound(42, 3, 60, 90));
  });

  it("keeps every duel in the very-hard tuning range", () => {
    expect(ARCHERY_TIERS.every((tier) => tier.accuracy >= .86)).toBe(true);
    expect(ARCHERY_TIERS.every((tier) => tier.distance[0] >= 58)).toBe(true);
    const lateRound = nextArcheryRound(42, 4, 88, 112);
    expect(lateRound.targetVelocity).toBeGreaterThanOrEqual(.88);
  });

  it("progresses through the six arena ranks", () => {
    expect(archeryRankFromPoints(0)).toBe("Rookie");
    expect(archeryRankFromPoints(1500)).toBe("Legend");
  });
});
