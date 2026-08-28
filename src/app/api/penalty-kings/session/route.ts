import { SignJWT } from "jose";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { PenaltyProfile } from "@/models";

function gameSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret);
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
      .sort((a, b) => b - a)[0];
    if (blockedUntil) throw new ApiError(`Competitive games are paused until ${new Date(blockedUntil).toISOString()}.`, 403, "GAMES_PAUSED");
    const profile = await PenaltyProfile.findOneAndUpdate(
      { userId: user.userId },
      { $setOnInsert: { userId: user.userId } },
      { upsert: true, new: true },
    ).lean();
    const token = await new SignJWT({ username: user.username, level: profile.level, rank: profile.rank, winStreak: profile.winStreak })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("neon-drift-web")
      .setAudience("neon-drift-race-server")
      .setSubject(user.userId)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(gameSecret());
    return noStoreJson({
      token,
      playerId: user.userId,
      username: user.username,
      level: profile.level,
      rank: profile.rank,
      winStreak: profile.winStreak,
      profile: {
        xp: profile.xp,
        goals: profile.goals,
        saves: profile.saves,
        wins: profile.wins,
        losses: profile.losses,
        perfectShots: profile.perfectShots,
        bestWinStreak: profile.bestWinStreak,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
