import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson, ApiError } from "@/lib/api";
import { enforceRateLimit, hashIdentifier, requestFingerprint } from "@/lib/rateLimit";
import { createAdminSession, secureStringEqual } from "@/lib/session";
import { writeAudit } from "@/services/auditService";

const schema = z.object({ email: z.string().trim().email().max(120), password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, schema);
    const email = input.email.toLowerCase();
    await enforceRateLimit(`admin-login:${requestFingerprint(request)}:${hashIdentifier(email)}`, 5, 30 * 60 * 1000);
    const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const expectedPassword = process.env.ADMIN_PASSWORD;
    if (!expectedEmail || !expectedPassword) throw new ApiError("Administrator access is not configured.", 503, "ADMIN_NOT_CONFIGURED");
    if (!secureStringEqual(email, expectedEmail) || !secureStringEqual(input.password, expectedPassword)) {
      throw new ApiError("Invalid administrator credentials.", 401, "INVALID_ADMIN_CREDENTIALS");
    }
    await createAdminSession(expectedEmail, request);
    await writeAudit({ actor: "ADMIN", actorEmail: expectedEmail, action: "ADMIN_LOGIN", targetType: "SESSION", request });
    return noStoreJson({ authenticated: true, expiresInSeconds: 8 * 60 * 60 });
  } catch (error) { return handleRouteError(error); }
}
