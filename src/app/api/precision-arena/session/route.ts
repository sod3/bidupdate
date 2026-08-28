import { SignJWT } from "jose";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { ArcheryProfile } from "@/models";

function gameSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret);
}

function archeryProfilePayload(profile: Record<string, unknown>) {
  return {
    level: Number(profile.level) || 1, xp: Number(profile.xp) || 0, rank: String(profile.rank || "Rookie"), rankPoints: Number(profile.rankPoints) || 0,
    wins: Number(profile.wins) || 0, losses: Number(profile.losses) || 0, winStreak: Number(profile.winStreak) || 0, bestWinStreak: Number(profile.bestWinStreak) || 0,
    totalScore: Number(profile.totalScore) || 0, bullseyes: Number(profile.bullseyes) || 0, perfectShots: Number(profile.perfectShots) || 0,
    longRangeShots: Number(profile.longRangeShots) || 0, arrowsFired: Number(profile.arrowsFired) || 0, bestDuelScore: Number(profile.bestDuelScore) || 0,
    selectedBowId: String(profile.selectedBowId || "field-recurve"), selectedArrowId: String(profile.selectedArrowId || "cedar"),
    selectedTargetId: String(profile.selectedTargetId || "classic"), selectedCosmeticId: String(profile.selectedCosmeticId || "valley-scout"),
    selectedEnvironmentId: String(profile.selectedEnvironmentId || "mountain-valley"),
    unlockedAchievementIds: Array.isArray(profile.unlockedAchievementIds) ? profile.unlockedAchievementIds : [],
    daily: profile.daily && typeof profile.daily === "object" ? profile.daily : { score: 0, bullseyes: 0, wins: 0 },
  };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const now = Date.now();
    const blockedUntil = [user.responsiblePlay?.coolingOffUntil, user.responsiblePlay?.selfExcludedUntil]
      .filter(Boolean).map((value) => new Date(value as Date).getTime()).filter((value) => value > now).sort((left, right) => right - left)[0];
    if (blockedUntil) throw new ApiError(`Competitive games are paused until ${new Date(blockedUntil).toISOString()}.`, 403, "GAMES_PAUSED");
    const dailyKey = new Date().toISOString().slice(0, 10);
    const profile = await ArcheryProfile.findOneAndUpdate({ userId: user.userId }, { $setOnInsert: { userId: user.userId } }, { upsert: true, new: true });
    if (profile.dailyKey !== dailyKey) {
      profile.dailyKey = dailyKey;
      profile.daily = { score: 0, bullseyes: 0, wins: 0 };
      await profile.save();
    }
    const token = await new SignJWT({ username: user.username, level: profile.level, rank: profile.rank, winStreak: profile.winStreak })
      .setProtectedHeader({ alg: "HS256" }).setIssuer("neon-drift-web").setAudience("neon-drift-race-server").setSubject(user.userId).setIssuedAt().setExpirationTime("20m").sign(gameSecret());
    return noStoreJson({ token, playerId: user.userId, username: user.username, profile: archeryProfilePayload(profile.toObject() as unknown as Record<string, unknown>) });
  } catch (error) {
    return handleRouteError(error);
  }
}
