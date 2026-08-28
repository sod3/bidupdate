import { SignJWT } from "jose";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { TowerProfile } from "@/models";

function gameSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret);
}

function profilePayload(profile: Record<string, unknown>) {
  return {
    level: Number(profile.level) || 1,
    xp: Number(profile.xp) || 0,
    rank: String(profile.rank || "Rookie"),
    rankPoints: Number(profile.rankPoints) || 0,
    wins: Number(profile.wins) || 0,
    losses: Number(profile.losses) || 0,
    winStreak: Number(profile.winStreak) || 0,
    bestWinStreak: Number(profile.bestWinStreak) || 0,
    castlesDestroyed: Number(profile.castlesDestroyed) || 0,
    damageDealt: Number(profile.damageDealt) || 0,
    criticalHits: Number(profile.criticalHits) || 0,
    partsDestroyed: Number(profile.partsDestroyed) || 0,
    projectilesFired: Number(profile.projectilesFired) || 0,
    abilitiesUsed: Number(profile.abilitiesUsed) || 0,
    bestVictoryMs: typeof profile.bestVictoryMs === "number" ? profile.bestVictoryMs : null,
    highestDamageShot: Number(profile.highestDamageShot) || 0,
    selectedCannonId: String(profile.selectedCannonId || "oak-breaker"),
    selectedProjectileSkinId: String(profile.selectedProjectileSkinId || "forged"),
    selectedCastleId: String(profile.selectedCastleId || "highland-keep"),
    selectedArenaId: String(profile.selectedArenaId || "moonfall"),
    daily: profile.daily && typeof profile.daily === "object" ? profile.daily : { damage: 0, criticals: 0, wins: 0 },
  };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const now = Date.now();
    const blockedUntil = [user.responsiblePlay?.coolingOffUntil, user.responsiblePlay?.selfExcludedUntil]
      .filter(Boolean)
      .map((value) => new Date(value as Date).getTime())
      .filter((value) => value > now)
      .sort((left, right) => right - left)[0];
    if (blockedUntil) throw new ApiError(`Competitive games are paused until ${new Date(blockedUntil).toISOString()}.`, 403, "GAMES_PAUSED");
    const dailyKey = new Date().toISOString().slice(0, 10);
    const profile = await TowerProfile.findOneAndUpdate({ userId: user.userId }, { $setOnInsert: { userId: user.userId } }, { upsert: true, new: true });
    if (profile.dailyKey !== dailyKey) {
      profile.dailyKey = dailyKey;
      profile.daily = { damage: 0, criticals: 0, wins: 0 };
      await profile.save();
    }
    const token = await new SignJWT({ username: user.username, level: profile.level, rank: profile.rank, winStreak: profile.winStreak })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("neon-drift-web")
      .setAudience("neon-drift-race-server")
      .setSubject(user.userId)
      .setIssuedAt()
      .setExpirationTime("20m")
      .sign(gameSecret());
    return noStoreJson({ token, playerId: user.userId, username: user.username, profile: profilePayload(profile.toObject() as unknown as Record<string, unknown>) });
  } catch (error) {
    return handleRouteError(error);
  }
}
