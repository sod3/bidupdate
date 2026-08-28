import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api";
import { MAX_PAYMENT_PROOF_BYTES } from "@/lib/paymentConfig";

export { PAYMENT_RECEIVER_NUMBER } from "@/lib/paymentConfig";

type PaymentProofMime = "image/jpeg" | "image/png" | "image/webp";

const proofSignatures: Record<PaymentProofMime, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) => bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value),
  "image/webp": (bytes) => bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
};

export function normalizePakistanMobile(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (/^\+923\d{9}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^923\d{9}$/.test(compact)) return `0${compact.slice(2)}`;
  if (/^03\d{9}$/.test(compact)) return compact;
  throw new ApiError("Enter a valid Pakistani mobile number, for example 03XXXXXXXXX.", 400, "INVALID_MOBILE_NUMBER");
}

export function normalizeTransactionId(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9][A-Z0-9-]{5,79}$/.test(normalized)) {
    throw new ApiError("Enter the complete 6–80 character transaction ID from the provider receipt.", 400, "INVALID_TRANSACTION_ID");
  }
  return normalized;
}

export async function readPaymentProof(file: File | null | undefined) {
  if (!file || file.size === 0) {
    throw new ApiError("Upload a payment receipt screenshot.", 400, "PAYMENT_PROOF_REQUIRED");
  }
  if (file.size > MAX_PAYMENT_PROOF_BYTES) {
    throw new ApiError("The receipt screenshot must be 4 MB or smaller.", 413, "PAYMENT_PROOF_TOO_LARGE");
  }
  const mimeType = file.type as PaymentProofMime;
  const validator = proofSignatures[mimeType];
  if (!validator) {
    throw new ApiError("Receipt screenshots must be JPG, PNG, or WebP images.", 415, "INVALID_PAYMENT_PROOF_TYPE");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validator(bytes)) {
    throw new ApiError("The uploaded file is not a valid receipt image.", 400, "INVALID_PAYMENT_PROOF_CONTENT");
  }
  const buffer = Buffer.from(bytes);
  return {
    buffer,
    mimeType,
    size: file.size,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
