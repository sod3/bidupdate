import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { AuthSession, User } from "@/models";
import { writeAudit } from "@/services/auditService";

const schema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(3).max(240) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await context.params;
    const input = await parseJson(request, schema);
    const user = await User.findByIdAndUpdate(id, { $set: { status: input.status } }, { returnDocument: "after" }).lean();
    if (!user) throw new ApiError("User not found.", 404, "USER_NOT_FOUND");
    if (input.status === "SUSPENDED") {
      await AuthSession.updateMany({ userId: id, kind: "USER", revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
    await writeAudit({ actor: "ADMIN", actorEmail: admin.email, action: input.status === "SUSPENDED" ? "USER_SUSPENDED" : "USER_REACTIVATED", targetType: "USER", targetId: id, details: { reason: input.reason }, request });
    return noStoreJson({ user: { id, status: user.status } });
  } catch (error) { return handleRouteError(error); }
}
