import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { connectDB } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { AuthSession, User } from "@/models";
import { requestFingerprint } from "@/lib/rateLimit";

export const USER_SESSION_COOKIE = "neon_drift_session";
export const ADMIN_SESSION_COOKIE = "neon_drift_admin_session";
export const ADMIN_GUARD_COOKIE = "neon_drift_admin_guard";

const USER_TTL_SECONDS = 60 * 60 * 24 * 7;
const ADMIN_TTL_SECONDS = 60 * 60 * 8;

function sessionSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret);
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function secureStringEqual(candidate: string, expected: string) {
  const left = createHash("sha256").update(candidate).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function createUserSession(user: { id: string; email: string }, request: Request) {
  await connectDB();
  const token = randomBytes(48).toString("base64url");
  await AuthSession.create({
    tokenHash: digest(token),
    kind: "USER",
    userId: user.id,
    email: user.email,
    expiresAt: new Date(Date.now() + USER_TTL_SECONDS * 1000),
    fingerprintHash: requestFingerprint(request),
  });
  const store = await cookies();
  store.set(USER_SESSION_COOKIE, token, cookieOptions(USER_TTL_SECONDS));
}

export async function createAdminSession(email: string, request: Request) {
  await connectDB();
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_TTL_SECONDS * 1000);
  await AuthSession.updateMany({ kind: "ADMIN", revokedAt: null }, { $set: { revokedAt: new Date() } });
  const session = await AuthSession.create({
    tokenHash: digest(token),
    kind: "ADMIN",
    email,
    expiresAt,
    fingerprintHash: requestFingerprint(request),
  });
  const guard = await new SignJWT({ kind: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("neon-drift")
    .setAudience("neon-drift-admin")
    .setSubject(session.id)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TTL_SECONDS}s`)
    .sign(sessionSecret());
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, cookieOptions(ADMIN_TTL_SECONDS));
  store.set(ADMIN_GUARD_COOKIE, guard, cookieOptions(ADMIN_TTL_SECONDS));
}

async function readSession(kind: "USER" | "ADMIN") {
  // Read the HttpOnly cookie before opening MongoDB. Guests have no session
  // token, so this avoids a database cold-start on the public homepage.
  const store = await cookies();
  const name = kind === "USER" ? USER_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
  const token = store.get(name)?.value;
  if (!token) return null;
  await connectDB();
  const session = await AuthSession.findOne({
    tokenHash: digest(token),
    kind,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select("userId email expiresAt").lean();
  if (!session) return null;
  void AuthSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch(() => undefined);
  return session;
}

export async function getCurrentUserSessionIdentity() {
  const session = await readSession("USER");
  if (!session?.userId) return null;
  return { userId: String(session.userId), email: session.email };
}

export async function getActiveUserProfile(userId: string) {
  const user = await User.findOne({ _id: userId, status: "ACTIVE" })
    .select("username email fullName status responsiblePlay")
    .lean();
  if (!user) return null;
  return {
    userId: String(user._id),
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    responsiblePlay: user.responsiblePlay,
  };
}

export async function getCurrentUser() {
  const session = await getCurrentUserSessionIdentity();
  if (!session) return null;
  return getActiveUserProfile(session.userId);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("Log in to continue.", 401, "AUTH_REQUIRED");
  return user;
}

export async function getAdminSession() {
  const session = await readSession("ADMIN");
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!session || !configuredEmail || session.email !== configuredEmail) return null;
  return { sessionId: String(session._id), email: session.email };
}

export async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) throw new ApiError("Administrator authentication is required.", 401, "ADMIN_AUTH_REQUIRED");
  return admin;
}

export async function destroySession(kind: "USER" | "ADMIN") {
  await connectDB();
  const store = await cookies();
  const name = kind === "USER" ? USER_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
  const token = store.get(name)?.value;
  if (token) await AuthSession.updateOne({ tokenHash: digest(token), kind }, { $set: { revokedAt: new Date() } });
  store.set(name, "", { ...cookieOptions(0), maxAge: 0 });
  if (kind === "ADMIN") store.set(ADMIN_GUARD_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}
