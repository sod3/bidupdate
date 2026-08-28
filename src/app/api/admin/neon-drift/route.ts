import { assertSameOrigin, handleRouteError, noStoreJson, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { Achievement, AntiCheatLog, CompetitionTier, MatchmakingQueue, Mission, RaceMatch, RaceParticipant, RacingProfile, Report, Track, User, Vehicle, Wallet } from "@/models";
import { writeAudit } from "@/services/auditService";
import { ensurePlatformData } from "@/services/bootstrapService";

function plain(item: Record<string, unknown>) { return { ...item, id: String(item._id), _id: undefined }; }

export async function GET() {
  try {
    await requireAdmin();
    await ensurePlatformData();
    const [users, profiles, vehicles, tiers, tracks, missions, achievements, matches, queueCount, antiCheat, reports, wallet] = await Promise.all([
      User.countDocuments(),
      RacingProfile.find().sort({ rankPoints: -1, wins: -1 }).limit(100).populate("userId", "username email status").lean(),
      Vehicle.find().sort({ name: 1 }).lean(),
      CompetitionTier.find().sort({ order: 1 }).lean(),
      Track.find().sort({ name: 1 }).lean(),
      Mission.find().sort({ cadence: 1, title: 1 }).lean(),
      Achievement.find().sort({ title: 1 }).lean(),
      RaceMatch.find().sort({ createdAt: -1 }).limit(80).lean(),
      MatchmakingQueue.countDocuments({ expiresAt: { $gt: new Date() } }),
      AntiCheatLog.find().sort({ createdAt: -1 }).limit(100).populate("userId", "username email").lean(),
      Report.find().sort({ createdAt: -1 }).limit(100).populate("reporterId reportedUserId", "username email").lean(),
      Wallet.aggregate([{ $group: { _id: null, credits: { $sum: "$balance" }, wagered: { $sum: "$totalWagered" }, awarded: { $sum: "$totalWon" } } }]),
    ]);
    const participantRows = await RaceParticipant.find({ matchId: { $in: matches.map((match) => match.matchId) } }).lean();
    const participants = new Map<string, unknown[]>();
    for (const row of participantRows) participants.set(row.matchId, [...(participants.get(row.matchId) ?? []), plain(row as unknown as Record<string, unknown>)]);
    return noStoreJson({
      stats: { users, races: await RaceMatch.countDocuments(), liveQueue: queueCount, completed: await RaceMatch.countDocuments({ status: "COMPLETED" }), flagged: await AntiCheatLog.countDocuments({ severity: { $in: ["HIGH", "CRITICAL"] } }), credits: wallet[0]?.credits ?? 0, wagered: wallet[0]?.wagered ?? 0, awarded: wallet[0]?.awarded ?? 0 },
      profiles: profiles.map((item) => plain(item as unknown as Record<string, unknown>)),
      vehicles: vehicles.map((item) => plain(item as unknown as Record<string, unknown>)),
      tiers: tiers.map((item) => plain(item as unknown as Record<string, unknown>)),
      tracks: tracks.map((item) => plain(item as unknown as Record<string, unknown>)),
      missions: missions.map((item) => plain(item as unknown as Record<string, unknown>)),
      achievements: achievements.map((item) => plain(item as unknown as Record<string, unknown>)),
      matches: matches.map((item) => ({ ...plain(item as unknown as Record<string, unknown>), participants: participants.get(item.matchId) ?? [] })),
      antiCheat: antiCheat.map((item) => plain(item as unknown as Record<string, unknown>)),
      reports: reports.map((item) => plain(item as unknown as Record<string, unknown>)),
    });
  } catch (error) { return handleRouteError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const body = await request.json() as Record<string, unknown>;
    const entity = String(body.entity || "");
    const id = String(body.id || "");
    if (!id) throw new ApiError("Configuration id is required.", 400, "INVALID_ID");
    let updated: unknown;
    if (entity === "TIER") {
      const entryCredits = Number(body.entryCredits); const prizePool = Number(body.prizePool);
      if (!Number.isFinite(entryCredits) || !Number.isFinite(prizePool) || entryCredits < 0 || prizePool < entryCredits * 2) throw new ApiError("Tier credits are invalid.", 400, "INVALID_TIER");
      updated = await CompetitionTier.findOneAndUpdate({ tierId: id }, { $set: { entryCredits, prizePool, isActive: Boolean(body.isActive) } }, { new: true }).lean();
    } else if (entity === "VEHICLE") {
      updated = await Vehicle.findOneAndUpdate({ vehicleId: id }, { $set: { isActive: Boolean(body.isActive) } }, { new: true }).lean();
    } else if (entity === "TRACK") {
      updated = await Track.findOneAndUpdate({ trackId: id }, { $set: { isActive: Boolean(body.isActive), environment: typeof body.environment === "object" && body.environment ? body.environment : {} } }, { new: true }).lean();
    } else if (entity === "MISSION") {
      const target = Number(body.target); const xpReward = Number(body.xpReward);
      if (!Number.isFinite(target) || !Number.isFinite(xpReward) || target <= 0 || xpReward < 0) throw new ApiError("Mission values are invalid.", 400, "INVALID_MISSION");
      updated = await Mission.findOneAndUpdate({ missionId: id }, { $set: { target, xpReward, isActive: Boolean(body.isActive) } }, { new: true }).lean();
    } else if (entity === "REPORT") {
      const status = String(body.status);
      if (!["OPEN", "REVIEWED", "DISMISSED", "ACTIONED"].includes(status)) throw new ApiError("Report status is invalid.", 400, "INVALID_REPORT_STATUS");
      updated = await Report.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    } else throw new ApiError("Unsupported operations entity.", 400, "INVALID_ENTITY");
    if (!updated) throw new ApiError("Configuration item was not found.", 404, "NOT_FOUND");
    await writeAudit({ actor: "ADMIN", actorEmail: admin.email, action: `${entity}_UPDATED`, targetType: entity, targetId: id, details: body, request });
    return noStoreJson({ item: plain(updated as unknown as Record<string, unknown>) });
  } catch (error) { return handleRouteError(error); }
}
