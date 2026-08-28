import { ApiError, handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { CreditRequest } from "@/models";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new ApiError("Payment request not found.", 404, "REQUEST_NOT_FOUND");
    const item = await CreditRequest.findById(id)
      .select("+paymentProof +paymentProofMime +payoutProof +payoutProofMime")
      .lean();
    if (!item) throw new ApiError("Payment request not found.", 404, "REQUEST_NOT_FOUND");
    const payout = new URL(request.url).searchParams.get("kind") === "payout";
    const raw = payout ? item.payoutProof : item.paymentProof;
    const mimeType = payout ? item.payoutProofMime : item.paymentProofMime;
    if (!raw || !mimeType) throw new ApiError("Receipt proof is not available.", 404, "PROOF_NOT_FOUND");
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${payout ? "payout" : "deposit"}-${item.reference}.${mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg"}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
