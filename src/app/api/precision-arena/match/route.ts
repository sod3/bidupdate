import { Types } from "mongoose";
import { ApiError, handleRouteError, noStoreJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { archeryRankFromPoints } from "@/lib/precision-arena/constants";
import { ArcheryMatch, ArcheryProfile, User } from "@/models";
import { applyWalletChange } from "@/services/walletService";

const tiers = {
  valley: { entry: 100, reward: 200, name: "Valley Open", environment: "mountain-valley" },
  temple: { entry: 500, reward: 1000, name: "Temple Masters", environment: "japanese-temple" },
  legend: { entry: 1000, reward: 2000, name: "Legend Arena", environment: "neon-rooftop" },
} as const;
const bowLevels: Record<string, number> = { "field-recurve": 1, "sakura-yumi": 4, "moon-hunter": 8, "solar-legend": 14 };
const arrowLevels: Record<string, number> = { cedar: 1, sakura: 5, frost: 9, voltage: 13 };
const targetLevels: Record<string, number> = { classic: 1, sakura: 6, neon: 12 };
const cosmeticLevels: Record<string, number> = { "valley-scout": 1, "temple-guard": 6, "neon-ranger": 13 };
const environmentLevels: Record<string, number> = { "mountain-valley": 1, "japanese-temple": 3, "moonlit-forest": 5, "desert-kingdom": 7, "castle-battlefield": 10, "neon-rooftop": 13, "snowy-mountains": 16 };

type TrustedPlayer = { id: string; username: string; isBot?: boolean };
type TrustedStats = { score: number; bullseyes: number; perfectShots: number; longRangeShots: number; arrows: number; bestCombo: number };

function archeryProfilePayload(profile: Record<string, unknown>) {
  return {
    level: Number(profile.level) || 1, xp: Number(profile.xp) || 0, rank: String(profile.rank || "Rookie"), rankPoints: Number(profile.rankPoints) || 0,
    wins: Number(profile.wins) || 0, losses: Number(profile.losses) || 0, winStreak: Number(profile.winStreak) || 0, bestWinStreak: Number(profile.bestWinStreak) || 0,
    totalScore: Number(profile.totalScore) || 0, bullseyes: Number(profile.bullseyes) || 0, perfectShots: Number(profile.perfectShots) || 0,
    longRangeShots: Number(profile.longRangeShots) || 0, arrowsFired: Number(profile.arrowsFired) || 0, bestDuelScore: Number(profile.bestDuelScore) || 0,
    selectedBowId: String(profile.selectedBowId || "field-recurve"), selectedArrowId: String(profile.selectedArrowId || "cedar"), selectedTargetId: String(profile.selectedTargetId || "classic"),
    selectedCosmeticId: String(profile.selectedCosmeticId || "valley-scout"), selectedEnvironmentId: String(profile.selectedEnvironmentId || "mountain-valley"),
    unlockedAchievementIds: Array.isArray(profile.unlockedAchievementIds) ? profile.unlockedAchievementIds : [],
    daily: profile.daily && typeof profile.daily === "object" ? profile.daily : { score: 0, bullseyes: 0, wins: 0 },
  };
}

function requireGameServer(request: Request) {
  const expected = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  if (!expected || expected.length < 32 || request.headers.get("x-race-server-secret") !== expected) throw new ApiError("Trusted game server authorization is required.", 401, "GAME_SERVER_REQUIRED");
}

function validPlayers(players: unknown): players is [TrustedPlayer, TrustedPlayer] {
  return Array.isArray(players) && players.length === 2 && players.every((player) => player && typeof player.id === "string" && (player.isBot === true ? player.id.startsWith("archery-ai-") : Types.ObjectId.isValid(player.id)) && typeof player.username === "string") && players.filter((player) => player.isBot === true).length === 1;
}

function sanitizedStats(input: unknown): TrustedStats {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const number = (key: string, maximum: number) => Math.floor(Math.max(0, Math.min(maximum, Number(source[key]) || 0)));
  return { score: number("score", 1500), bullseyes: number("bullseyes", 5), perfectShots: number("perfectShots", 5), longRangeShots: number("longRangeShots", 5), arrows: number("arrows", 5), bestCombo: number("bestCombo", 5) };
}

export async function POST(request: Request) {
  try {
    requireGameServer(request);
    const body = await request.json() as Record<string, unknown>;
    const matchId = typeof body.matchId === "string" ? body.matchId : "";
    if (!matchId || matchId.length > 80) throw new ApiError("Precision Arena match id is invalid.", 400, "INVALID_MATCH");
    const database = await connectDB();

    if (body.phase === "START") {
      const players = body.players;
      const tierId = typeof body.tierId === "string" ? body.tierId as keyof typeof tiers : "";
      const tier = tiers[tierId as keyof typeof tiers];
      const bowId = typeof body.bowId === "string" ? body.bowId : "field-recurve";
      const arrowId = typeof body.arrowId === "string" ? body.arrowId : "cedar";
      const targetId = typeof body.targetId === "string" ? body.targetId : "classic";
      const cosmeticId = typeof body.cosmeticId === "string" ? body.cosmeticId : "valley-scout";
      const environmentId = typeof body.environmentId === "string" ? body.environmentId : "mountain-valley";
      if (!validPlayers(players) || !tier || typeof body.environmentSeed !== "number" || typeof body.startAt !== "number" || !(bowId in bowLevels) || !(arrowId in arrowLevels) || !(targetId in targetLevels) || !(cosmeticId in cosmeticLevels) || !(environmentId in environmentLevels)) throw new ApiError("Precision Arena start payload is invalid.", 400, "INVALID_START");
      if (await ArcheryMatch.exists({ matchId })) return noStoreJson({ accepted: true, duplicate: true });
      const human = players.find((player) => !player.isBot)!;
      const user = await User.findOne({ _id: human.id, status: "ACTIVE" }).select("_id").lean();
      if (!user) throw new ApiError("The player must have an active account.", 409, "PLAYER_UNAVAILABLE");
      const profile = await ArcheryProfile.findOneAndUpdate({ userId: human.id }, { $setOnInsert: { userId: human.id } }, { upsert: true, new: true });
      const arenaLocked = profile.level < environmentLevels[environmentId] && environmentId !== tier.environment;
      if (profile.level < bowLevels[bowId] || profile.level < arrowLevels[arrowId] || profile.level < targetLevels[targetId] || profile.level < cosmeticLevels[cosmeticId] || arenaLocked) throw new ApiError("One of the selected archery cosmetics is still locked.", 409, "COSMETIC_LOCKED");
      await database.connection.transaction(async (dbSession) => {
        if (await ArcheryMatch.exists({ matchId }).session(dbSession)) return;
        await ArcheryMatch.create([{ matchId, tierId, environmentId, environmentSeed: body.environmentSeed, entryCredits: tier.entry, possibleReward: tier.reward, playerIds: [human.id], status: "COUNTDOWN", startedAt: new Date(body.startAt as number), aiFavored: Boolean(body.aiFavored), bowId, arrowId, targetId, cosmeticId, players }], { session: dbSession });
        await ArcheryProfile.updateOne({ userId: human.id }, { $set: { selectedBowId: bowId, selectedArrowId: arrowId, selectedTargetId: targetId, selectedCosmeticId: cosmeticId, selectedEnvironmentId: environmentId } }, { session: dbSession });
        await applyWalletChange({ userId: human.id, amount: -tier.entry, type: "RACE_ENTRY", description: `${tier.name} Precision Arena entry`, referenceId: matchId, idempotencyKey: `${matchId}:${human.id}:archery-entry`, metadata: { game: "precision-arena", tierId, environmentId, opponent: "ARCHERY_AI" } }, dbSession);
      });
      return noStoreJson({ accepted: true });
    }

    if (body.phase === "RESULT") {
      const players = body.players;
      const winnerId = typeof body.winnerId === "string" ? body.winnerId : "";
      if (!validPlayers(players) || !winnerId || !players.some((player) => player.id === winnerId)) throw new ApiError("Precision Arena result payload is invalid.", 400, "INVALID_RESULT");
      const match = await ArcheryMatch.findOne({ matchId }).lean();
      if (!match) throw new ApiError("Precision Arena match was not registered.", 404, "MATCH_NOT_FOUND");
      const human = players.find((player) => !player.isBot)!;
      if (match.status === "COMPLETED") {
        const existingProfile = await ArcheryProfile.findOne({ userId: human.id }).lean();
        return noStoreJson({ accepted: true, duplicate: true, profile: archeryProfilePayload(existingProfile as unknown as Record<string, unknown>) });
      }
      const playerWon = winnerId === human.id;
      const stats = sanitizedStats(body.stats);
      const scores = body.scores && typeof body.scores === "object" ? body.scores : {};
      const durationMs = Math.max(8_000, Math.min(600_000, Number(body.durationMs) || 0));
      await database.connection.transaction(async (dbSession) => {
        const locked = await ArcheryMatch.findOne({ matchId, status: { $ne: "COMPLETED" } }).session(dbSession);
        if (!locked) return;
        locked.status = "COMPLETED"; locked.winnerId = playerWon ? new Types.ObjectId(human.id) : null; locked.winnerType = playerWon ? "PLAYER" : "AI"; locked.finishedAt = new Date(); locked.durationMs = durationMs; locked.stats = stats; locked.scores = scores; await locked.save({ session: dbSession });
        const profile = await ArcheryProfile.findOneAndUpdate({ userId: human.id }, { $setOnInsert: { userId: human.id } }, { upsert: true, new: true, session: dbSession });
        const dailyKey = new Date().toISOString().slice(0, 10);
        if (profile.dailyKey !== dailyKey) { profile.dailyKey = dailyKey; profile.daily = { score: 0, bullseyes: 0, wins: 0 }; }
        profile.xp += playerWon ? 600 : 240;
        profile.rankPoints = Math.max(0, profile.rankPoints + (playerWon ? 20 : -9));
        profile.rank = archeryRankFromPoints(profile.rankPoints);
        profile.wins += playerWon ? 1 : 0; profile.losses += playerWon ? 0 : 1; profile.winStreak = playerWon ? profile.winStreak + 1 : 0; profile.bestWinStreak = Math.max(profile.bestWinStreak, profile.winStreak);
        profile.level = Math.max(profile.level, Math.floor(profile.xp / 1800) + 1); profile.totalScore += stats.score; profile.bullseyes += stats.bullseyes; profile.perfectShots += stats.perfectShots; profile.longRangeShots += stats.longRangeShots; profile.arrowsFired += stats.arrows; profile.bestDuelScore = Math.max(profile.bestDuelScore, stats.score);
        profile.daily.score += stats.score; profile.daily.bullseyes += stats.bullseyes; profile.daily.wins += playerWon ? 1 : 0;
        const unlocked = new Set(profile.unlockedAchievementIds ?? []);
        if (profile.bullseyes >= 1) unlocked.add("first-bullseye"); if (stats.longRangeShots >= 1) unlocked.add("long-ranger"); if (stats.score >= 450) unlocked.add("perfect-duel"); if (stats.bestCombo >= 3) unlocked.add("combo-master"); if (profile.bestWinStreak >= 5) unlocked.add("hot-hand"); if (profile.rank === "Legend") unlocked.add("legend");
        profile.unlockedAchievementIds = [...unlocked]; await profile.save({ session: dbSession });
        if (playerWon) await applyWalletChange({ userId: human.id, amount: locked.possibleReward, type: "RACE_REWARD", description: `${locked.tierId} Precision Arena victory reward`, referenceId: matchId, idempotencyKey: `${matchId}:archery-reward`, metadata: { game: "precision-arena", tierId: locked.tierId, serverVerified: true, opponent: "ARCHERY_AI" } }, dbSession);
      });
      const updated = await ArcheryProfile.findOne({ userId: human.id }).lean();
      return noStoreJson({ accepted: true, profile: archeryProfilePayload(updated as unknown as Record<string, unknown>) });
    }
    throw new ApiError("Unknown Precision Arena persistence phase.", 400, "INVALID_PHASE");
  } catch (error) {
    return handleRouteError(error);
  }
}
