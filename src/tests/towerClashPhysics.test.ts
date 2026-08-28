import { describe, expect, it, vi } from "vitest";
import { towerRankFromPoints } from "../lib/tower-clash/constants";
import {
  impactDamage,
  launchProjectile,
  nextWind,
  planTowerAiShot,
  predictTowerTrajectory,
  shotOrigin,
} from "../lib/tower-clash/physics";

describe("Tower Clash ballistics", () => {
  it("launches player and AI shots toward opposing castles", () => {
    const playerInput = { shooter: "PLAYER" as const, angle: 45, power: .7, projectileId: "iron-shot" as const };
    const aiInput = { ...playerInput, shooter: "AI" as const };
    const player = launchProjectile(playerInput, shotOrigin(playerInput));
    const ai = launchProjectile(aiInput, shotOrigin(aiInput));
    expect(player.vx).toBeGreaterThan(0);
    expect(ai.vx).toBeLessThan(0);
    expect(player.vy).toBeGreaterThan(0);
    expect(ai.vy).toBeGreaterThan(0);
  });

  it("changes projectile travel with directional wind", () => {
    const input = { shooter: "PLAYER" as const, angle: 42, power: .68, projectileId: "iron-shot" as const };
    const tailwind = predictTowerTrajectory(input, 8).find((point) => point.time >= 1)!;
    const headwind = predictTowerTrajectory(input, -8).find((point) => point.time >= 1)!;
    expect(tailwind.x).toBeGreaterThan(headwind.x);
  });

  it("amplifies critical and royal power-shot damage", () => {
    const standard = impactDamage("blast-core", 0, true, false, false);
    const critical = impactDamage("blast-core", 0, true, true, false);
    const royal = impactDamage("blast-core", 0, true, true, true);
    expect(critical).toBeGreaterThan(standard);
    expect(royal).toBeGreaterThan(critical);
    expect(impactDamage("blast-core", 10, false, false, false)).toBeLessThan(standard);
  });

  it("plans a high-accuracy AI shot near the target castle", () => {
    vi.spyOn(Math, "random").mockReturnValue(.5);
    const plan = planTowerAiShot({ wind: 2.5, targetX: -14, targetY: 3.2, accuracy: .9, favored: true, availableProjectiles: ["iron-shot"], abilityReady: false });
    const trajectory = predictTowerTrajectory({ shooter: "AI", angle: plan.angle, power: plan.power, projectileId: plan.projectileId }, 2.5);
    const closest = Math.min(...trajectory.map((point) => Math.hypot((point.x + 14) * 1.22, point.y - 3.2)));
    expect(closest).toBeLessThan(1.6);
    vi.restoreAllMocks();
  });

  it("produces deterministic changing wind and the requested rank ladder", () => {
    expect(nextWind(12345, 2)).toBe(nextWind(12345, 2));
    expect(nextWind(12345, 2)).not.toBe(nextWind(12345, 3));
    expect(towerRankFromPoints(0)).toBe("Rookie");
    expect(towerRankFromPoints(320)).toBe("Warrior");
    expect(towerRankFromPoints(1600)).toBe("Legend");
  });
});
