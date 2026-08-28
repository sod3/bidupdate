import { handleRouteError, noStoreJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getReferralDashboard } from "@/services/referralService";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    return noStoreJson({ referral: await getReferralDashboard(user.userId, origin) });
  } catch (error) {
    return handleRouteError(error);
  }
}
