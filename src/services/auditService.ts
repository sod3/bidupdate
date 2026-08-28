import { connectDB } from "@/lib/db";
import { AuditLog } from "@/models";
import { requestFingerprint } from "@/lib/rateLimit";

export async function writeAudit(input: {
  actor: "ADMIN" | "USER" | "SYSTEM";
  actorEmail?: string | null;
  userId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
  request?: Request;
}) {
  await connectDB();
  await AuditLog.create({
    actor: input.actor,
    actorEmail: input.actorEmail ?? null,
    userId: input.userId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    details: input.details ?? {},
    fingerprintHash: input.request ? requestFingerprint(input.request) : null,
  });
}
