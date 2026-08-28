import { Types } from "mongoose";
import { ApiError, handleRouteError, noStoreJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { towerRankFromPoints } from "@/lib/tower-clash/constants";
import { TowerMatch, TowerProfile, User } from "@/models";
import { applyWalletChange } from "@/services/walletService";

const tiers = {
  frontier: { entry: 100, reward: 200, name: "Frontier Siege", arena: "moonfall" },
  warfront: { entry: 500, reward: 1000, name: "Iron Warfront", arena: "ember-field" },
  royal: { entry: 1000, reward: 2000, name: "Royal Cataclysm", arena: "red-dunes" },
} as const;
const cannonLevels: Record<string, number> = { "oak-breaker": 1, "iron-wolf": 4, "dragon-mouth": 9, "kings-thunder": 16 };
const castleLevels: Record<string, number> = { "highland-keep": 1, "crimson-fort": 7, "sun-king-citadel": 13 };
const arenaLevels: Record<string, number> = { moonfall: 1, "ember-field": 5, "red-dunes": 9, "frost-crown": 14 };
const skinLevels: Record<string, number> = { forged: 1, arcane: 8, solar: 15 };

type TrustedPlayer = { id: string; username: string; isBot?: boolean };
type TrustedStats = { shots: number; hits: number; damageDealt: number; criticalHits: number; partsDestroyed: number; abilitiesUsed: number; maxDamage: number };

function requireGameServer(request: Request) {
  const expected = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  const received = request.headers.get("x-race-server-secret");
  if (!expected || expected.length < 32 || received !== expected) throw new ApiError("Trusted game server authorization is required.", 401, "GAME_SERVER_REQUIRED");
}

function validPlayers(players: unknown): players is [TrustedPlayer, TrustedPlayer] {
  return Array.isArray(players) && players.length === 2 && players.every((player) => player && typeof player.id === "string" && (player.isBot === true ? player.id.startsWith("tower-ai-") : Types.ObjectId.isValid(player.id)) && typeof player.username === "string") && players.filter((player) => player.isBot === true).length === 1;
}

function sanitizedStats(input: unknown): TrustedStats {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const number = (key: string, maximum: number) => Math.floor(Math.max(0, Math.min(maximum, Number(source[key]) || 0)));
  return {
    shots: number("shots", 100),
    hits: number("hits", 100),
    damageDealt: number("damageDealt", 5000),
    criticalHits: number("criticalHits", 100),
    partsDestroyed: number("partsDestroyed", 200),
    abilitiesUsed: number("abilitiesUsed", 50),
    maxDamage: number("maxDamage", 250),
  };
}

function profilePayload(profile: Record<string, unknown>) {
  return {
    level: Number(profile.level) || 1, xp: Number(profile.xp) || 0, rank: String(profile.rank || "Rookie"), rankPoints: Number(profile.rankPoints) || 0,
    wins: Number(profile.wins) || 0, losses: Number(profile.losses) || 0, winStreak: Number(profile.winStreak) || 0, bestWinStreak: Number(profile.bestWinStreak) || 0,
    castlesDestroyed: Number(profile.castlesDestroyed) || 0, damageDealt: Number(profile.damageDealt) || 0, criticalHits: Number(profile.criticalHits) || 0,
    partsDestroyed: Number(profile.partsDestroyed) || 0, projectilesFired: Number(profile.projectilesFired) || 0, abilitiesUsed: Number(profile.abilitiesUsed) || 0,
    bestVictoryMs: typeof profile.bestVictoryMs === "number" ? profile.bestVictoryMs : null, highestDamageShot: Number(profile.highestDamageShot) || 0,
    selectedCannonId: String(profile.selectedCannonId || "oak-breaker"), selectedProjectileSkinId: String(profile.selectedProjectileSkinId || "forged"),
    selectedCastleId: String(profile.selectedCastleId || "highland-keep"), selectedArenaId: String(profile.selectedArenaId || "moonfall"),
    daily: profile.daily && typeof profile.daily === "object" ? profile.daily : { damage: 0, criticals: 0, wins: 0 },
  };
}

export async function POST(request: Request) {
  try {
    requireGameServer(request);
    const body = await request.json() as Record<string, unknown>;
    const matchId = typeof body.matchId === "string" ? body.matchId : "";
    if (!matchId || matchId.length > 80) throw new ApiError("Tower Clash match id is invalid.", 400, "INVALID_MATCH");
    const database = await connectDB();

    if (body.phase === "START") {
      const players = body.players;
      const tierId = typeof body.tierId === "string" ? body.tierId as keyof typeof tiers : "";
      const tier = tiers[tierId as keyof typeof tiers];
      const cannonId = typeof body.cannonId === "string" ? body.cannonId : "oak-breaker";
      const castleId = typeof body.castleId === "string" ? body.castleId : "highland-keep";
      const arenaId = typeof body.arenaId === "string" ? body.arenaId : "moonfall";
      const projectileSkinId = typeof body.projectileSkinId === "string" ? body.projectileSkinId : "forged";
      if (!validPlayers(players) || !tier || typeof body.environmentSeed !== "number" || typeof body.startAt !== "number" || !(cannonId in cannonLevels) || !(castleId in castleLevels) || !(arenaId in arenaLevels) || !(projectileSkinId in skinLevels)) throw new ApiError("Tower Clash start payload is invalid.", 400, "INVALID_START");
      if (await TowerMatch.exists({ matchId })) return noStoreJson({ accepted: true, duplicate: true });
      const human = players.find((player) => !player.isBot)!;
      const user = await User.findOne({ _id: human.id, status: "ACTIVE" }).select("_id").lean();
      if (!user) throw new ApiError("The player must have an active account.", 409, "PLAYER_UNAVAILABLE");
      const profile = await TowerProfile.findOneAndUpdate({ userId: human.id }, { $setOnInsert: { userId: human.id } }, { upsert: true, new: true });
      const arenaLocked = profile.level < arenaLevels[arenaId] && arenaId !== tier.arena;
      if (profile.level < cannonLevels[cannonId] || profile.level < castleLevels[castleId] || arenaLocked || profile.level < skinLevels[projectileSkinId]) throw new ApiError("One of the selected siege cosmetics is still locked.", 409, "COSMETIC_LOCKED");
      await database.connection.transaction(async (dbSession) => {
        if (await TowerMatch.exists({ matchId }).session(dbSession)) return;
        await TowerMatch.create([{
          matchId, tierId, arenaId, environmentSeed: body.environmentSeed, entryCredits: tier.entry, possibleReward: tier.reward,
          playerIds: [human.id], status: "COUNTDOWN", startedAt: new Date(body.startAt as number), aiFavored: Boolean(body.aiFavored),
          cannonId, castleId, projectileSkinId, players,
        }], { session: dbSession });
        await TowerProfile.updateOne({ userId: human.id }, { $set: { selectedCannonId: cannonId, selectedCastleId: castleId, selectedArenaId: arenaId, selectedProjectileSkinId: projectileSkinId } }, { session: dbSession });
        await applyWalletChange({
          userId: human.id, amount: -tier.entry, type: "RACE_ENTRY", description: `${tier.name} Tower Clash entry`, referenceId: matchId,
          idempotencyKey: `${matchId}:${human.id}:tower-entry`, metadata: { game: "tower-clash", tierId, arenaId, opponent: "BOSS_AI" },
        }, dbSession);
      });
      return noStoreJson({ accepted: true });
    }

    if (body.phase === "RESULT") {
      const players = body.players;
      const winnerId = typeof body.winnerId === "string" ? body.winnerId : "";
      if (!validPlayers(players) || !winnerId || !players.some((player) => player.id === winnerId)) throw new ApiError("Tower Clash result payload is invalid.", 400, "INVALID_RESULT");
      const match = await TowerMatch.findOne({ matchId }).lean();
      if (!match) throw new ApiError("Tower Clash match was not registered.", 404, "MATCH_NOT_FOUND");
      const human = players.find((player) => !player.isBot)!;
      if (match.status === "COMPLETED") {
        const existingProfile = await TowerProfile.findOne({ userId: human.id }).lean();
        return noStoreJson({ accepted: true, duplicate: true, profile: profilePayload(existingProfile as unknown as Record<string, unknown>) });
      }
      const playerWon = winnerId === human.id;
      const stats = sanitizedStats(body.stats);
      const durationMs = Math.max(10_000, Math.min(3_600_000, Number(body.durationMs) || 0));
      await database.connection.transaction(async (dbSession) => {
        const locked = await TowerMatch.findOne({ matchId, status: { $ne: "COMPLETED" } }).session(dbSession);
        if (!locked) return;
        locked.status = "COMPLETED";
        locked.winnerId = playerWon ? new Types.ObjectId(human.id) : null;
        locked.winnerType = playerWon ? "PLAYER" : "AI";
        locked.finishedAt = new Date();
        locked.durationMs = durationMs;
        locked.stats = stats;
        await locked.save({ session: dbSession });
        const profile = await TowerProfile.findOneAndUpdate({ userId: human.id }, { $setOnInsert: { userId: human.id } }, { upsert: true, new: true, session: dbSession });
        const dailyKey = new Date().toISOString().slice(0, 10);
        if (profile.dailyKey !== dailyKey) {
          profile.dailyKey = dailyKey;
          profile.daily = { damage: 0, criticals: 0, wins: 0 };
        }
        profile.xp += playerWon ? 650 : 250;
        profile.rankPoints = Math.max(0, profile.rankPoints + (playerWon ? 22 : -10));
        profile.rank = towerRankFromPoints(profile.rankPoints);
        profile.wins += playerWon ? 1 : 0;
        profile.losses += playerWon ? 0 : 1;
        profile.winStreak = playerWon ? profile.winStreak + 1 : 0;
        profile.bestWinStreak = Math.max(profile.bestWinStreak, profile.winStreak);
        profile.level = Math.max(profile.level, Math.floor(profile.xp / 2000) + 1);
        profile.castlesDestroyed += playerWon ? 1 : 0;
        profile.damageDealt += stats.damageDealt;
        profile.criticalHits += stats.criticalHits;
        profile.partsDestroyed += stats.partsDestroyed;
        profile.projectilesFired += stats.shots;
        profile.abilitiesUsed += stats.abilitiesUsed;
        profile.highestDamageShot = Math.max(profile.highestDamageShot, stats.maxDamage);
        if (playerWon && (!profile.bestVictoryMs || durationMs < profile.bestVictoryMs)) profile.bestVictoryMs = durationMs;
        profile.daily.damage += stats.damageDealt;
        profile.daily.criticals += stats.criticalHits;
        profile.daily.wins += playerWon ? 1 : 0;
        const unlocked = new Set(profile.unlockedAchievementIds ?? []);
        if (profile.wins >= 1) unlocked.add("first-fall");
        if (profile.criticalHits >= 25) unlocked.add("bullseye");
        if (profile.damageDealt >= 5000) unlocked.add("demolition");
        if (playerWon && stats.shots <= 5) unlocked.add("untouched");
        if (profile.bestWinStreak >= 5) unlocked.add("hot-crown");
        if (profile.rank === "Legend") unlocked.add("legend");
        profile.unlockedAchievementIds = [...unlocked];
        await profile.save({ session: dbSession });
        if (playerWon) await applyWalletChange({
          userId: human.id, amount: locked.possibleReward, type: "RACE_REWARD", description: `${locked.tierId} Tower Clash victory reward`, referenceId: matchId,
          idempotencyKey: `${matchId}:tower-reward`, metadata: { game: "tower-clash", tierId: locked.tierId, serverVerified: true, opponent: "BOSS_AI" },
        }, dbSession);
      });
      const updated = await TowerProfile.findOne({ userId: human.id }).lean();
      return noStoreJson({ accepted: true, profile: profilePayload(updated as unknown as Record<string, unknown>) });
    }

    throw new ApiError("Unknown Tower Clash persistence phase.", 400, "INVALID_PHASE");
  } catch (error) {
    return handleRouteError(error);
  }
}
