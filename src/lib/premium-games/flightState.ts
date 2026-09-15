// Shared clock math: render frames never choose a round endpoint.
export function flightMultiplierAt(elapsedMs: number) {
  return Math.round((Math.exp(Math.max(0, elapsedMs) / 5500) + Number.EPSILON) * 100) / 100;
}
export function flightElapsedFor(multiplier: number) {
  return Math.max(0, Math.log(Math.max(1, multiplier)) * 5500);
}
export function hasFlightCrashed(elapsedMs: number, crashMultiplier: number) {
  return elapsedMs >= flightElapsedFor(crashMultiplier) || flightMultiplierAt(elapsedMs) >= crashMultiplier;
}
export function flightSnapshot(elapsedMs: number, crashMultiplier: number) {
  const crashed = hasFlightCrashed(elapsedMs, crashMultiplier);
  return { crashed, multiplier: crashed ? crashMultiplier : Math.min(crashMultiplier, flightMultiplierAt(elapsedMs)) };
}
