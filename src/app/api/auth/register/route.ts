import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson, ApiError } from "@/lib/api";
import { emailIdentityHash, hashPassword } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { isAtLeastAge, parseIsoDateOfBirth } from "@/lib/dateOfBirth";
import { enforceRateLimit, requestFingerprint } from "@/lib/rateLimit";
import { createUserSession } from "@/lib/session";
import { User } from "@/models";
import { ensurePlatformData, getSetting } from "@/services/bootstrapService";
import { createWallet } from "@/services/walletService";
import { writeAudit } from "@/services/auditService";
import {
  createPendingReferral,
  finalizeAccountIncentives,
  findReferrerByCode,
  generateReferralCode,
  type IncentiveResult,
} from "@/services/referralService";

const schema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only."),
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(10).max(128),
  dateOfBirth: z.string().trim().refine((value) => parseIsoDateOfBirth(value) !== null, "Enter a valid date of birth."),
  country: z.string().trim().min(2).max(80),
  agreeTerms: z.literal(true),
  confirmVirtualOnly: z.literal(true),
  referralCode: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6,12}$/).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(`register:${requestFingerprint(request)}`, 5, 60 * 60 * 1000);
    const input = await parseJson(request, schema);
    const dateOfBirth = parseIsoDateOfBirth(input.dateOfBirth)!;
    if (!isAtLeastAge(dateOfBirth, 18)) throw new ApiError("You must be at least 18 years old.", 400, "AGE_RESTRICTED");
    await ensurePlatformData();
    if (!(await getSetting("registrationEnabled", true))) {
      throw new ApiError("Registration is temporarily unavailable.", 503, "REGISTRATION_DISABLED");
    }
    const database = await connectDB();
    const email = input.email.toLowerCase();
    const identityHash = emailIdentityHash(email);
    const existing = await User.exists({ $or: [{ email }, { emailIdentityHash: identityHash }, { username: input.username }] });
    if (existing) throw new ApiError("That email or username is already registered.", 409, "ACCOUNT_EXISTS");
    const referrer = input.referralCode ? await findReferrerByCode(input.referralCode) : null;
    if (input.referralCode && !referrer) throw new ApiError("That referral code is not valid.", 400, "INVALID_REFERRAL_CODE");
    const passwordHash = await hashPassword(input.password);
    const fingerprintHash = requestFingerprint(request);
    let userId = "";
    let incentives: IncentiveResult = { welcomeAwarded: false, referralRewarded: false };
    await database.connection.transaction(async (session) => {
      const [user] = await User.create([{
        username: input.username,
        fullName: input.fullName,
        email,
        emailIdentityHash: identityHash,
        passwordHash,
        dateOfBirth,
        country: input.country,
        signupFingerprintHash: fingerprintHash,
        referralCode: generateReferralCode(),
        referredByUserId: referrer?._id ?? null,
        // Registration signs the user in immediately, so it is also the first
        // successful login for admin activity reporting.
        lastLoginAt: new Date(),
      }], { session });
      userId = user.id;
      await createWallet(user.id, 0, session);
      if (referrer) {
        await createPendingReferral({
          referrerUserId: String(referrer._id),
          referredUserId: user.id,
          referralCode: String(referrer.referralCode),
        }, session);
      }
      incentives = await finalizeAccountIncentives(user.id, session);
    });
    const user = await User.findById(userId).lean();
    if (!user) throw new ApiError("Account creation could not be completed.", 500);
    await createUserSession({ id: userId, email }, request);
    await writeAudit({ actor: "USER", actorEmail: email, userId, action: "USER_REGISTERED", targetType: "USER", targetId: userId, details: { incentives }, request });
    return noStoreJson(
      {
        user: { username: user.username, email: user.email, fullName: user.fullName, role: "USER" },
        incentives,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
