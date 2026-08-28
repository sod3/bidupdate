import { z } from "zod";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { isPremiumGameId, premiumGameDefinitions, type PremiumGameId } from "@/lib/premium-games/definitions";
import { requireAdmin } from "@/lib/session";
import { FraudFlag, GameRound, GameSetting, PlayerGameStat, RngRound } from "@/models";
import { writeAudit } from "@/services/auditService";
import { allDefaultGameSettings } from "@/services/serverResultService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  gameId: z.string().trim().refine(isPremiumGameId),
  enabled: z.boolean(),
  maintenanceMode: z.boolean(),
  minStake: z.number().int().min(1).max(5000),
  maxStake: z.number().int().min(1).max(5000),
  chipDenominations: z.array(z.number().int().min(1).max(5000)).min(1).max(12),
  artwork: z.string().trim().max(240).optional(),
}).superRefine((value, context) => {
  if (value.minStake > value.maxStake) context.addIssue({ code: "custom", message: "Minimum stake cannot exceed maximum stake.", path: ["minStake"] });
  if (new Set(value.chipDenominations).size !== value.chipDenominations.length) context.addIssue({ code: "custom", message: "Chip values must be unique.", path: ["chipDenominations"] });
});

async function rows() {
  const stored = await GameSetting.find().lean();
  const byGame = new Map(stored.map((row) => [String(row.gameId), row]));
  return allDefaultGameSettings().map((fallback) => {
    const row = byGame.get(fallback.gameId);
    return {
      ...fallback,
      enabled: row?.enabled ?? fallback.enabled,
      maintenanceMode: row?.maintenanceMode ?? fallback.maintenanceMode,
      minStake: Number(row?.minStake ?? fallback.minStake),
      maxStake: Number(row?.maxStake ?? fallback.maxStake),
      chipDenominations: Array.isArray(row?.chipDenominations) && row.chipDenominations.length ? row.chipDenominations.map(Number) : fallback.chipDenominations,
      artwork: String(row?.artwork || fallback.artwork),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      probabilityNote: premiumGameDefinitions[fallback.gameId].probabilityNote,
    };
  });
}

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();
    const [games, rounds, stats, fraudFlags, rngRounds] = await Promise.all([
      rows(),
      GameRound.find().sort({ createdAt: -1 }).limit(100).populate("userId", "username email").lean(),
      PlayerGameStat.aggregate([{ $group: { _id: "$gameId", players: { $sum: 1 }, rounds: { $sum: "$rounds" }, wins: { $sum: "$wins" }, totalStaked: { $sum: "$totalStaked" }, totalPaid: { $sum: "$totalPaid" } } }, { $sort: { rounds: -1 } }]),
      FraudFlag.find({ status: { $in: ["OPEN", "REVIEWING"] } }).sort({ createdAt: -1 }).limit(50).populate("userId", "username email").lean(),
      RngRound.find().sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    return noStoreJson({
      games,
      rounds: rounds.map((round) => ({ id: String(round._id), roundId: round.roundId, gameId: round.gameId, user: round.userId, status: round.status, result: round.result, stake: round.totalStake, payout: round.payout, commitment: round.rngCommitment, resultHash: round.serverResultHash, startedAt: round.startedAt, completedAt: round.completedAt })),
      stats: stats.map((row) => ({ gameId: row._id, players: row.players, rounds: row.rounds, wins: row.wins, totalStaked: row.totalStaked, totalPaid: row.totalPaid })),
      fraudFlags: fraudFlags.map((flag) => ({ id: String(flag._id), user: flag.userId, gameId: flag.gameId, roundId: flag.roundId, code: flag.code, severity: flag.severity, status: flag.status, evidence: flag.evidence, createdAt: flag.createdAt })),
      rngRounds: rngRounds.map((round) => ({ id: String(round._id), roundId: round.roundId, gameId: round.gameId, version: round.version, commitment: round.commitment, resultHash: round.resultHash, revealedAt: round.revealedAt, createdAt: round.createdAt })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const input = await parseJson(request, updateSchema);
    await connectDB();
    const chips = [...input.chipDenominations].sort((left, right) => left - right);
    if (!chips.some((chip) => chip >= input.minStake && chip <= input.maxStake)) throw new ApiError("At least one chip must fall inside the stake range.", 400, "INVALID_CHIPS");
    const artwork = input.artwork || premiumGameDefinitions[input.gameId as PremiumGameId].thumbnail;
    await GameSetting.updateOne(
      { gameId: input.gameId },
      { $set: { enabled: input.enabled, maintenanceMode: input.maintenanceMode, minStake: input.minStake, maxStake: input.maxStake, chipDenominations: chips, artwork, updatedBy: admin.email } },
      { upsert: true },
    );
    await writeAudit({
      actor: "ADMIN",
      actorEmail: admin.email,
      action: "PREMIUM_GAME_SETTINGS_UPDATED",
      targetType: "GameSetting",
      targetId: input.gameId,
      details: { enabled: input.enabled, maintenanceMode: input.maintenanceMode, minStake: input.minStake, maxStake: input.maxStake, chipDenominations: chips, artwork },
      request,
    });
    return noStoreJson({ games: await rows() });
  } catch (error) {
    return handleRouteError(error);
  }
}
