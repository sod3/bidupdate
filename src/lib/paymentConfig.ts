export const PAYMENT_RECEIVER_NUMBER = "03247964287";
export const PAYMENT_METHODS = ["JAZZCASH", "EASYPAISA"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MAX_PAYMENT_PROOF_BYTES = 4 * 1024 * 1024;
export const PAYMENT_PROOF_ACCEPT = "image/jpeg,image/png,image/webp";
