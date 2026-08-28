import { describe, expect, it } from "vitest";
import {
  normalizePakistanMobile,
  normalizeTransactionId,
  PAYMENT_RECEIVER_NUMBER,
  readPaymentProof,
} from "@/lib/paymentVerification";

describe("manual payment verification", () => {
  it("normalizes Pakistani mobile account formats", () => {
    expect(normalizePakistanMobile("0324 7964287")).toBe("03247964287");
    expect(normalizePakistanMobile("+92 324 7964287")).toBe("03247964287");
    expect(() => normalizePakistanMobile("1234")).toThrow(/valid Pakistani mobile number/i);
    expect(PAYMENT_RECEIVER_NUMBER).toBe("03247964287");
  });

  it("normalizes transaction IDs without weakening validation", () => {
    expect(normalizeTransactionId(" txn-12 3456 ")).toBe("TXN-123456");
    expect(() => normalizeTransactionId("123")).toThrow(/complete 6/i);
    expect(() => normalizeTransactionId("TXN/123456")).toThrow(/transaction ID/i);
  });

  it("accepts real image signatures and rejects spoofed uploads", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "receipt.png", { type: "image/png" });
    const proof = await readPaymentProof(png);
    expect(proof.mimeType).toBe("image/png");
    expect(proof.size).toBe(9);
    expect(proof.sha256).toMatch(/^[a-f0-9]{64}$/);

    const spoofed = new File(["not an image"], "receipt.png", { type: "image/png" });
    await expect(readPaymentProof(spoofed)).rejects.toThrow(/not a valid receipt image/i);
  });
});
