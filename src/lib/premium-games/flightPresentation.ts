import type { ClientHistoryItem } from "@/lib/premium-games/client";

export interface FlightHistoryEntry {
  roundId: string;
  multiplier: number;
  completedAt: string;
}

export function flightPayloadNumber(payload: Record<string, unknown>, key: "crashMultiplier" | "cashedOutMultiplier") {
  const value = Number(payload[key]);
  return Number.isFinite(value) && value >= 1 ? value : null;
}

export function committedCrashMultiplier(payload: Record<string, unknown>, fallback = 1) {
  const safeFallback = Number.isFinite(Number(fallback)) && Number(fallback) >= 1 ? Number(fallback) : 1;
  return flightPayloadNumber(payload, "crashMultiplier") ?? safeFallback;
}

export function visibleFlightCrashMultiplier(payload: Record<string, unknown>, fallback = 1) {
  // The committed crash endpoint is the only round-ending multiplier. A
  // player's cash-out is a separate bet result and must never replace it in
  // the animation, result copy, settlement, or history presentation.
  return committedCrashMultiplier(payload, fallback);
}

export function effectiveFlightCrashMultiplier(
  phase: string,
  active: boolean,
  completedRoundCrash: number,
  spectatorCrash: number,
) {
  return active || phase === "RESULT" ? completedRoundCrash : spectatorCrash;
}

export function spectatorFlightHasEnded(currentMultiplier: number, crashMultiplier: number, playerCashedOut: boolean) {
  return playerCashedOut && currentMultiplier >= crashMultiplier;
}

export function createNaturalFlightCrash(random: () => number = Math.random) {
  const roll = Math.min(1 - Number.EPSILON, Math.max(0, random()));
  return Math.max(1, Math.floor((0.9 / (1 - roll)) * 100) / 100);
}

export function flightCrashFromHistory(item: ClientHistoryItem) {
  if (Number.isFinite(item.multiplier) && item.multiplier >= 1) return item.multiplier;
  const labelValue = Number(item.label.match(/[\d.]+/)?.[0]);
  return Number.isFinite(labelValue) && labelValue >= 1 ? labelValue : null;
}

export function mergeFlightHistory(
  current: readonly FlightHistoryEntry[],
  incoming: readonly FlightHistoryEntry[],
  limit = 8,
) {
  const byRound = new Map<string, FlightHistoryEntry>();
  [...incoming, ...current].forEach((entry) => {
    if (!byRound.has(entry.roundId) && Number.isFinite(entry.multiplier) && entry.multiplier >= 1) {
      byRound.set(entry.roundId, entry);
    }
  });
  return [...byRound.values()]
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime())
    .slice(0, Math.max(0, limit));
}
