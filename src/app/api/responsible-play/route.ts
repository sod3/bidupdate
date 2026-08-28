import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { User } from "@/models";
import { writeAudit } from "@/services/auditService";

const updateSchema = z.object({
  sessionTimerMinutes: z.number().int().min(15).max(360),
  dailyLossLimit: z.number().min(0).max(1_000_000).nullable(),
  weeklyLossLimit: z.number().min(0).max(5_000_000).nullable(),
});
const pauseSchema = z.object({ durationHours: z.union([z.literal(24), z.literal(168), z.literal(720)]) });

export async function GET() {
  try {
    const session = await requireUser();
    const user = await User.findById(session.userId).select("responsiblePlay").lean();
    return noStoreJson({ responsiblePlay: user?.responsiblePlay ?? null });
  } catch (error) { return handleRouteError(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireUser();
    const input = await parseJson(request, updateSchema);
    const user = await User.findByIdAndUpdate(
      session.userId,
      { $set: {
        "responsiblePlay.sessionTimerMinutes": input.sessionTimerMinutes,
        "responsiblePlay.dailyLossLimit": input.dailyLossLimit,
        "responsiblePlay.weeklyLossLimit": input.weeklyLossLimit,
      } },
      { returnDocument: "after" },
    ).select("responsiblePlay").lean();
    await writeAudit({ actor: "USER", actorEmail: session.email, userId: session.userId, action: "RESPONSIBLE_PLAY_UPDATED", targetType: "USER", targetId: session.userId, request });
    return noStoreJson({ responsiblePlay: user?.responsiblePlay ?? null });
  } catch (error) { return handleRouteError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireUser();
    const input = await parseJson(request, pauseSchema);
    const until = new Date(Date.now() + input.durationHours * 60 * 60 * 1000);
    const user = await User.findByIdAndUpdate(
      session.userId,
      { $max: { "responsiblePlay.coolingOffUntil": until } },
      { returnDocument: "after" },
    ).select("responsiblePlay").lean();
    await writeAudit({ actor: "USER", actorEmail: session.email, userId: session.userId, action: "COOLING_OFF_STARTED", targetType: "USER", targetId: session.userId, details: { until: until.toISOString() }, request });
    return noStoreJson({ responsiblePlay: user?.responsiblePlay ?? null });
  } catch (error) { return handleRouteError(error); }
}
