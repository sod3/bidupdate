import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { enforceRateLimit, requestFingerprint } from "@/lib/rateLimit";
import { SupportTicket } from "@/models";
import { writeAudit } from "@/services/auditService";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(3000),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(`support:${requestFingerprint(request)}`, 5, 60 * 60 * 1000);
    const input = await parseJson(request, schema);
    const session = await getCurrentUser();
    const ticket = await SupportTicket.create({ ...input, email: input.email.toLowerCase(), userId: session?.userId ?? null });
    await writeAudit({ actor: session ? "USER" : "SYSTEM", actorEmail: input.email, userId: session?.userId ?? null, action: "SUPPORT_TICKET_CREATED", targetType: "SUPPORT_TICKET", targetId: ticket.id, request });
    return noStoreJson({ ticket: { id: ticket.id, status: ticket.status, createdAt: ticket.createdAt } }, { status: 201 });
  } catch (error) { return handleRouteError(error); }
}
