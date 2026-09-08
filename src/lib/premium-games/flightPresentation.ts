export function flightPayloadNumber(payload: Record<string, unknown>, key: "crashMultiplier" | "cashedOutMultiplier") {
  const value = Number(payload[key]);
  return Number.isFinite(value) && value >= 1 ? value : null;
}

export function committedCrashMultiplier(payload: Record<string, unknown>, fallback = 1) {
  return flightPayloadNumber(payload, "crashMultiplier") ?? Math.max(1, fallback);
}

export function visibleFlightCrashMultiplier(payload: Record<string, unknown>, fallback = 1) {
  return Math.max(
    committedCrashMultiplier(payload, fallback),
    flightPayloadNumber(payload, "cashedOutMultiplier") ?? 1,
  );
}

export function spectatorFlightHasEnded(currentMultiplier: number, crashMultiplier: number, playerCashedOut: boolean) {
  return playerCashedOut && currentMultiplier >= crashMultiplier;
}
