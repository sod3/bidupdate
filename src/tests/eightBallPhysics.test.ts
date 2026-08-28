import { describe, expect, it, vi } from "vitest";
import { ballGroup } from "../lib/eight-ball/constants";
import {
  BALL_RADIUS,
  createRack,
  planAiShot,
  predictAim,
  stepPoolPhysics,
  strikeCueBall,
  validCuePlacement,
  type PoolBallState,
} from "../lib/eight-ball/physics";

function ball(number: number, x: number, z: number): PoolBallState {
  return {
    id: number,
    number,
    x,
    z,
    vx: 0,
    vz: 0,
    sideSpin: 0,
    topSpin: 0,
    rotationX: 0,
    rotationZ: 0,
    pocketed: false,
  };
}

describe("8 Ball Cash Arena physics", () => {
  it("creates a complete legal 8-ball rack", () => {
    const rack = createRack();
    expect(rack).toHaveLength(16);
    expect(new Set(rack.map((item) => item.number)).size).toBe(16);

    const eight = rack.find((item) => item.number === 8);
    expect(eight?.z).toBeGreaterThan(.8);
    expect(Math.abs(eight?.x ?? 1)).toBeLessThan(BALL_RADIUS);

    const rearRow = rack.filter((item) => item.number !== 0).sort((left, right) => right.z - left.z).slice(0, 5);
    const rearCorners = rearRow.sort((left, right) => left.x - right.x).filter((_, index) => index === 0 || index === 4);
    expect(new Set(rearCorners.map((item) => ballGroup(item.number)))).toEqual(new Set(["SOLIDS", "STRIPES"]));
  });

  it("transfers momentum in a head-on cue-ball collision", () => {
    const balls = [ball(0, 0, 0), ball(1, 0, .15)];
    expect(strikeCueBall(balls, 0, 1, { x: 0, y: 0 })).toBe(true);
    const events = stepPoolPhysics(balls, .01);
    expect(events.collisions).toHaveLength(1);
    expect(balls[1].vz).toBeGreaterThan(4);
    expect(Math.abs(balls[0].vz)).toBeLessThan(.3);
  });

  it("curves the cue-ball path when side spin is applied", () => {
    const straight = [ball(0, 0, 0)];
    const english = [ball(0, 0, 0)];
    strikeCueBall(straight, 0, .7, { x: 0, y: 0 });
    strikeCueBall(english, 0, .7, { x: 1, y: 0 });
    for (let step = 0; step < 18; step++) {
      stepPoolPhysics(straight, .016);
      stepPoolPhysics(english, .016);
    }
    expect(Math.abs(straight[0].x)).toBeLessThan(.001);
    expect(Math.abs(english[0].x)).toBeGreaterThan(.02);
  });

  it("predicts first contact and rejects overlapping cue placement", () => {
    const balls = [ball(0, 0, -1), ball(3, 0, 0), ball(9, 0, .8)];
    expect(predictAim(balls, 0).targetNumber).toBe(3);
    expect(validCuePlacement(.6, -1, balls)).toBe(true);
    expect(validCuePlacement(0, 0, balls)).toBe(false);
    expect(validCuePlacement(4, 0, balls)).toBe(false);
  });

  it("only plans legal group targets and reserves the eight for the finish", () => {
    vi.spyOn(Math, "random").mockReturnValue(.5);
    const balls = [ball(0, 0, -1.4), ball(2, -.35, .2), ball(10, .35, .25), ball(8, 0, .8)];
    expect(ballGroup(planAiShot(balls, "SOLIDS", false, true).targetNumber ?? 0)).toBe("SOLIDS");
    expect(ballGroup(planAiShot(balls, "STRIPES", false, true).targetNumber ?? 0)).toBe("STRIPES");
    expect(planAiShot(balls, "SOLIDS", true, true).targetNumber).toBe(8);
    vi.restoreAllMocks();
  });
});
