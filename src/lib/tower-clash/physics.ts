import { towerProjectileById, type TowerProjectileId, type TowerSide } from "@/lib/tower-clash/constants";

export const TOWER_GRAVITY = 9.81;
export const MIN_POWER = .32;
export const MAX_POWER = 1;

export type TowerShotInput = {
  shooter: TowerSide;
  angle: number;
  power: number;
  projectileId: TowerProjectileId;
  powerShot?: boolean;
  timing?: number;
};

export type ProjectileState = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  elapsed: number;
};

export type TrajectoryPoint = { x: number; y: number; z: number; time: number };
export type AiTowerPlan = { angle: number; power: number; projectileId: TowerProjectileId; targetY: number; powerShot: boolean };

export function shotOrigin(input: Pick<TowerShotInput, "shooter" | "angle">) {
  const angle = Math.max(12, Math.min(78, input.angle)) * Math.PI / 180;
  const direction = input.shooter === "PLAYER" ? 1 : -1;
  return {
    x: (input.shooter === "PLAYER" ? -10.65 : 10.65) + Math.cos(angle) * 2.82 * direction,
    y: 1.02 + Math.sin(angle) * 2.82,
    z: 0,
  };
}

export function launchProjectile(input: TowerShotInput, start: { x: number; y: number; z?: number }): ProjectileState {
  const projectile = towerProjectileById(input.projectileId);
  const angle = Math.max(12, Math.min(78, input.angle)) * Math.PI / 180;
  const power = Math.max(MIN_POWER, Math.min(MAX_POWER, input.power));
  const speed = (14.5 + power * 16.5) * projectile.speed * (input.powerShot ? 1.06 : 1);
  const direction = input.shooter === "PLAYER" ? 1 : -1;
  return {
    x: start.x,
    y: start.y,
    z: start.z ?? 0,
    vx: Math.cos(angle) * speed * direction,
    vy: Math.sin(angle) * speed,
    vz: 0,
    elapsed: 0,
  };
}

export function stepProjectile(state: ProjectileState, deltaSeconds: number, wind: number, projectileId: TowerProjectileId) {
  const projectile = towerProjectileById(projectileId);
  const dt = Math.min(.025, Math.max(.001, deltaSeconds));
  state.vx += wind * .115 * dt;
  state.vy -= TOWER_GRAVITY * projectile.gravity * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.vz * dt;
  state.elapsed += dt;
  return state;
}

export function predictTowerTrajectory(input: TowerShotInput, wind: number, start = shotOrigin(input), maxSeconds = 5.5) {
  const state = launchProjectile(input, start);
  const points: TrajectoryPoint[] = [{ x: state.x, y: state.y, z: state.z, time: 0 }];
  const targetDirection = input.shooter === "PLAYER" ? 1 : -1;
  for (let index = 0; index < maxSeconds / .025; index++) {
    stepProjectile(state, .025, wind, input.projectileId);
    if (index % 4 === 0) points.push({ x: state.x, y: state.y, z: state.z, time: state.elapsed });
    if (state.y <= .2 || state.x * targetDirection > 18) break;
  }
  return points;
}

function targetError(input: TowerShotInput, wind: number, targetX: number, targetY: number) {
  const trajectory = predictTowerTrajectory(input, wind);
  let best = Number.POSITIVE_INFINITY;
  for (const point of trajectory) {
    const horizontalWeight = Math.abs(point.x - targetX) * 1.22;
    const verticalWeight = Math.abs(point.y - targetY);
    best = Math.min(best, Math.hypot(horizontalWeight, verticalWeight));
  }
  return best;
}

export function planTowerAiShot(options: {
  wind: number;
  targetX?: number;
  targetY?: number;
  accuracy: number;
  favored: boolean;
  availableProjectiles: TowerProjectileId[];
  abilityReady: boolean;
}): AiTowerPlan {
  const targetX = options.targetX ?? -13;
  const targetY = options.targetY ?? 3.4;
  const projectileId = options.availableProjectiles[Math.floor(Math.random() * options.availableProjectiles.length)] ?? "iron-shot";
  let best = { angle: 45, power: .7, error: Number.POSITIVE_INFINITY };
  for (let angle = 22; angle <= 70; angle += 2) {
    for (let power = .36; power <= 1.001; power += .025) {
      const input: TowerShotInput = { shooter: "AI", angle, power, projectileId };
      const error = targetError(input, options.wind, targetX, targetY);
      if (error < best.error) best = { angle, power, error };
    }
  }
  const precision = Math.max(.25, Math.min(.98, options.accuracy + (options.favored ? .1 : -.08)));
  const angleError = (Math.random() - .5) * (1 - precision) * 15;
  const powerError = (Math.random() - .5) * (1 - precision) * .24;
  return {
    angle: Math.max(18, Math.min(74, best.angle + angleError)),
    power: Math.max(MIN_POWER, Math.min(MAX_POWER, best.power + powerError)),
    projectileId,
    targetY,
    powerShot: options.abilityReady && Math.random() < .72,
  };
}

export function impactDamage(projectileId: TowerProjectileId, distance: number, directHit: boolean, critical: boolean, powerShot: boolean, timing = 1) {
  const projectile = towerProjectileById(projectileId);
  const falloff = Math.max(.12, 1 - distance / Math.max(.2, projectile.radius));
  const directBonus = directHit ? 1.08 : .78;
  const criticalBonus = critical ? 1.42 : 1;
  const abilityBonus = powerShot ? 1.55 : 1;
  const timingBonus = .88 + Math.max(0, Math.min(1, timing)) * .12;
  return Math.max(0, Math.round(projectile.damage * falloff * directBonus * criticalBonus * abilityBonus * timingBonus));
}

export function nextWind(seed: number, turn: number) {
  const value = Math.sin(seed * .000031 + turn * 2.417) * 6.8 + Math.sin(seed * .00017 + turn * .73) * 2.1;
  return Math.round(Math.max(-9, Math.min(9, value)) * 10) / 10;
}
