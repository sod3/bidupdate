import { Types } from "mongoose";
import { ApiError, handleRouteError, noStoreJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PenaltyMatch, PenaltyProfile, User } from "@/models";
import { applyWalletChange } from "@/services/walletService";

const tiers = {
  academy: { entry: 100, pool: 200, name: "Academy Shootout" },
  champions: { entry: 500, pool: 1000, name: "Champions Shootout" },
  "world-class": { entry: 1000, pool: 2000, name: "World Class Shootout" },
} as const;

type TrustedPlayer = { id: string; username: string; isBot?: boolean; stats?: { goals?: number; saves?: number; perfectShots?: number; shots?: number } };

function requireGameServer(request: Request) {
  const expected = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  const received = request.headers.get("x-race-server-secret");
  if (!expected || expected.length < 32 || received !== expected) throw new ApiError("Trusted game server authorization is required.", 401, "GAME_SERVER_REQUIRED");
}

function validPlayers(players: unknown): players is [TrustedPlayer, TrustedPlayer] {
  return Array.isArray(players) && players.length === 2 && players.every((player) => player && typeof player.id === "string" && (player.isBot === true ? player.id.startsWith("penalty-ai-") : Types.ObjectId.isValid(player.id)) && typeof player.username === "string") && players.filter((player) => player.isBot === true).length === 1;
}

function rankFromPoints(points: number) {
  const ranks = ["Bronze III", "Bronze II", "Bronze I", "Silver III", "Silver II", "Silver I", "Gold III", "Gold II", "Gold I", "Platinum", "Diamond", "Master", "Legend"];
  return ranks[Math.min(ranks.length - 1, Math.floor(Math.max(0, points) / 180))];
}

export async function POST(request: Request) {
  try {
    requireGameServer(request);
    const body = await request.json() as Record<string, unknown>;
    const matchId = typeof body.matchId === "string" ? body.matchId : "";
    if (!matchId || matchId.length > 80) throw new ApiError("Match id is invalid.", 400, "INVALID_MATCH");
    const database = await connectDB();

    if (body.phase === "START") {
      const players = body.players;
      const tierId = typeof body.tierId === "string" ? body.tierId as keyof typeof tiers : "";
      const tier = tiers[tierId as keyof typeof tiers];
      if (!validPlayers(players) || !tier || typeof body.environmentSeed !== "number" || typeof body.startAt !== "number") throw new ApiError("Penalty match start payload is invalid.", 400, "INVALID_START");
      if (await PenaltyMatch.exists({ matchId })) return noStoreJson({ accepted: true, duplicate: true });
      const humanPlayers = players.filter((player) => !player.isBot);
      const users = await User.find({ _id: { $in: humanPlayers.map((player) => player.id) }, status: "ACTIVE" }).select("_id").lean();
      if (users.length !== humanPlayers.length) throw new ApiError("The player must have an active account.", 409, "PLAYER_UNAVAILABLE");
      await database.connection.transaction(async (session) => {
        if (await PenaltyMatch.exists({ matchId }).session(session)) return;
        await PenaltyMatch.create([{
          matchId, tierId, stadiumId: "champions-arena", environmentSeed: body.environmentSeed,
          entryCredits: tier.entry, prizePool: tier.pool, playerIds: humanPlayers.map((player) => player.id),
          status: "COUNTDOWN", startedAt: new Date(body.startAt as number), aiFavored: body.aiFavored !== false,
          players: players.map(({ id, username }) => ({ id, username })),
        }], { session });
        for (const player of humanPlayers) {
          await applyWalletChange({
            userId: player.id,
            amount: -tier.entry,
            type: "RACE_ENTRY",
            description: `${tier.name} entry`,
            referenceId: matchId,
            idempotencyKey: `${matchId}:${player.id}:penalty-entry`,
            metadata: { game: "penalty-kings", tierId, stadiumId: "champions-arena", equalEntry: true },
          }, session);
        }
      });
      return noStoreJson({ accepted: true });
    }

    if (body.phase === "RESULT") {
      const players = body.players;
      const winnerId = typeof body.winnerId === "string" ? body.winnerId : "";
      if (!validPlayers(players) || !winnerId || !players.some((player) => player.id === winnerId)) throw new ApiError("Penalty match result payload is invalid.", 400, "INVALID_RESULT");
      const match = await PenaltyMatch.findOne({ matchId }).lean();
      if (!match) throw new ApiError("Penalty match was not registered.", 404, "MATCH_NOT_FOUND");
      if (match.status === "COMPLETED") return noStoreJson({ accepted: true, duplicate: true });
      await database.connection.transaction(async (session) => {
        const locked = await PenaltyMatch.findOne({ matchId, status: { $ne: "COMPLETED" } }).session(session);
        if (!locked) return;
        const humanPlayers = players.filter((player) => !player.isBot);
        const humanWinner = humanPlayers.find((player) => player.id === winnerId);
        locked.status = "COMPLETED";
        locked.winnerId = humanWinner ? new Types.ObjectId(humanWinner.id) : null;
        locked.finishedAt = new Date();
        locked.suddenDeath = Boolean(body.suddenDeath);
        locked.rounds = Math.max(5, Number(body.rounds) || 5);
        locked.scores = typeof body.scores === "object" && body.scores ? body.scores : {};
        locked.histories = typeof body.histories === "object" && body.histories ? body.histories : {};
        locked.players = players;
        await locked.save({ session });
        for (const player of humanPlayers) {
          const won = player.id === winnerId;
          const stats = player.stats ?? {};
          const profile = await PenaltyProfile.findOneAndUpdate({ userId: player.id }, { $setOnInsert: { userId: player.id } }, { upsert: true, new: true, session });
          profile.xp += won ? 420 : 170;
          profile.rankPoints = Math.max(0, profile.rankPoints + (won ? 14 : -8));
          profile.rank = rankFromPoints(profile.rankPoints);
          profile.wins += won ? 1 : 0;
          profile.losses += won ? 0 : 1;
          profile.winStreak = won ? profile.winStreak + 1 : 0;
          profile.bestWinStreak = Math.max(profile.bestWinStreak, profile.winStreak);
          profile.level = Math.max(profile.level, Math.floor(profile.xp / 2400) + 1);
          profile.goals += Math.max(0, Number(stats.goals) || 0);
          profile.saves += Math.max(0, Number(stats.saves) || 0);
          profile.shots += Math.max(0, Number(stats.shots) || 0);
          profile.perfectShots += Math.max(0, Number(stats.perfectShots) || 0);
          await profile.save({ session });
        }
        if (humanWinner) await applyWalletChange({
          userId: humanWinner.id,
          amount: locked.prizePool,
          type: "RACE_REWARD",
          description: `${locked.tierId} Penalty Kings victory reward`,
          referenceId: matchId,
          idempotencyKey: `${matchId}:penalty-reward`,
          metadata: { game: "penalty-kings", tierId: locked.tierId, serverVerified: true, skillResolved: true, opponent: "EXPERT_AI" },
        }, session);
      });
      return noStoreJson({ accepted: true });
    }

    throw new ApiError("Unknown Penalty Kings persistence phase.", 400, "INVALID_PHASE");
  } catch (error) {
    return handleRouteError(error);
  }
}
