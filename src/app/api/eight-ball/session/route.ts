import { SignJWT } from "jose";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { PoolProfile } from "@/models";

function gameSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret);
}

function profilePayload(profile: Record<string, unknown>) {
  return {
    level: Number(profile.level) || 1,
    xp: Number(profile.xp) || 0,
    rank: String(profile.rank || "Bronze III"),
    rankPoints: Number(profile.rankPoints) || 0,
    wins: Number(profile.wins) || 0,
    losses: Number(profile.losses) || 0,
    winStreak: Number(profile.winStreak) || 0,
    bestWinStreak: Number(profile.bestWinStreak) || 0,
    ballsPotted: Number(profile.ballsPotted) || 0,
    bankShots: Number(profile.bankShots) || 0,
    breakAndRuns: Number(profile.breakAndRuns) || 0,
    fouls: Number(profile.fouls) || 0,
    bestClearanceMs: typeof profile.bestClearanceMs === "number" ? profile.bestClearanceMs : null,
    selectedCueId: String(profile.selectedCueId || "house"),
    selectedTableId: String(profile.selectedTableId || "emerald"),
    selectedBallSkinId: String(profile.selectedBallSkinId || "tournament"),
    daily: profile.daily && typeof profile.daily === "object" ? profile.daily : { pots: 0, banks: 0, wins: 0 },
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
    const profile = await PoolProfile.findOneAndUpdate(
      { userId: user.userId },
      {
        $setOnInsert: { userId: user.userId },
      },
      { upsert: true, new: true },
    );
    if (profile.dailyKey !== dailyKey) {
      profile.dailyKey = dailyKey;
      profile.daily = { pots: 0, banks: 0, wins: 0 };
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
    const plain = profile.toObject() as unknown as Record<string, unknown>;
    const socketUrl = process.env.POOL_SOCKET_URL || new URL(request.url).origin;
    const socketPath = process.env.POOL_SOCKET_PATH || (process.env.VERCEL ? "/api/race-socket/socket.io" : "/race-socket");
    return noStoreJson({ token, socketUrl, socketPath, playerId: user.userId, username: user.username, profile: profilePayload(plain) });
  } catch (error) {
    return handleRouteError(error);
  }
}
