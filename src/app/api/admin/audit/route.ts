import { handleRouteError, noStoreJson } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { escapeRegex } from "@/lib/utils";
import { AuditLog } from "@/models";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim();
    const actor = params.get("actor");
    const filter: Record<string, unknown> = {};
    if (actor && ["ADMIN", "USER", "SYSTEM"].includes(actor)) filter.actor = actor;
    if (search) filter.$or = [
      { action: { $regex: escapeRegex(search), $options: "i" } },
      { actorEmail: { $regex: escapeRegex(search), $options: "i" } },
      { targetType: { $regex: escapeRegex(search), $options: "i" } },
      { targetId: { $regex: escapeRegex(search), $options: "i" } },
    ];
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(300).lean();
    return noStoreJson({ logs: logs.map((item) => ({ id: String(item._id), actor: item.actor, actorEmail: item.actorEmail, action: item.action, targetType: item.targetType, targetId: item.targetId, details: item.details, createdAt: item.createdAt })) });
  } catch (error) { return handleRouteError(error); }
}
