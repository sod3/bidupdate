import { describe, expect, it } from "vitest";
import { emailIdentityHash, normalizedEmailIdentity } from "@/lib/auth";
import { generateReferralCode, WELCOME_BONUS_AMOUNT } from "@/services/referralService";

describe("incentive anti-abuse primitives", () => {
  it("canonicalizes common Gmail alias variants to one identity", () => {
    expect(normalizedEmailIdentity("New.User+promo@GoogleMail.com")).toBe("newuser@gmail.com");
    expect(emailIdentityHash("new.user@gmail.com")).toBe(emailIdentityHash("newuser+second@gmail.com"));
    expect(emailIdentityHash("one@example.com")).not.toBe(emailIdentityHash("two@example.com"));
  });

  it("creates non-ambiguous server referral codes", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateReferralCode()));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it("keeps the automatic welcome credit at Rs 500", () => {
    expect(WELCOME_BONUS_AMOUNT).toBe(500);
  });
});
