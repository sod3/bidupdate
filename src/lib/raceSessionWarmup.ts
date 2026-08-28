"use client";

export type WarmRaceSession = {
  token: string;
  playerId: string;
  username: string;
  level: number;
  rank: string;
  error?: string;
};

export class RaceSessionWarmupError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "RaceSessionWarmupError";
  }
}

let cached: { expiresAt: number; promise: Promise<WarmRaceSession> } | null = null;

/**
 * Reuses the harmless race authorization request started from the entry lobby.
 * The match itself is NOT created here and no credits are debited. This simply
 * removes a duplicate authorization/network round-trip after the user presses
 * Play now.
 */
export function getWarmRaceSession() {
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = fetch("/api/neon-drift/session", {
    method: "POST",
    credentials: "same-origin",
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({})) as WarmRaceSession;
    if (!response.ok) throw new RaceSessionWarmupError(payload.error || "Race authorization failed.", response.status);
    return payload;
  }).catch((error) => {
    cached = null;
    throw error;
  });
  cached = { expiresAt: Date.now() + 45_000, promise };
  return promise;
}

export function warmRaceSession() {
  void getWarmRaceSession().catch(() => undefined);
}
