import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function normalizedEmailIdentity(email: string) {
  const normalized = email.trim().toLowerCase();
  const [local = "", rawDomain = ""] = normalized.split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  const canonicalLocal = domain === "gmail.com" ? local.split("+", 1)[0].replace(/\./g, "") : local;
  return `${canonicalLocal}@${domain}`;
}

export function emailIdentityHash(email: string) {
  return createHash("sha256").update(normalizedEmailIdentity(email)).digest("hex");
}
