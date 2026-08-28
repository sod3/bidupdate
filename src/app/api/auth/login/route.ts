import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { enforceRateLimit, hashIdentifier, requestFingerprint } from "@/lib/rateLimit";
import { createUserSession } from "@/lib/session";
import { User } from "@/models";
import { writeAudit } from "@/services/auditService";
import { finalizeAccountIncentives, type IncentiveResult } from "@/services/referralService";

const schema = z.object({
  emailOrUsername: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(128),
});

function duplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, schema);
    const identity = input.emailOrUsername.toLowerCase();
    await enforceRateLimit(`login:${requestFingerprint(request)}:${hashIdentifier(identity)}`, 8, 15 * 60 * 1000);
    const database = await connectDB();
    const user = await User.findOne({
      $or: [{ email: identity }, { username: input.emailOrUsername }],
    }).select("+passwordHash");
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return noStoreJson({ error: "The credentials do not match an account." }, { status: 401 });
    }
    if (user.status !== "ACTIVE") {
      return noStoreJson({ error: "This account is currently suspended." }, { status: 403 });
    }
    user.lastLoginAt = new Date();
    await user.save();
    let incentives: IncentiveResult = { welcomeAwarded: false, referralRewarded: false };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await database.connection.transaction(async (dbSession) => {
          incentives = await finalizeAccountIncentives(user.id, dbSession);
        });
        break;
      } catch (error) {
        if (attempt === 0 && duplicateKey(error)) continue;
        throw error;
      }
    }
    await createUserSession({ id: user.id, email: user.email }, request);
    await writeAudit({ actor: "USER", actorEmail: user.email, userId: user.id, action: "USER_LOGIN", targetType: "SESSION", request });
    return noStoreJson({
      user: { username: user.username, email: user.email, fullName: user.fullName, role: "USER" },
      incentives,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
