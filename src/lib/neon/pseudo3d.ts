export const PSEUDO3D_VIEW_DISTANCE = 760;

export type RoadProjection = {
  center: number;
  y: number;
  halfWidth: number;
  depth: number;
  scale: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function trackCenterAt(z: number) {
  const citySweep = Math.sin(z / 335) * .46 + Math.sin(z / 930) * .24;
  const switchbacks = z > 1580 && z < 2520 ? Math.sin((z - 1580) / 118) * .34 : 0;
  const finalCurve = z > 3300 ? Math.sin((z - 3300) / 165) * .3 : 0;
  return citySweep + switchbacks + finalCurve;
}

export function trackElevationAt(z: number) {
  return Math.sin(z / 570) * .22 + Math.sin(z / 1450) * .17;
}

export function projectRoadPoint(
  width: number,
  height: number,
  relativeZ: number,
  cameraZ: number,
  cameraLane: number,
  cameraPull: number,
): RoadProjection {
  const depth = clamp(1 - relativeZ / PSEUDO3D_VIEW_DISTANCE, 0, 1);
  const perspective = Math.pow(depth, 2.03 - cameraPull * .16);
  const landscapeCompact = height < 520;
  const horizon = height * (landscapeCompact ? .245 : .255) - height * cameraPull * .022;
  const bottom = height * (landscapeCompact ? 1.08 : 1.055);
  const nearHalf = width * (.535 + cameraPull * .045);
  const halfWidth = mix(width * .014, nearHalf, Math.pow(depth, 1.3));
  const worldZ = cameraZ + relativeZ;
  const curveDelta = trackCenterAt(worldZ) - trackCenterAt(cameraZ);
  const cameraShift = -cameraLane * halfWidth * .67;
  const curveShift = curveDelta * width * (.17 + (1 - depth) * .085);
  const elevationDelta = trackElevationAt(worldZ) - trackElevationAt(cameraZ);
  const y = mix(horizon, bottom, perspective) - elevationDelta * height * .075 * (1 - perspective);

  return {
    center: width * .5 + curveShift + cameraShift,
    y,
    halfWidth,
    depth,
    scale: .055 + Math.pow(depth, 1.72) * .945,
  };
}
