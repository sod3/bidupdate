import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { User } from "@/models";
import { writeAudit } from "@/services/auditService";
import { applyWalletChange, getWalletSnapshot } from "@/services/walletService";

const schema = z.object({
  userId: z.string().regex(/^[a-f0-9]{24}$/i),
  amount: z.number().finite().min(-1_000_000).max(1_000_000).multipleOf(0.01).refine((value) => value !== 0),
  reason: z.string().trim().min(5).max(240),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const input = await parseJson(request, schema);
    if (!(await User.exists({ _id: input.userId }))) return noStoreJson({ error: "User not found." }, { status: 404 });
    const database = await connectDB();
    await database.connection.transaction(async (session) => {
      await applyWalletChange({
        userId: input.userId,
        amount: input.amount,
        type: "ADMIN_ADJUSTMENT",
        description: input.reason,
        referenceId: admin.sessionId,
        idempotencyKey: `admin-adjust:${crypto.randomUUID()}`,
        metadata: { adminEmail: admin.email },
      }, session);
    });
    await writeAudit({ actor: "ADMIN", actorEmail: admin.email, action: "BALANCE_ADJUSTED", targetType: "USER", targetId: input.userId, details: { amount: input.amount, reason: input.reason }, request });
    return noStoreJson({ wallet: await getWalletSnapshot(input.userId) });
  } catch (error) { return handleRouteError(error); }
}
