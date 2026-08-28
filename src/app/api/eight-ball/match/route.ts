import { Types } from "mongoose";
import { ApiError, handleRouteError, noStoreJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PoolMatch, PoolProfile, User } from "@/models";
import { applyWalletChange } from "@/services/walletService";
import { poolRankFromPoints } from "@/lib/eight-ball/constants";

const tiers = {
  club: { entry: 100, reward: 200, name: "Club Table" },
  pro: { entry: 500, reward: 1000, name: "Pro Circuit" },
  "high-roller": { entry: 1000, reward: 2000, name: "High Roller" },
} as const;
const cueLevels: Record<string, number> = { house: 1, "neon-viper": 4, "royal-flush": 9, "black-diamond": 15 };
const tableLevels: Record<string, number> = { emerald: 1, "electric-blue": 6, "royal-purple": 12 };
const ballSkinLevels: Record<string, number> = { tournament: 1, neon: 8, obsidian: 16 };

type TrustedPlayer = { id: string; username: string; isBot?: boolean };
type TrustedStats = { shots: number; ballsPotted: number; bankShots: number; trickShots: number; fouls: number; maxRun: number };

function requireGameServer(request: Request) {
  const expected = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  const received = request.headers.get("x-race-server-secret");
  if (!expected || expected.length < 32 || received !== expected) throw new ApiError("Trusted game server authorization is required.", 401, "GAME_SERVER_REQUIRED");
}

function validPlayers(players: unknown): players is [TrustedPlayer, TrustedPlayer] {
  return Array.isArray(players) && players.length === 2 && players.every((player) => player && typeof player.id === "string" && (player.isBot === true ? player.id.startsWith("pool-ai-") : Types.ObjectId.isValid(player.id)) && typeof player.username === "string") && players.filter((player) => player.isBot === true).length === 1;
}

function sanitizedStats(input: unknown): TrustedStats {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const number = (key: string, maximum: number) => Math.floor(Math.max(0, Math.min(maximum, Number(source[key]) || 0)));
  return { shots: number("shots", 100), ballsPotted: number("ballsPotted", 15), bankShots: number("bankShots", 15), trickShots: number("trickShots", 15), fouls: number("fouls", 50), maxRun: number("maxRun", 15) };
}

function profilePayload(profile: Record<string, unknown>) {
  return {
    level: Number(profile.level) || 1, xp: Number(profile.xp) || 0, rank: String(profile.rank || "Bronze III"), rankPoints: Number(profile.rankPoints) || 0,
    wins: Number(profile.wins) || 0, losses: Number(profile.losses) || 0, winStreak: Number(profile.winStreak) || 0, bestWinStreak: Number(profile.bestWinStreak) || 0,
    ballsPotted: Number(profile.ballsPotted) || 0, bankShots: Number(profile.bankShots) || 0, breakAndRuns: Number(profile.breakAndRuns) || 0, fouls: Number(profile.fouls) || 0,
    bestClearanceMs: typeof profile.bestClearanceMs === "number" ? profile.bestClearanceMs : null,
    selectedCueId: String(profile.selectedCueId || "house"), selectedTableId: String(profile.selectedTableId || "emerald"), selectedBallSkinId: String(profile.selectedBallSkinId || "tournament"),
    daily: profile.daily && typeof profile.daily === "object" ? profile.daily : { pots: 0, banks: 0, wins: 0 },
  };
}

export async function POST(request: Request) {
  try {
    requireGameServer(request);
    const body = await request.json() as Record<string, unknown>;
    const matchId = typeof body.matchId === "string" ? body.matchId : "";
    if (!matchId || matchId.length > 80) throw new ApiError("Pool match id is invalid.", 400, "INVALID_MATCH");
    const database = await connectDB();

    if (body.phase === "START") {
      const players = body.players;
      const tierId = typeof body.tierId === "string" ? body.tierId as keyof typeof tiers : "";
      const tier = tiers[tierId as keyof typeof tiers];
      const cueId = typeof body.cueId === "string" ? body.cueId : "house";
      const tableId = typeof body.tableId === "string" ? body.tableId : "emerald";
      const ballSkinId = typeof body.ballSkinId === "string" ? body.ballSkinId : "tournament";
      if (!validPlayers(players) || !tier || typeof body.environmentSeed !== "number" || typeof body.startAt !== "number" || !(cueId in cueLevels) || !(tableId in tableLevels) || !(ballSkinId in ballSkinLevels)) throw new ApiError("Pool match start payload is invalid.", 400, "INVALID_START");
      if (await PoolMatch.exists({ matchId })) return noStoreJson({ accepted: true, duplicate: true });
      const human = players.find((player) => !player.isBot)!;
      const user = await User.findOne({ _id: human.id, status: "ACTIVE" }).select("_id").lean();
      if (!user) throw new ApiError("The player must have an active account.", 409, "PLAYER_UNAVAILABLE");
      const profile = await PoolProfile.findOneAndUpdate({ userId: human.id }, { $setOnInsert: { userId: human.id } }, { upsert: true, new: true });
      if (profile.level < cueLevels[cueId] || profile.level < tableLevels[tableId] || profile.level < ballSkinLevels[ballSkinId]) throw new ApiError("One of the selected pool cosmetics is still locked.", 409, "COSMETIC_LOCKED");
      await database.connection.transaction(async (dbSession) => {
        if (await PoolMatch.exists({ matchId }).session(dbSession)) return;
        await PoolMatch.create([{
          matchId, tierId, roomId: tierId === "high-roller" ? "diamond-room" : tierId === "pro" ? "velvet-crown" : "midnight-lounge",
          environmentSeed: body.environmentSeed, entryCredits: tier.entry, possibleReward: tier.reward, playerIds: [human.id],
          status: "COUNTDOWN", startedAt: new Date(body.startAt as number), aiFavored: Boolean(body.aiFavored), cueId, tableDesignId: tableId, ballSkinId, players,
        }], { session: dbSession });
        await PoolProfile.updateOne({ userId: human.id }, { $set: { selectedCueId: cueId, selectedTableId: tableId, selectedBallSkinId: ballSkinId } }, { session: dbSession });
        await applyWalletChange({
          userId: human.id, amount: -tier.entry, type: "RACE_ENTRY", description: `${tier.name} 8 Ball entry`, referenceId: matchId,
          idempotencyKey: `${matchId}:${human.id}:pool-entry`, metadata: { game: "eight-ball", tierId, roomId: "cash-arena", opponent: "EXPERT_AI" },
        }, dbSession);
      });
      return noStoreJson({ accepted: true });
    }

    if (body.phase === "RESULT") {
      const players = body.players;
      const winnerId = typeof body.winnerId === "string" ? body.winnerId : "";
      if (!validPlayers(players) || !winnerId || !players.some((player) => player.id === winnerId)) throw new ApiError("Pool result payload is invalid.", 400, "INVALID_RESULT");
      const match = await PoolMatch.findOne({ matchId }).lean();
      if (!match) throw new ApiError("Pool match was not registered.", 404, "MATCH_NOT_FOUND");
      if (match.status === "COMPLETED") {
        const human = players.find((player) => !player.isBot)!;
        const existingProfile = await PoolProfile.findOne({ userId: human.id }).lean();
        return noStoreJson({ accepted: true, duplicate: true, profile: profilePayload(existingProfile as unknown as Record<string, unknown>) });
      }
      const human = players.find((player) => !player.isBot)!;
      const playerWon = winnerId === human.id;
      const stats = sanitizedStats(body.stats);
      const durationMs = Math.max(20_000, Math.min(3_600_000, Number(body.durationMs) || 0));
      await database.connection.transaction(async (dbSession) => {
        const locked = await PoolMatch.findOne({ matchId, status: { $ne: "COMPLETED" } }).session(dbSession);
        if (!locked) return;
        locked.status = "COMPLETED";
        locked.winnerId = playerWon ? new Types.ObjectId(human.id) : null;
        locked.winnerType = playerWon ? "PLAYER" : "AI";
        locked.finishedAt = new Date();
        locked.durationMs = durationMs;
        locked.stats = stats;
        await locked.save({ session: dbSession });
        const profile = await PoolProfile.findOneAndUpdate({ userId: human.id }, { $setOnInsert: { userId: human.id } }, { upsert: true, new: true, session: dbSession });
        const dailyKey = new Date().toISOString().slice(0, 10);
        if (profile.dailyKey !== dailyKey) {
          profile.dailyKey = dailyKey;
          profile.daily = { pots: 0, banks: 0, wins: 0 };
        }
        profile.xp += playerWon ? 600 : 230;
        profile.rankPoints = Math.max(0, profile.rankPoints + (playerWon ? 18 : -9));
        profile.rank = poolRankFromPoints(profile.rankPoints);
        profile.wins += playerWon ? 1 : 0;
        profile.losses += playerWon ? 0 : 1;
        profile.winStreak = playerWon ? profile.winStreak + 1 : 0;
        profile.bestWinStreak = Math.max(profile.bestWinStreak, profile.winStreak);
        profile.level = Math.max(profile.level, Math.floor(profile.xp / 1800) + 1);
        profile.ballsPotted += stats.ballsPotted;
        profile.bankShots += stats.bankShots;
        profile.trickShots += stats.trickShots;
        profile.fouls += stats.fouls;
        profile.breakAndRuns += playerWon && stats.maxRun >= 7 && stats.fouls === 0 ? 1 : 0;
        if (playerWon && (!profile.bestClearanceMs || durationMs < profile.bestClearanceMs)) profile.bestClearanceMs = durationMs;
        profile.daily.pots += stats.ballsPotted;
        profile.daily.banks += stats.bankShots;
        profile.daily.wins += playerWon ? 1 : 0;
        const unlocked = new Set(profile.unlockedAchievementIds ?? []);
        if (profile.wins >= 1) unlocked.add("first-rack");
        if (profile.bankShots >= 25) unlocked.add("bank-manager");
        if (playerWon && stats.fouls === 0) unlocked.add("eight-clean");
        if (profile.bestWinStreak >= 5) unlocked.add("hot-hand");
        if (profile.ballsPotted >= 100) unlocked.add("century");
        if (profile.rank === "Legend") unlocked.add("legend");
        profile.unlockedAchievementIds = [...unlocked];
        await profile.save({ session: dbSession });
        if (playerWon) await applyWalletChange({
          userId: human.id, amount: locked.possibleReward, type: "RACE_REWARD", description: `${locked.tierId} 8 Ball victory reward`, referenceId: matchId,
          idempotencyKey: `${matchId}:pool-reward`, metadata: { game: "eight-ball", tierId: locked.tierId, serverVerified: true, opponent: "EXPERT_AI" },
        }, dbSession);
      });
      const updated = await PoolProfile.findOne({ userId: human.id }).lean();
      return noStoreJson({ accepted: true, profile: profilePayload(updated as unknown as Record<string, unknown>) });
    }

    throw new ApiError("Unknown 8 Ball persistence phase.", 400, "INVALID_PHASE");
  } catch (error) {
    return handleRouteError(error);
  }
}

