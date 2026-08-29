export type Vector2 = { x: number; y: number };
export type ArcheryShotInput = {
  angle: number;
  power: number;
  windKmh: number;
  distance: number;
  targetY: number;
  targetVelocity: number;
  releaseDelay?: number;
};

export type ArcheryImpact = {
  point: Vector2;
  targetCenter: Vector2;
  offset: Vector2;
  radius: number;
  baseScore: number;
  totalScore: number;
  bullseye: boolean;
  perfect: boolean;
  longRange: boolean;
};

const GRAVITY = 9.81;
const MIN_SPEED = 39;
const MAX_SPEED = 69;

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function arrowVelocity(angle: number, power: number): Vector2 {
  const radians = clamp(angle, 2, 68) * Math.PI / 180;
  const speed = MIN_SPEED + clamp(power, 0, 1) * (MAX_SPEED - MIN_SPEED);
  return { x: Math.cos(radians) * speed, y: Math.sin(radians) * speed };
}

export function targetPosition(distance: number, targetY: number, targetVelocity: number, time: number): Vector2 {
  const movement = targetVelocity === 0 ? 0 : Math.sin(time * 1.65) * targetVelocity;
  return { x: distance, y: targetY + movement };
}

export function trajectoryPoint(input: ArcheryShotInput, time: number): Vector2 {
  const velocity = arrowVelocity(input.angle, input.power);
  const windAcceleration = input.windKmh * .0125;
  return {
    x: velocity.x * time + .5 * windAcceleration * time * time,
    y: velocity.y * time - .5 * GRAVITY * time * time,
  };
}

export function flightTimeToDistance(input: ArcheryShotInput) {
  const velocity = arrowVelocity(input.angle, input.power);
  const windAcceleration = input.windKmh * .0125;
  if (Math.abs(windAcceleration) < .0001) return input.distance / velocity.x;
  const discriminant = Math.max(0, velocity.x * velocity.x + 2 * windAcceleration * input.distance);
  const roots = [(-velocity.x + Math.sqrt(discriminant)) / windAcceleration, (-velocity.x - Math.sqrt(discriminant)) / windAcceleration];
  return roots.find((value) => value > 0) ?? input.distance / velocity.x;
}

export function scoreArcheryShot(input: ArcheryShotInput): ArcheryImpact {
  const time = flightTimeToDistance(input);
  const releaseDelay = Math.max(0, input.releaseDelay ?? 0);
  const point = trajectoryPoint(input, time);
  const center = targetPosition(input.distance, input.targetY, input.targetVelocity, time + releaseDelay);
  const offset = { x: point.x - center.x, y: point.y - center.y };
  const radius = Math.hypot(offset.x, offset.y);
  const baseScore = radius <= .16 ? 100 : radius <= .34 ? 90 : radius <= .58 ? 80 : radius <= .86 ? 70 : radius <= 1.18 ? 60 : radius <= 1.55 ? 50 : radius <= 1.95 ? 40 : radius <= 2.4 ? 30 : radius <= 2.9 ? 20 : radius <= 3.5 ? 10 : 0;
  const bullseye = baseScore === 100;
  const perfect = radius <= .08;
  const longRange = input.distance >= 80 && baseScore >= 70;
  return { point, targetCenter: center, offset, radius, baseScore, totalScore: baseScore + (perfect ? 15 : 0) + (longRange ? 10 : 0), bullseye, perfect, longRange };
}

export function guidePoints(input: ArcheryShotInput, count = 14): Vector2[] {
  const fullFlight = flightTimeToDistance(input);
  return Array.from({ length: count }, (_, index) => trajectoryPoint(input, fullFlight * .58 * ((index + 1) / count)));
}

export function obstacleCollision(input: ArcheryShotInput, x: number, height: number) {
  const velocity = arrowVelocity(input.angle, input.power);
  const windAcceleration = input.windKmh * .0125;
  const discriminant = Math.max(0, velocity.x * velocity.x + 2 * windAcceleration * x);
  const time = Math.abs(windAcceleration) < .0001
    ? x / velocity.x
    : [(-velocity.x + Math.sqrt(discriminant)) / windAcceleration, (-velocity.x - Math.sqrt(discriminant)) / windAcceleration].find((value) => value > 0) ?? x / velocity.x;
  const point = trajectoryPoint(input, time);
  return { hit: point.y <= height, point, time };
}

export function solveAngleForTarget(power: number, distance: number, height: number, windKmh: number) {
  let best = { angle: 35, error: Number.POSITIVE_INFINITY };
  for (let angle = 2; angle <= 68; angle += .02) {
    const input: ArcheryShotInput = { angle, power, windKmh, distance, targetY: height, targetVelocity: 0 };
    const time = flightTimeToDistance(input);
    const error = Math.abs(trajectoryPoint(input, time).y - height);
    if (error < best.error) best = { angle, error };
  }
  return best.angle;
}

export function planArcheryAiShot(input: {
  windKmh: number;
  distance: number;
  targetY: number;
  targetVelocity: number;
  accuracy: number;
  favored: boolean;
  targetPhase?: number;
  random?: () => number;
}) {
  const random = input.random ?? Math.random;
  const power = clamp(.68 + input.distance / 310 + (random() - .5) * .04, .65, .98);
  const estimatedFlight = input.distance / arrowVelocity(35, power).x;
  const releaseDelay = Math.max(0, input.targetPhase ?? .45);
  const predictedTarget = targetPosition(input.distance, input.targetY, input.targetVelocity, estimatedFlight + releaseDelay);
  const idealAngle = solveAngleForTarget(power, input.distance, predictedTarget.y, input.windKmh);
  const effectiveAccuracy = clamp(input.accuracy + (input.favored ? .16 : -.025), .58, .995);
  const spread = (1 - effectiveAccuracy) * 9;
  const miss = (random() - .5) * 2 * spread + (input.favored ? 0 : (random() < .5 ? -1 : 1) * .55);
  return { angle: clamp(idealAngle + miss, 2, 68), power, releaseDelay };
}

export function nextArcheryRound(seed: number, round: number, minimumDistance: number, maximumDistance: number) {
  const noise = Math.sin(seed * 12.9898 + round * 78.233) * 43758.5453;
  const unit = noise - Math.floor(noise);
  const windNoise = Math.sin(seed * 4.31 + round * 17.17) * 23841.31;
  const windUnit = windNoise - Math.floor(windNoise);
  return {
    distance: Math.round(minimumDistance + unit * (maximumDistance - minimumDistance)),
    windKmh: Math.round((windUnit * 2 - 1) * (13 + round * 2.7)),
    targetY: 3.6 + ((round % 3) - 1) * .32,
    targetVelocity: round < 1 ? 0 : .28 + round * .15,
  };
}
