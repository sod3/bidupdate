import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { SupportTicket } from "@/models";
import { writeAudit } from "@/services/auditService";

const schema = z.object({ ticketId: z.string().regex(/^[a-f0-9]{24}$/i), status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]), adminNote: z.string().trim().max(1000).optional() });

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const status = new URL(request.url).searchParams.get("status");
    const filter = status && ["OPEN", "IN_PROGRESS", "RESOLVED"].includes(status) ? { status } : {};
    const tickets = await SupportTicket.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    return noStoreJson({ tickets: tickets.map((item) => ({ ...item, id: String(item._id), _id: undefined, userId: item.userId ? String(item.userId) : null })) });
  } catch (error) { return handleRouteError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const input = await parseJson(request, schema);
    const ticket = await SupportTicket.findByIdAndUpdate(input.ticketId, { $set: { status: input.status, adminNote: input.adminNote || null } }, { returnDocument: "after" }).lean();
    if (!ticket) throw new ApiError("Ticket not found.", 404, "TICKET_NOT_FOUND");
    await writeAudit({ actor: "ADMIN", actorEmail: admin.email, action: "SUPPORT_TICKET_UPDATED", targetType: "SUPPORT_TICKET", targetId: input.ticketId, details: { status: input.status }, request });
    return noStoreJson({ ok: true });
  } catch (error) { return handleRouteError(error); }
}
