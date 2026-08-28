export async function gameplayRequest<T>(game: "racing" | "precision-arena" | "tower-clash" | "eight-ball" | "penalty-kings", body: Record<string, unknown>) {
  const requestBody = { ...body };
  const opponentStorageKey = `neon-drift:${game}:last-fictional-opponent`;
  if (body.action === "START" && typeof window !== "undefined") {
    try {
      const explicitExclusion = typeof body.excludeOpponentName === "string" ? body.excludeOpponentName.trim() : "";
      requestBody.excludeOpponentName = explicitExclusion || window.sessionStorage.getItem(opponentStorageKey) || undefined;
    } catch {
      // Storage can be unavailable in locked-down browser modes; server-side randomization still applies.
    }
  }
  const response = await fetch(`/api/gameplay/${game}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(requestBody),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The game server could not complete the request.");
  if (body.action === "START" && typeof window !== "undefined") {
    const match = (payload as { match?: { opponent?: { username?: unknown } } }).match;
    if (typeof match?.opponent?.username === "string") {
      try { window.sessionStorage.setItem(opponentStorageKey, match.opponent.username); } catch { /* optional convenience only */ }
    }
  }
  return payload;
}
