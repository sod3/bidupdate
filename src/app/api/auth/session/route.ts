import { handleRouteError, noStoreJson } from "@/lib/api";
import { getActiveUserProfile, getCurrentUserSessionIdentity } from "@/lib/session";
import { getWalletSnapshot, getWalletSummary } from "@/services/walletService";

export async function GET(request: Request) {
  try {
    const identity = await getCurrentUserSessionIdentity();
    if (!identity) return noStoreJson({ authenticated: false, user: null, wallet: null }, { status: 200 });
    const details = new URL(request.url).searchParams.get("details") === "1";
    // Once the session token is validated, the profile and wallet are independent.
    // Fetching them together removes one full database/network round-trip from every
    // page load while preserving the existing active-user check.
    const [session, wallet] = await Promise.all([
      getActiveUserProfile(identity.userId),
      details ? getWalletSnapshot(identity.userId) : getWalletSummary(identity.userId),
    ]);
    if (!session) return noStoreJson({ authenticated: false, user: null, wallet: null }, { status: 200 });
    return noStoreJson({
      authenticated: true,
      user: {
        username: session.username,
        email: session.email,
        fullName: session.fullName,
        role: "USER",
      },
      wallet,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
