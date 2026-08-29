import { randomInt, randomUUID } from "node:crypto";
import { assertSameOrigin, ApiError, handleRouteError, noStoreJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  ArcheryMatch, ArcheryProfile, PenaltyMatch, PenaltyProfile, PoolMatch, PoolProfile,
  RaceMatch, RacingProfile, TowerMatch, TowerProfile,
} from "@/models";
import { POST as persistRace } from "@/app/api/neon-drift/match/route";
import { POST as persistArchery } from "@/app/api/precision-arena/match/route";
import { POST as persistTower } from "@/app/api/tower-clash/match/route";
import { POST as persistPool } from "@/app/api/eight-ball/match/route";
import { POST as persistPenalty } from "@/app/api/penalty-kings/match/route";
import { ensurePlatformData } from "@/services/bootstrapService";
import { FICTIONAL_OPPONENT_NAMES, fictionalOpponentNameAt } from "@/lib/opponentNames";
import { isVeryHardOpponentFavoredRoll } from "@/lib/gameDifficulty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Game = "racing" | "precision-arena" | "tower-clash" | "eight-ball" | "penalty-kings";
type PersistenceHandler = (request: Request) => Promise<Response>;
type StoredPlayer = { id: string; username: string; isBot?: boolean; vehicleId?: string; stats?: Record<string, number> };

const games = new Set<Game>(["racing", "precision-arena", "tower-clash", "eight-ball", "penalty-kings"]);
const archeryTiers = {
  valley: { reward: 200, opponent: "ELARA VALE", title: "VALLEY RANGER" },
  temple: { reward: 1000, opponent: "MASTER REN", title: "TEMPLE GUARDIAN" },
  legend: { reward: 2000, opponent: "NEON HAWK", title: "ROOFTOP LEGEND" },
} as const;
const towerTiers = {
  frontier: { reward: 200, boss: "IRON WARDEN", title: "HIGHLAND TYRANT" },
  warfront: { reward: 1000, boss: "EMBER EMPEROR", title: "WARFRONT DESTROYER" },
  royal: { reward: 2000, boss: "THE SUN KING", title: "ROYAL CATACLYSM" },
} as const;
const poolTiers = {
  club: { reward: 200 }, pro: { reward: 1000 }, "high-roller": { reward: 2000 },
} as const;
const penaltyTiers = {
  academy: { reward: 200 }, champions: { reward: 1000 }, "world-class": { reward: 2000 },
} as const;
const raceTargets: Record<string, number> = { rookie: 58_500, street: 55_500, pro: 52_500, elite: 49_500, legend: 46_500 };
const hardRaceTargets: Record<string, number> = { rookie: 52_500, street: 49_500, pro: 47_000, elite: 44_500, legend: 42_500 };

function freshOpponentName(body: Record<string, unknown>, username: string) {
  return fictionalOpponentNameAt(randomInt(FICTIONAL_OPPONENT_NAMES.length), [username, String(body.excludeOpponentName || "")]);
}

function hardCpuFavored() {
  return isVeryHardOpponentFavoredRoll(randomInt(100));
}

function secret() {
  const value = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("A server secret of at least 32 characters is required.");
  return value;
}

async function persist(request: Request, path: string, handler: PersistenceHandler, body: Record<string, unknown>) {
  const response = await handler(new Request(new URL(path, request.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-race-server-secret": secret() },
    body: JSON.stringify(body),
  }));
  const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string; code?: string };
  if (!response.ok) throw new ApiError(payload.error || "Game persistence failed.", response.status, payload.code);
  return payload;
}

function rows(value: unknown): StoredPlayer[] {
  return Array.isArray(value) ? value.filter((item): item is StoredPlayer => Boolean(item && typeof item === "object" && typeof (item as StoredPlayer).id === "string")) : [];
}

function owns(playerIds: unknown, userId: string) {
  return Array.isArray(playerIds) && playerIds.some((value) => String(value) === userId);
}

function winnerType(value: unknown) {
  if (value !== "PLAYER" && value !== "AI") throw new ApiError("The game result is invalid.", 400, "INVALID_RESULT");
  return value;
}

function minimumElapsed(startedAt: Date, milliseconds: number) {
  if (Date.now() - new Date(startedAt).getTime() < milliseconds) throw new ApiError("The match ended before a valid result could be recorded.", 409, "MATCH_TOO_SHORT");
}

function profileIdentity(profile: { level?: number; rank?: string; winStreak?: number }) {
  return { level: Number(profile.level) || 1, rank: String(profile.rank || "Rookie"), winStreak: Number(profile.winStreak) || 0 };
}

export async function POST(request: Request, context: { params: Promise<{ game: string }> }) {
  try {
    assertSameOrigin(request);
    const { game: rawGame } = await context.params;
    if (!games.has(rawGame as Game)) throw new ApiError("Unknown game.", 404, "GAME_NOT_FOUND");
    const game = rawGame as Game;
    const user = await requireUser();
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    if (action !== "START" && action !== "FINISH") throw new ApiError("Unknown gameplay action.", 400, "INVALID_ACTION");
    if (action === "START") await enforceRateLimit(`game-start:${user.userId}`, 30, 60 * 60 * 1000);

    if (game === "racing") {
      if (action === "START") {
        await ensurePlatformData();
        const tierId = String(body.tierId || "");
        const vehicleId = String(body.vehicleId || "");
        if (!(tierId in raceTargets)) throw new ApiError("Select a valid race tier.", 400, "INVALID_TIER");
        const profile = await RacingProfile.findOneAndUpdate({ userId: user.userId }, { $setOnInsert: { userId: user.userId } }, { upsert: true, new: true }).lean();
        const bot = { id: `race-ai-${randomUUID()}`, username: freshOpponentName(body, user.username), vehicleId, isBot: true, level: Math.max(18, profile.level + randomInt(6, 13)), rank: profile.rank, winStreak: randomInt(3, 13) };
        const human = { id: user.userId, username: user.username, vehicleId, isBot: false };
        const matchId = randomUUID();
        const startAt = Date.now() + 4_200;
        const environmentSeed = randomInt(1, 2_147_483_647);
        const aiFavored = hardCpuFavored();
        const aiTargetTimeMs = (aiFavored ? hardRaceTargets : raceTargets)[tierId] + randomInt(-650, 651);
        await persist(request, "/api/neon-drift/match", persistRace, { phase: "START", matchId, tierId, environmentSeed, startAt, players: [human, bot] });
        await RaceMatch.updateOne({ matchId }, { $set: { aiOpponent: bot, aiTargetTimeMs } });
        return noStoreJson({ match: { matchId, startAt, environmentSeed, opponent: bot, aiTargetTimeMs, aiFavored } });
      }
      const matchId = String(body.matchId || "");
      const match = await RaceMatch.findOne({ matchId }).lean();
      if (!match || !owns(match.playerIds, user.userId)) throw new ApiError("Race not found.", 404, "MATCH_NOT_FOUND");
      minimumElapsed(match.startedAt, 42_000);
      const humanTime = Math.max(42_000, Date.now() - new Date(match.startedAt).getTime());
      const aiTime = Number(match.aiTargetTimeMs) || 55_000;
      const bot = match.aiOpponent as StoredPlayer | null;
      if (!bot?.id) throw new ApiError("Race opponent data is unavailable.", 409, "OPPONENT_UNAVAILABLE");
      const humanWon = humanTime <= aiTime;
      const human: StoredPlayer = { id: user.userId, username: user.username, vehicleId: String((body.stats as Record<string, unknown> | undefined)?.vehicleId || body.vehicleId || "nightfang"), isBot: false, stats: body.stats as Record<string, number> };
      const players = [
        { ...human, finishTimeMs: humanTime, result: humanWon ? "WIN" : "LOSS" },
        { ...bot, finishTimeMs: aiTime, result: humanWon ? "LOSS" : "WIN", stats: {} },
      ];
      const winnerId = humanWon ? user.userId : bot.id;
      const differenceMs = Math.abs(humanTime - aiTime);
      await persist(request, "/api/neon-drift/match", persistRace, { phase: "RESULT", matchId, winnerId, photoFinish: differenceMs <= 120, differenceMs, players });
      return noStoreJson({ result: { winnerId, photoFinish: differenceMs <= 120, differenceMs, players, xpAwarded: humanWon ? 420 : 180, creditsAwarded: humanWon ? match.prizePool : 0, rankDelta: humanWon ? 14 : -8 } });
    }

    if (game === "precision-arena") {
      if (action === "START") {
        const tierId = String(body.tierId || "") as keyof typeof archeryTiers;
        const tier = archeryTiers[tierId];
        if (!tier) throw new ApiError("Select a valid archery tier.", 400, "INVALID_TIER");
        const profile = await ArcheryProfile.findOneAndUpdate({ userId: user.userId }, { $setOnInsert: { userId: user.userId } }, { upsert: true, new: true }).lean();
        const bot = { id: `archery-ai-${randomUUID()}`, username: freshOpponentName(body, user.username), title: tier.title, ...profileIdentity(profile), level: Math.max(22, profile.level + randomInt(7, 15)), isBot: true };
        const matchId = randomUUID(); const startAt = Date.now() + 4_000; const environmentSeed = randomInt(1, 2_147_483_647); const aiFavored = hardCpuFavored();
        await persist(request, "/api/precision-arena/match", persistArchery, { phase: "START", matchId, tierId, startAt, environmentSeed, aiFavored, bowId: body.bowId, arrowId: body.arrowId, targetId: body.targetId, cosmeticId: body.cosmeticId, environmentId: body.environmentId, players: [{ id: user.userId, username: user.username }, bot] });
        return noStoreJson({ match: { matchId, tierId, startAt, environmentSeed, opponent: bot, aiFavored } });
      }
      const match = await ArcheryMatch.findOne({ matchId: String(body.matchId || "") }).lean();
      if (!match || !owns(match.playerIds, user.userId)) throw new ApiError("Archery duel not found.", 404, "MATCH_NOT_FOUND");
      minimumElapsed(match.startedAt, 8_000);
      const players = rows(match.players); const bot = players.find((player) => player.isBot);
      if (!bot) throw new ApiError("Archery opponent is unavailable.", 409);
      const scores = body.scores && typeof body.scores === "object" ? body.scores as Record<string, number> : {};
      const won = Number(scores.player) > Number(scores.ai); const winnerId = won ? user.userId : bot.id; const durationMs = Date.now() - new Date(match.startedAt).getTime();
      const saved = await persist(request, "/api/precision-arena/match", persistArchery, { phase: "RESULT", matchId: match.matchId, winnerId, scores, stats: body.stats, durationMs, players });
      return noStoreJson({ result: { winnerId, winnerName: won ? user.username : bot.username, xpAwarded: won ? 600 : 240, creditsAwarded: won ? match.possibleReward : 0, rankDelta: won ? 20 : -9, durationMs, profile: saved.profile } });
    }

    if (game === "tower-clash") {
      if (action === "START") {
        const tierId = String(body.tierId || "") as keyof typeof towerTiers; const tier = towerTiers[tierId];
        if (!tier) throw new ApiError("Select a valid tower tier.", 400, "INVALID_TIER");
        const profile = await TowerProfile.findOneAndUpdate({ userId: user.userId }, { $setOnInsert: { userId: user.userId } }, { upsert: true, new: true }).lean();
        const bot = { id: `tower-ai-${randomUUID()}`, username: freshOpponentName(body, user.username), title: tier.title, ...profileIdentity(profile), level: Math.max(24, profile.level + randomInt(7, 16)), isBot: true };
        const matchId = randomUUID(); const startAt = Date.now() + 4_000; const environmentSeed = randomInt(1, 2_147_483_647); const aiFavored = hardCpuFavored();
        await persist(request, "/api/tower-clash/match", persistTower, { phase: "START", matchId, tierId, startAt, environmentSeed, aiFavored, cannonId: body.cannonId, castleId: body.castleId, arenaId: body.arenaId, projectileSkinId: body.projectileSkinId, players: [{ id: user.userId, username: user.username }, bot] });
        return noStoreJson({ match: { matchId, tierId, startAt, environmentSeed, opponent: bot, aiFavored } });
      }
      const match = await TowerMatch.findOne({ matchId: String(body.matchId || "") }).lean();
      if (!match || !owns(match.playerIds, user.userId)) throw new ApiError("Tower battle not found.", 404, "MATCH_NOT_FOUND");
      minimumElapsed(match.startedAt, 10_000); const players = rows(match.players); const bot = players.find((player) => player.isBot);
      if (!bot) throw new ApiError("Tower opponent is unavailable.", 409);
      const outcome = winnerType(body.winner); const won = outcome === "PLAYER"; const winnerId = won ? user.userId : bot.id; const durationMs = Date.now() - new Date(match.startedAt).getTime();
      const saved = await persist(request, "/api/tower-clash/match", persistTower, { phase: "RESULT", matchId: match.matchId, winnerId, stats: body.stats, durationMs, players });
      return noStoreJson({ result: { winnerId, winnerName: won ? user.username : bot.username, xpAwarded: won ? 650 : 250, creditsAwarded: won ? match.possibleReward : 0, rankDelta: won ? 22 : -10, durationMs, profile: saved.profile } });
    }

    if (game === "eight-ball") {
      if (action === "START") {
        const tierId = String(body.tierId || "") as keyof typeof poolTiers; if (!poolTiers[tierId]) throw new ApiError("Select a valid pool tier.", 400, "INVALID_TIER");
        const profile = await PoolProfile.findOneAndUpdate({ userId: user.userId }, { $setOnInsert: { userId: user.userId } }, { upsert: true, new: true }).lean();
        const bot = { id: `pool-ai-${randomUUID()}`, username: freshOpponentName(body, user.username), ...profileIdentity(profile), level: Math.max(25, profile.level + randomInt(7, 15)), isBot: true };
        const matchId = randomUUID(); const startAt = Date.now() + 4_000; const environmentSeed = randomInt(1, 2_147_483_647); const aiFavored = hardCpuFavored();
        await persist(request, "/api/eight-ball/match", persistPool, { phase: "START", matchId, tierId, startAt, environmentSeed, aiFavored, cueId: body.cueId, tableId: body.tableId, ballSkinId: body.ballSkinId, players: [{ id: user.userId, username: user.username }, bot] });
        return noStoreJson({ match: { matchId, tierId, startAt, environmentSeed, opponent: bot, aiFavored } });
      }
      const match = await PoolMatch.findOne({ matchId: String(body.matchId || "") }).lean();
      if (!match || !owns(match.playerIds, user.userId)) throw new ApiError("Pool match not found.", 404, "MATCH_NOT_FOUND");
      minimumElapsed(match.startedAt, 20_000); const players = rows(match.players); const bot = players.find((player) => player.isBot);
      if (!bot) throw new ApiError("Pool opponent is unavailable.", 409);
      const outcome = winnerType(body.winner); const won = outcome === "PLAYER"; const winnerId = won ? user.userId : bot.id; const durationMs = Date.now() - new Date(match.startedAt).getTime();
      const saved = await persist(request, "/api/eight-ball/match", persistPool, { phase: "RESULT", matchId: match.matchId, winnerId, stats: body.stats, durationMs, players });
      return noStoreJson({ result: { winnerId, winnerName: won ? user.username : bot.username, xpAwarded: won ? 600 : 230, creditsAwarded: won ? match.possibleReward : 0, rankDelta: won ? 18 : -9, durationMs, profile: saved.profile } });
    }

    if (action === "START") {
      const tierId = String(body.tierId || "") as keyof typeof penaltyTiers; if (!penaltyTiers[tierId]) throw new ApiError("Select a valid penalty tier.", 400, "INVALID_TIER");
      const profile = await PenaltyProfile.findOneAndUpdate({ userId: user.userId }, { $setOnInsert: { userId: user.userId } }, { upsert: true, new: true }).lean();
      const bot = { id: `penalty-ai-${randomUUID()}`, username: freshOpponentName(body, user.username), ...profileIdentity(profile), level: Math.max(27, profile.level + randomInt(8, 16)), isBot: true };
      const matchId = randomUUID(); const startAt = Date.now() + 4_000; const environmentSeed = randomInt(1, 2_147_483_647); const aiFavored = hardCpuFavored();
      await persist(request, "/api/penalty-kings/match", persistPenalty, { phase: "START", matchId, tierId, startAt, environmentSeed, aiFavored, players: [{ id: user.userId, username: user.username }, bot] });
      return noStoreJson({ match: { matchId, tierId, startAt, environmentSeed, opponent: bot, firstStrikerId: user.userId, aiFavored } });
    }
    const match = await PenaltyMatch.findOne({ matchId: String(body.matchId || "") }).lean();
    if (!match || !owns(match.playerIds, user.userId)) throw new ApiError("Penalty match not found.", 404, "MATCH_NOT_FOUND");
    minimumElapsed(match.startedAt, 20_000); const players = rows(match.players).map((player) => ({ ...player, isBot: player.id.startsWith("penalty-ai-") })); const bot = players.find((player) => player.isBot);
    if (!bot) throw new ApiError("Penalty opponent is unavailable.", 409);
    const scores = body.scores && typeof body.scores === "object" ? body.scores as Record<string, number> : {};
    const won = Number(scores[user.userId]) > Number(scores[bot.id]); const winnerId = won ? user.userId : bot.id;
    players.find((player) => !player.isBot)!.stats = body.stats as Record<string, number>;
    await persist(request, "/api/penalty-kings/match", persistPenalty, { phase: "RESULT", matchId: match.matchId, winnerId, suddenDeath: body.suddenDeath, rounds: body.rounds, scores, histories: body.histories, players });
    const updated = await PenaltyProfile.findOne({ userId: user.userId }).lean();
    return noStoreJson({ result: { winnerId, winnerName: won ? user.username : bot.username, scores, histories: body.histories, suddenDeath: Boolean(body.suddenDeath), xpAwarded: won ? 420 : 170, creditsAwarded: won ? match.prizePool : 0, rankDelta: won ? 14 : -8, stats: body.stats, profile: updated } });
  } catch (error) {
    return handleRouteError(error);
  }
}
