import { z } from "zod";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rateLimit";
import { cancelCreditRequest, createCreditRequest, getWalletSnapshot } from "@/services/walletService";
import { writeAudit } from "@/services/auditService";
import { normalizePakistanMobile, normalizeTransactionId, readPaymentProof } from "@/lib/paymentVerification";

const createSchema = z.object({
  type: z.enum(["TOP_UP", "WITHDRAWAL"]),
  amount: z.coerce.number().finite().min(100).max(50_000).multipleOf(0.01),
  note: z.string().trim().max(240).default(""),
  method: z.enum(["JAZZCASH", "EASYPAISA"]),
  transactionId: z.string().trim().max(80).default(""),
  payerMobile: z.string().trim().max(24).default(""),
  recipientMobile: z.string().trim().max(24).default(""),
  accountTitle: z.string().trim().max(80).default(""),
  idempotencyKey: z.string().trim().min(16).max(80),
});
const cancelSchema = z.object({ requestId: z.string().min(1).max(64) });

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await enforceRateLimit(`credit-request:${user.userId}`, 10, 60 * 60 * 1000);
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError("Payment requests must include form data and receipt proof.", 415, "UNSUPPORTED_MEDIA_TYPE");
    }
    const form = await request.formData();
    const input = createSchema.parse({
      type: formText(form, "type"),
      amount: formText(form, "amount"),
      note: formText(form, "note"),
      method: formText(form, "method"),
      transactionId: formText(form, "transactionId"),
      payerMobile: formText(form, "payerMobile"),
      recipientMobile: formText(form, "recipientMobile"),
      accountTitle: formText(form, "accountTitle"),
      idempotencyKey: formText(form, "idempotencyKey"),
    });
    const proofFile = form.get("paymentProof");
    const proof = input.type === "TOP_UP"
      ? await readPaymentProof(proofFile instanceof File ? proofFile : null)
      : null;
    const transactionId = input.type === "TOP_UP" ? normalizeTransactionId(input.transactionId) : undefined;
    const payerMobile = input.type === "TOP_UP" ? normalizePakistanMobile(input.payerMobile) : undefined;
    const recipientMobile = input.type === "WITHDRAWAL" ? normalizePakistanMobile(input.recipientMobile) : undefined;
    if (input.type === "WITHDRAWAL" && input.accountTitle.length < 2) {
      throw new ApiError("Enter the account holder name for the receiving wallet.", 400, "ACCOUNT_TITLE_REQUIRED");
    }
    const creditRequest = await createCreditRequest({
      userId: user.userId,
      type: input.type,
      amount: input.amount,
      method: input.method,
      transactionId,
      payerMobile,
      recipientMobile,
      accountTitle: input.type === "WITHDRAWAL" ? input.accountTitle : undefined,
      paymentProof: proof?.buffer,
      paymentProofMime: proof?.mimeType,
      paymentProofSize: proof?.size,
      paymentProofSha256: proof?.sha256,
      details: { ...(input.note ? { note: input.note } : {}) },
      idempotencyKey: input.idempotencyKey,
    });
    await writeAudit({ actor: "USER", actorEmail: user.email, userId: user.userId, action: "CREDIT_REQUEST_CREATED", targetType: "CREDIT_REQUEST", targetId: creditRequest.id, details: { type: input.type, amount: input.amount, method: input.method, transactionId: transactionId ?? null }, request });
    return noStoreJson({ creditRequest, wallet: await getWalletSnapshot(user.userId) }, { status: 201 });
  } catch (error) { return handleRouteError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = await parseJson(request, cancelSchema);
    await cancelCreditRequest(user.userId, input.requestId);
    await writeAudit({ actor: "USER", actorEmail: user.email, userId: user.userId, action: "CREDIT_REQUEST_CANCELLED", targetType: "CREDIT_REQUEST", targetId: input.requestId, request });
    return noStoreJson({ ok: true, wallet: await getWalletSnapshot(user.userId) });
  } catch (error) { return handleRouteError(error); }
}
