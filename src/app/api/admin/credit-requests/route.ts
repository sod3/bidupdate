import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { normalizeTransactionId, readPaymentProof } from "@/lib/paymentVerification";
import { CreditRequest } from "@/models";
import { reviewCreditRequest } from "@/services/walletService";
import { writeAudit } from "@/services/auditService";

const schema = z.object({
  requestId: z.string().regex(/^[a-f0-9]{24}$/i),
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(240).default(""),
  providerHistoryConfirmed: z.boolean().default(false),
  amountAndAccountConfirmed: z.boolean().default(false),
  proofConfirmed: z.boolean().default(false),
  payoutTransactionId: z.string().trim().max(80).default(""),
});

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function formBoolean(form: FormData, name: string) {
  return formText(form, name) === "true";
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const status = new URL(request.url).searchParams.get("status");
    const filter = status && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status) ? { status } : {};
    const requests = await CreditRequest.find(filter)
      .select("+details +payerMobile +recipientMobile +accountTitle +paymentProofSize +payoutProofSize")
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return noStoreJson({ requests: requests.map((item) => ({
      id: String(item._id), reference: item.reference, type: item.type, amount: item.amount, method: item.method,
      transactionId: item.transactionId, payerMobile: item.payerMobile, recipientMobile: item.recipientMobile,
      accountTitle: item.accountTitle, hasPaymentProof: Number(item.paymentProofSize ?? 0) > 0,
      payoutTransactionId: item.payoutTransactionId, hasPayoutProof: Number(item.payoutProofSize ?? 0) > 0,
      details: item.details, verification: item.verification, status: item.status, reviewedBy: item.reviewedBy,
      reviewNote: item.reviewNote, reviewedAt: item.reviewedAt, createdAt: item.createdAt, user: item.userId,
    })) });
  } catch (error) { return handleRouteError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const form = await request.formData();
    const input = schema.parse({
      requestId: formText(form, "requestId"),
      status: formText(form, "status"),
      reviewNote: formText(form, "reviewNote"),
      providerHistoryConfirmed: formBoolean(form, "providerHistoryConfirmed"),
      amountAndAccountConfirmed: formBoolean(form, "amountAndAccountConfirmed"),
      proofConfirmed: formBoolean(form, "proofConfirmed"),
      payoutTransactionId: formText(form, "payoutTransactionId"),
    });
    const payoutFile = form.get("payoutProof");
    const payoutProof = input.status === "APPROVED" && payoutFile instanceof File && payoutFile.size > 0
      ? await readPaymentProof(payoutFile)
      : null;
    const payoutTransactionId = input.payoutTransactionId
      ? normalizeTransactionId(input.payoutTransactionId)
      : undefined;
    await reviewCreditRequest({
      ...input,
      reviewNote: input.reviewNote || undefined,
      payoutTransactionId,
      payoutProof: payoutProof?.buffer,
      payoutProofMime: payoutProof?.mimeType,
      payoutProofSize: payoutProof?.size,
      payoutProofSha256: payoutProof?.sha256,
      adminEmail: admin.email,
    });
    await writeAudit({
      actor: "ADMIN",
      actorEmail: admin.email,
      action: `CREDIT_REQUEST_${input.status}`,
      targetType: "CREDIT_REQUEST",
      targetId: input.requestId,
      details: {
        reviewNote: input.reviewNote || null,
        providerHistoryConfirmed: input.providerHistoryConfirmed,
        amountAndAccountConfirmed: input.amountAndAccountConfirmed,
        proofConfirmed: input.proofConfirmed,
        payoutTransactionId: payoutTransactionId ?? null,
      },
      request,
    });
    return noStoreJson({ ok: true });
  } catch (error) { return handleRouteError(error); }
}
