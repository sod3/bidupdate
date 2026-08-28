import { assertSameOrigin, handleRouteError, noStoreJson } from "@/lib/api";
import { destroySession, requireAdmin } from "@/lib/session";
import { writeAudit } from "@/services/auditService";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    await writeAudit({ actor: "ADMIN", actorEmail: admin.email, action: "ADMIN_LOGOUT", targetType: "SESSION", targetId: admin.sessionId, request });
    await destroySession("ADMIN");
    return noStoreJson({ ok: true });
  } catch (error) { return handleRouteError(error); }
}
