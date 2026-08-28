import { handleRouteError, noStoreJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getWalletSnapshot } from "@/services/walletService";

export async function GET() {
  try {
    const user = await requireUser();
    return noStoreJson({ wallet: await getWalletSnapshot(user.userId, 100) });
  } catch (error) { return handleRouteError(error); }
}
