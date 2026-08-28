import { Types } from "mongoose";
import { handleRouteError, noStoreJson, ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import {
  AntiCheatLog,
  CompetitionTier,
  RaceCheckpoint,
  RaceMatch,
  RaceParticipant,
  RacingProfile,
  User,
} from "@/models";
import { applyWalletChange } from "@/services/walletService";

type TrustedPlayer = {
  id: string;
  username: string;
  vehicleId: string;
  isBot?: boolean;
  finishTimeMs?: number | null;
  result?: "WIN" | "LOSS" | "DNF";
  stats?: Record<string, number>;
  checkpoints?: Array<{
    checkpoint: number;
    raceTimeMs: number;
    x: number;
    z: number;
  }>;
};

function requireRaceServer(request: Request) {
  const expected = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  const received = request.headers.get("x-race-server-secret");
  if (!expected || expected.length < 32 || received !== expected)
    throw new ApiError(
      "Trusted race server authorization is required.",
      401,
      "RACE_SERVER_REQUIRED",
    );
}

function validPlayers(
  players: unknown,
): players is [TrustedPlayer, TrustedPlayer] {
  return (
    Array.isArray(players) &&
    players.length === 2 &&
    players.every(
      (player) =>
        player &&
        typeof player.id === "string" &&
        (player.isBot === true
          ? player.id.startsWith("race-ai-")
          : Types.ObjectId.isValid(player.id)) &&
        typeof player.username === "string" &&
        typeof player.vehicleId === "string",
    ) &&
    players.filter((player) => player.isBot === true).length === 1
  );
}

export async function POST(request: Request) {
  try {
    requireRaceServer(request);
    const body = (await request.json()) as Record<string, unknown>;
    const phase = body.phase;
    const matchId = typeof body.matchId === "string" ? body.matchId : "";
    if (!matchId || matchId.length > 80)
      throw new ApiError("Match id is invalid.", 400, "INVALID_MATCH");
    const database = await connectDB();

    if (phase === "CHEAT") {
      if (
        typeof body.userId !== "string" ||
        !Types.ObjectId.isValid(body.userId) ||
        typeof body.rule !== "string"
      )
        throw new ApiError(
          "Anti-cheat payload is invalid.",
          400,
          "INVALID_ANTI_CHEAT",
        );
      await AntiCheatLog.create({
        matchId,
        userId: body.userId,
        rule: body.rule,
        severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(
          String(body.severity),
        )
          ? body.severity
          : "MEDIUM",
        telemetry:
          typeof body.telemetry === "object" && body.telemetry
            ? body.telemetry
            : {},
      });
      return noStoreJson({ accepted: true });
    }

    if (phase === "START") {
      const players = body.players;
      if (
        !validPlayers(players) ||
        typeof body.tierId !== "string" ||
        typeof body.environmentSeed !== "number" ||
        typeof body.startAt !== "number"
      )
        throw new ApiError(
          "Race start payload is invalid.",
          400,
          "INVALID_START",
        );
      const existing = await RaceMatch.findOne({ matchId }).lean();
      if (existing) return noStoreJson({ accepted: true, duplicate: true });
      const humanPlayers = players.filter((player) => !player.isBot);
      const tier = await CompetitionTier.findOne({
        tierId: body.tierId,
        isActive: true,
      }).lean();
      if (!tier)
        throw new ApiError(
          "Competition tier is unavailable.",
          409,
          "TIER_UNAVAILABLE",
        );
      const users = await User.find({
        _id: { $in: humanPlayers.map((player) => player.id) },
        status: "ACTIVE",
      })
        .select("_id username")
        .lean();
      if (users.length !== humanPlayers.length)
        throw new ApiError(
          "The driver must have an active account.",
          409,
          "PLAYER_UNAVAILABLE",
        );
      await database.connection.transaction(async (session) => {
        if (await RaceMatch.exists({ matchId }).session(session)) return;
        await RaceMatch.create(
          [
            {
              matchId,
              tierId: tier.tierId,
              trackId: "night-city-circuit",
              environmentSeed: body.environmentSeed,
              entryCredits: tier.entryCredits,
              prizePool: tier.prizePool,
              playerIds: humanPlayers.map((player) => player.id),
              status: "COUNTDOWN",
              startedAt: new Date(body.startAt as number),
            },
          ],
          { session },
        );
        await RaceParticipant.create(
          humanPlayers.map((player) => ({
            matchId,
            userId: player.id,
            username: player.username,
            vehicleId: player.vehicleId,
            result: "PENDING",
          })),
          { session },
        );
        for (const player of humanPlayers)
          await applyWalletChange(
            {
              userId: player.id,
              amount: -tier.entryCredits,
              type: "RACE_ENTRY",
              description: `${tier.name} entry`,
              referenceId: matchId,
              idempotencyKey: `${matchId}:${player.id}:entry`,
              metadata: { tierId: tier.tierId, trackId: "night-city-circuit" },
            },
            session,
          );
      });
      return noStoreJson({ accepted: true });
    }

    if (phase === "RESULT") {
      const players = body.players;
      if (!validPlayers(players) || typeof body.winnerId !== "string")
        throw new ApiError(
          "Race result payload is invalid.",
          400,
          "INVALID_RESULT",
        );
      const match = await RaceMatch.findOne({ matchId }).lean();
      if (!match)
        throw new ApiError(
          "Race match was not registered.",
          404,
          "MATCH_NOT_FOUND",
        );
      if (match.status === "COMPLETED")
        return noStoreJson({ accepted: true, duplicate: true });
      if (!players.some((player) => player.id === body.winnerId))
        throw new ApiError(
          "Winner is not a match participant.",
          400,
          "INVALID_WINNER",
        );
      await database.connection.transaction(async (session) => {
        const locked = await RaceMatch.findOne({
          matchId,
          status: { $ne: "COMPLETED" },
        }).session(session);
        if (!locked) return;
        locked.status = "COMPLETED";
        const humanPlayers = players.filter((player) => !player.isBot);
        const humanWinner = humanPlayers.find(
          (player) => player.id === body.winnerId,
        );
        locked.winnerId = humanWinner
          ? new Types.ObjectId(humanWinner.id)
          : null;
        locked.finishedAt = new Date();
        locked.photoFinish = Boolean(body.photoFinish);
        locked.differenceMs =
          typeof body.differenceMs === "number"
            ? Math.max(0, body.differenceMs)
            : null;
        await locked.save({ session });
        for (const player of humanPlayers) {
          const won = player.id === body.winnerId;
          const stats = player.stats ?? {};
          await RaceParticipant.updateOne(
            { matchId, userId: player.id },
            {
              $set: {
                finishTimeMs: player.finishTimeMs ?? null,
                result: player.result ?? (won ? "WIN" : "LOSS"),
                stats,
              },
            },
            { session },
          );
          if (player.checkpoints?.length)
            await RaceCheckpoint.bulkWrite(
              player.checkpoints.map((checkpoint) => ({
                updateOne: {
                  filter: {
                    matchId,
                    userId: player.id,
                    checkpoint: checkpoint.checkpoint,
                  },
                  update: {
                    $setOnInsert: {
                      matchId,
                      userId: player.id,
                      checkpoint: checkpoint.checkpoint,
                      raceTimeMs: checkpoint.raceTimeMs,
                      position: { x: checkpoint.x, z: checkpoint.z },
                    },
                  },
                  upsert: true,
                },
              })),
              { session },
            );
          const profile = await RacingProfile.findOneAndUpdate(
            { userId: player.id },
            { $setOnInsert: { userId: player.id } },
            { upsert: true, new: true, session },
          );
          profile.xp += won ? 420 : 180;
          profile.rankPoints = Math.max(
            0,
            profile.rankPoints + (won ? 14 : -8),
          );
          profile.wins += won ? 1 : 0;
          profile.losses += won ? 0 : 1;
          profile.winStreak = won ? profile.winStreak + 1 : 0;
          profile.bestWinStreak = Math.max(
            profile.bestWinStreak,
            profile.winStreak,
          );
          profile.level = Math.max(
            profile.level,
            Math.floor(profile.xp / 3200) + 1,
          );
          if (
            player.finishTimeMs &&
            (!profile.bestTimeMs || player.finishTimeMs < profile.bestTimeMs)
          )
            profile.bestTimeMs = player.finishTimeMs;
          profile.totalDriftScore += Number(stats.driftScore ?? 0);
          profile.perfectDrifts += Number(stats.perfectDrifts ?? 0);
          profile.nearMisses += Number(stats.nearMisses ?? 0);
          profile.topSpeedKmh = Math.max(
            profile.topSpeedKmh,
            Number(stats.topSpeedKmh ?? 0),
          );
          await profile.save({ session });
        }
        if (humanWinner)
          await applyWalletChange(
            {
              userId: humanWinner.id,
              amount: locked.prizePool,
              type: "RACE_REWARD",
              description: `${locked.tierId} race victory reward`,
              referenceId: matchId,
              idempotencyKey: `${matchId}:reward`,
              metadata: {
                tierId: locked.tierId,
                verified: true,
                opponent: "EXPERT_AI",
              },
            },
            session,
          );
      });
      return noStoreJson({ accepted: true });
    }

    throw new ApiError("Unknown race persistence phase.", 400, "INVALID_PHASE");
  } catch (error) {
    return handleRouteError(error);
  }
}
