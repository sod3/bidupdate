export function flightPayloadNumber(payload: Record<string, unknown>, key: "crashMultiplier" | "cashedOutMultiplier") {
  const value = Number(payload[key]);
  return Number.isFinite(value) && value >= 1 ? value : null;
}

export function committedCrashMultiplier(payload: Record<string, unknown>, fallback = 1) {
  const safeFallback = Number.isFinite(Number(fallback)) && Number(fallback) >= 1 ? Number(fallback) : 1;
  return flightPayloadNumber(payload, "crashMultiplier") ?? safeFallback;
}

export function visibleFlightCrashMultiplier(payload: Record<string, unknown>, fallback = 1) {
  const safeFallback = Number.isFinite(Number(fallback)) && Number(fallback) >= 1 ? Number(fallback) : 1;
  const crash = committedCrashMultiplier(payload, safeFallback);
  const cashedOut = flightPayloadNumber(payload, "cashedOutMultiplier") ?? 1;
  const safeCrash = Number.isFinite(crash) ? crash : 1;
  const safeCashedOut = Number.isFinite(cashedOut) ? cashedOut : 1;
  return Math.max(safeCrash, safeCashedOut);
}

export function spectatorFlightHasEnded(currentMultiplier: number, crashMultiplier: number, playerCashedOut: boolean) {
  return playerCashedOut && currentMultiplier >= crashMultiplier;
}
