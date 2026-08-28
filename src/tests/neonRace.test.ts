import { describe, expect, it } from "vitest";
import { CHECKPOINTS, COMPETITION_TIERS, TRACK_LENGTH, formatRaceTime, tierById, vehicleById } from "../lib/neon/constants";
import { PSEUDO3D_VIEW_DISTANCE, projectRoadPoint, trackCenterAt } from "../lib/neon/pseudo3d";

describe("Neon Drift race configuration", () => {
  it("defines a strictly increasing checkpoint chain ending at the finish", () => {
    expect([...CHECKPOINTS].sort((left, right) => left - right)).toEqual([...CHECKPOINTS]);
    expect(new Set(CHECKPOINTS).size).toBe(CHECKPOINTS.length);
    expect(CHECKPOINTS.at(-1)).toBe(TRACK_LENGTH);
  });

  it("keeps every prize pool equal to two entries", () => {
    for (const tier of COMPETITION_TIERS) expect(tier.pool).toBe(tier.entry * 2);
  });

  it("starts every tier instantly against Expert AI", () => {
    for (const tier of COMPETITION_TIERS) {
      expect(tier.difficulty).toBe("Expert AI");
      expect(tier.matchTime).toBe("Instant");
    }
  });

  it("uses safe defaults for invalid public selections", () => {
    expect(tierById("unknown").id).toBe("rookie");
    expect(vehicleById("unknown").id).toBe("nightfang");
  });

  it("formats photo-finish precision consistently", () => {
    expect(formatRaceTime(58_421)).toBe("00:58.421");
    expect(formatRaceTime(125_007)).toBe("02:05.007");
  });

  it("projects a wide foreground road into a narrow horizon", () => {
    const near = projectRoadPoint(1280, 720, 12, 0, 0, 0);
    const far = projectRoadPoint(1280, 720, PSEUDO3D_VIEW_DISTANCE - 8, 0, 0, 0);
    expect(near.y).toBeGreaterThan(far.y);
    expect(near.halfWidth).toBeGreaterThan(far.halfWidth * 12);
    expect(near.scale).toBeGreaterThan(far.scale);
  });

  it("creates sweeping track curvature and a wider nitro perspective", () => {
    expect(trackCenterAt(0)).not.toBe(trackCenterAt(900));
    const normal = projectRoadPoint(1280, 720, 18, 1200, 0, 0);
    const nitro = projectRoadPoint(1280, 720, 18, 1200, 0, 1);
    expect(nitro.halfWidth).toBeGreaterThan(normal.halfWidth);
  });
});
