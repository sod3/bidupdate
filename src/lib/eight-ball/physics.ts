import { ballGroup, type BallGroup } from "@/lib/eight-ball/constants";

export const BALL_RADIUS = 0.057;
export const TABLE_HALF_WIDTH = 1.17;
export const TABLE_HALF_LENGTH = 2.34;
export const MAX_SHOT_SPEED = 5.15;

export type SpinInput = { x: number; y: number };
export type PoolBallState = {
  id: number;
  number: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  sideSpin: number;
  topSpin: number;
  rotationX: number;
  rotationZ: number;
  pocketed: boolean;
};

export type PhysicsEvents = {
  collisions: Array<{ a: number; b: number; force: number }>;
  railHits: number[];
  pocketed: number[];
};

export type AimPrediction = {
  endX: number;
  endZ: number;
  targetNumber: number | null;
  objectEndX: number | null;
  objectEndZ: number | null;
};

export type PlannedShot = { angle: number; power: number; spin: SpinInput; targetNumber: number | null; bank: boolean };

export const POCKETS = [
  { x: -1.205, z: -2.39, radius: .145 }, { x: 1.205, z: -2.39, radius: .145 },
  { x: -1.225, z: 0, radius: .135 }, { x: 1.225, z: 0, radius: .135 },
  { x: -1.205, z: 2.39, radius: .145 }, { x: 1.205, z: 2.39, radius: .145 },
] as const;

const BALL_COLORS: Record<number, string> = {
  0: "#f8fafc", 1: "#f4c430", 2: "#2563eb", 3: "#dc2626", 4: "#7c3aed", 5: "#f97316",
  6: "#15803d", 7: "#7f1d1d", 8: "#080808", 9: "#f4c430", 10: "#2563eb", 11: "#dc2626",
  12: "#7c3aed", 13: "#f97316", 14: "#15803d", 15: "#7f1d1d",
};

export function colorForBall(number: number) {
  return BALL_COLORS[number] ?? "#ffffff";
}

export function createRack(): PoolBallState[] {
  const balls: PoolBallState[] = [{ id: 0, number: 0, x: 0, z: -1.48, vx: 0, vz: 0, sideSpin: 0, topSpin: 0, rotationX: 0, rotationZ: 0, pocketed: false }];
  // WPA-style legal rack: the 8 sits in the center and the two rear corners
  // contain one solid and one stripe.
  const rack = [[1], [9, 2], [10, 8, 3], [15, 11, 12, 5], [13, 6, 14, 7, 4]];
  const spacing = BALL_RADIUS * 2.045;
  const rowDepth = spacing * Math.sqrt(3) / 2;
  rack.forEach((row, rowIndex) => row.forEach((number, column) => {
    balls.push({
      id: number,
      number,
      x: (column - rowIndex / 2) * spacing,
      z: .73 + rowIndex * rowDepth,
      vx: 0,
      vz: 0,
      sideSpin: 0,
      topSpin: 0,
      rotationX: 0,
      rotationZ: 0,
      pocketed: false,
    });
  }));
  return balls;
}

export function cloneBalls(balls: PoolBallState[]) {
  return balls.map((ball) => ({ ...ball }));
}

function nearPocketOpening(ball: PoolBallState, axis: "x" | "z") {
  if (axis === "x") return Math.abs(ball.z) < .17 || Math.abs(Math.abs(ball.z) - TABLE_HALF_LENGTH) < .19;
  return Math.abs(Math.abs(ball.x) - TABLE_HALF_WIDTH) < .19;
}

export function stepPoolPhysics(balls: PoolBallState[], deltaSeconds: number, reusableEvents?: PhysicsEvents): PhysicsEvents {
  const events: PhysicsEvents = reusableEvents ?? { collisions: [], railHits: [], pocketed: [] };
  events.collisions.length = 0;
  events.railHits.length = 0;
  events.pocketed.length = 0;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return events;
  const dt = Math.min(.018, deltaSeconds);
  for (const ball of balls) {
    if (ball.pocketed) continue;
    const speedSquared = ball.vx * ball.vx + ball.vz * ball.vz;
    if (speedSquared > .000004) {
      const speed = Math.sqrt(speedSquared);
      const curve = ball.sideSpin * .34 * dt * Math.min(1, speed / 2.2);
      const cosine = Math.cos(curve);
      const sine = Math.sin(curve);
      const vx = ball.vx * cosine - ball.vz * sine;
      ball.vz = ball.vx * sine + ball.vz * cosine;
      ball.vx = vx;
      const rollingBoost = ball.topSpin * .16 * dt;
      ball.vx *= 1 + rollingBoost;
      ball.vz *= 1 + rollingBoost;
      ball.x += ball.vx * dt;
      ball.z += ball.vz * dt;
      ball.rotationX += ball.vz * dt / BALL_RADIUS;
      ball.rotationZ -= ball.vx * dt / BALL_RADIUS;
      const drag = Math.max(0, 1 - (.18 + .22 / Math.max(.02, speed)) * dt);
      ball.vx *= drag;
      ball.vz *= drag;
      ball.sideSpin *= Math.max(0, 1 - 1.35 * dt);
      ball.topSpin *= Math.max(0, 1 - 1.7 * dt);
      if (ball.vx * ball.vx + ball.vz * ball.vz < .000324) {
        ball.vx = 0;
        ball.vz = 0;
      }
    }

    const pocket = POCKETS.find((item) => {
      const dx = ball.x - item.x;
      const dz = ball.z - item.z;
      return dx * dx + dz * dz < item.radius * item.radius;
    });
    if (pocket) {
      ball.pocketed = true;
      ball.vx = 0;
      ball.vz = 0;
      events.pocketed.push(ball.number);
      continue;
    }

    if (Math.abs(ball.x) > TABLE_HALF_WIDTH && (!nearPocketOpening(ball, "x") || Math.abs(ball.x) > TABLE_HALF_WIDTH + .10)) {
      ball.x = Math.sign(ball.x) * TABLE_HALF_WIDTH;
      ball.vx = -ball.vx * .88;
      ball.vz *= .985;
      ball.sideSpin *= -.62;
      events.railHits.push(ball.number);
    }
    if (Math.abs(ball.z) > TABLE_HALF_LENGTH && (!nearPocketOpening(ball, "z") || Math.abs(ball.z) > TABLE_HALF_LENGTH + .10)) {
      ball.z = Math.sign(ball.z) * TABLE_HALF_LENGTH;
      ball.vz = -ball.vz * .88;
      ball.vx *= .985;
      ball.sideSpin *= -.62;
      events.railHits.push(ball.number);
    }
  }

  for (let leftIndex = 0; leftIndex < balls.length; leftIndex++) {
    const left = balls[leftIndex];
    if (left.pocketed) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < balls.length; rightIndex++) {
      const right = balls[rightIndex];
      if (right.pocketed) continue;
      const dx = right.x - left.x;
      const dz = right.z - left.z;
      const minimum = BALL_RADIUS * 2;
      // Most pairs are far apart. This cheap axis test avoids a square root for them.
      if (Math.abs(dx) >= minimum || Math.abs(dz) >= minimum) continue;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= minimum * minimum) continue;
      const distance = Math.sqrt(distanceSquared);
      const nx = distance > 1e-8 ? dx / distance : 1;
      const nz = distance > 1e-8 ? dz / distance : 0;
      const overlap = minimum - distance;
      left.x -= nx * overlap * .5;
      left.z -= nz * overlap * .5;
      right.x += nx * overlap * .5;
      right.z += nz * overlap * .5;
      const relative = (left.vx - right.vx) * nx + (left.vz - right.vz) * nz;
      if (relative <= 0) continue;
      const impulse = relative * .965;
      left.vx -= impulse * nx;
      left.vz -= impulse * nz;
      if (left.number === 0) { left.vx += nx * left.topSpin * impulse * .22; left.vz += nz * left.topSpin * impulse * .22; left.topSpin *= .3; }
      right.vx += impulse * nx;
      right.vz += impulse * nz;
      if (right.number === 0) { right.vx -= nx * right.topSpin * impulse * .22; right.vz -= nz * right.topSpin * impulse * .22; right.topSpin *= .3; }
      const tangentX = -nz;
      const tangentZ = nx;
      const tangential = (left.vx - right.vx) * tangentX + (left.vz - right.vz) * tangentZ;
      left.vx -= tangential * tangentX * .012;
      left.vz -= tangential * tangentZ * .012;
      right.vx += tangential * tangentX * .012;
      right.vz += tangential * tangentZ * .012;
      events.collisions.push({ a: left.number, b: right.number, force: relative });
    }
  }
  return events;
}

export function ballsAreMoving(balls: PoolBallState[]) {
  return balls.some((ball) => !ball.pocketed && ball.vx * ball.vx + ball.vz * ball.vz > .0004);
}

export function strikeCueBall(balls: PoolBallState[], angle: number, power: number, spin: SpinInput) {
  if (![angle,power,spin.x,spin.y].every(Number.isFinite)) return false;
  const cue = balls.find((ball) => ball.number === 0);
  if (!cue || cue.pocketed) return false;
  const speed = Math.max(.05, Math.min(1, power)) * MAX_SHOT_SPEED;
  cue.vx = Math.sin(angle) * speed;
  cue.vz = Math.cos(angle) * speed;
  cue.sideSpin = Math.max(-1, Math.min(1, spin.x)) * 1.8;
  cue.topSpin = Math.max(-1, Math.min(1, spin.y)) * 1.3;
  return true;
}

function rayCircleDistance(originX: number, originZ: number, dirX: number, dirZ: number, ball: PoolBallState) {
  const dx = ball.x - originX;
  const dz = ball.z - originZ;
  const projection = dx * dirX + dz * dirZ;
  if (projection <= 0) return null;
  const perpendicularSq = dx * dx + dz * dz - projection * projection;
  const radius = BALL_RADIUS * 2;
  if (perpendicularSq >= radius * radius) return null;
  return projection - Math.sqrt(radius * radius - perpendicularSq);
}

export function predictAim(balls: PoolBallState[], angle: number): AimPrediction {
  const cue = balls.find((ball) => ball.number === 0 && !ball.pocketed);
  if (!cue) return { endX: 0, endZ: 0, targetNumber: null, objectEndX: null, objectEndZ: null };
  const dirX = Math.sin(angle);
  const dirZ = Math.cos(angle);
  let distance = 5;
  let target: PoolBallState | null = null;
  for (const ball of balls) {
    if (ball.number === 0 || ball.pocketed) continue;
    const candidate = rayCircleDistance(cue.x, cue.z, dirX, dirZ, ball);
    if (candidate !== null && candidate < distance) {
      distance = candidate;
      target = ball;
    }
  }
  const railX = dirX > .001 ? (TABLE_HALF_WIDTH - cue.x) / dirX : dirX < -.001 ? (-TABLE_HALF_WIDTH - cue.x) / dirX : Infinity;
  const railZ = dirZ > .001 ? (TABLE_HALF_LENGTH - cue.z) / dirZ : dirZ < -.001 ? (-TABLE_HALF_LENGTH - cue.z) / dirZ : Infinity;
  const railDistance = Math.min(railX > 0 ? railX : Infinity, railZ > 0 ? railZ : Infinity);
  if (railDistance < distance) target = null;
  distance = Math.min(distance, railDistance);
  const endX = cue.x + dirX * distance;
  const endZ = cue.z + dirZ * distance;
  if (!target) return { endX, endZ, targetNumber: null, objectEndX: null, objectEndZ: null };
  const objectDirectionX = target.x - endX;
  const objectDirectionZ = target.z - endZ;
  const length = Math.max(.001, Math.hypot(objectDirectionX, objectDirectionZ));
  return { endX, endZ, targetNumber: target.number, objectEndX: target.x + objectDirectionX / length * .55, objectEndZ: target.z + objectDirectionZ / length * .55 };
}

export function pathClear(balls: PoolBallState[], startX: number, startZ: number, endX: number, endZ: number, ignored: Set<number>) {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const length = Math.hypot(dx, dz);
  if (length < .001) return false;
  const nx = dx / length;
  const nz = dz / length;
  return balls.every((ball) => {
    if (ball.pocketed || ignored.has(ball.number)) return true;
    const bx = ball.x - startX;
    const bz = ball.z - startZ;
    const along = bx * nx + bz * nz;
    if (along <= 0 || along >= length) return true;
    return Math.abs(bx * nz - bz * nx) > BALL_RADIUS * 2.08;
  });
}

export function planAiShot(balls: PoolBallState[], group: BallGroup | null, canShootEight: boolean, favored: boolean): PlannedShot {
  const cue = balls.find((ball) => ball.number === 0 && !ball.pocketed);
  if (!cue) return { angle: 0, power: .55, spin: { x: 0, y: 0 }, targetNumber: null, bank: false };
  const legal = balls.filter((ball) => !ball.pocketed && ball.number !== 0 && (canShootEight ? ball.number === 8 : group ? ballGroup(ball.number) === group : ball.number !== 8));
  const options: Array<{ angle: number; power: number; score: number; target: number }> = [];
  for (const target of legal) {
    for (const pocket of POCKETS) {
      const toPocketX = pocket.x - target.x;
      const toPocketZ = pocket.z - target.z;
      const objectDistance = Math.hypot(toPocketX, toPocketZ);
      const directionX = toPocketX / Math.max(.001, objectDistance);
      const directionZ = toPocketZ / Math.max(.001, objectDistance);
      const ghostX = target.x - directionX * BALL_RADIUS * 2;
      const ghostZ = target.z - directionZ * BALL_RADIUS * 2;
      if (Math.abs(ghostX) > TABLE_HALF_WIDTH || Math.abs(ghostZ) > TABLE_HALF_LENGTH) continue;
      if (!pathClear(balls, target.x, target.z, pocket.x, pocket.z, new Set([target.number]))) continue;
      if (!pathClear(balls, cue.x, cue.z, ghostX, ghostZ, new Set([0, target.number]))) continue;
      const cueDistance = Math.hypot(ghostX - cue.x, ghostZ - cue.z);
      const cut = Math.abs((ghostX - cue.x) / Math.max(.001, cueDistance) * directionZ - (ghostZ - cue.z) / Math.max(.001, cueDistance) * directionX);
      options.push({ angle: Math.atan2(ghostX - cue.x, ghostZ - cue.z), power: Math.min(.92, .36 + (cueDistance + objectDistance) / 7), score: cueDistance + objectDistance + cut * 2.2, target: target.number });
    }
  }
  options.sort((left, right) => left.score - right.score);
  const best = options[0];
  if (best) {
    const errorDegrees = favored ? (Math.random() - .5) * .8 : (Math.random() - .5) * 5.5;
    return { angle: best.angle + errorDegrees * Math.PI / 180, power: Math.max(.32, best.power + (Math.random() - .5) * (favored ? .022 : .1)), spin: { x: (Math.random() - .5) * .14, y: favored ? .2 : .04 }, targetNumber: best.target, bank: false };
  }
  const fallback = legal.sort((left, right) => Math.hypot(left.x - cue.x, left.z - cue.z) - Math.hypot(right.x - cue.x, right.z - cue.z))[0];
  if (!fallback) return { angle: 0, power: .45, spin: { x: 0, y: 0 }, targetNumber: null, bank: false };
  return { angle: Math.atan2(fallback.x - cue.x, fallback.z - cue.z) + (Math.random() - .5) * (favored ? .018 : .09), power: favored ? .72 : .58, spin: { x: favored ? .2 : 0, y: -.08 }, targetNumber: fallback.number, bank: true };
}

export function validCuePlacement(x: number, z: number, balls: PoolBallState[]) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > TABLE_HALF_WIDTH - BALL_RADIUS || Math.abs(z) > TABLE_HALF_LENGTH - BALL_RADIUS) return false;
  return balls.every((ball) => ball.pocketed || ball.number === 0 || Math.hypot(ball.x - x, ball.z - z) >= BALL_RADIUS * 2.08);
}
