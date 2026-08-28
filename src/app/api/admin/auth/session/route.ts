import { handleRouteError, noStoreJson } from "@/lib/api";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  try {
    const admin = await requireAdmin();
    return noStoreJson({ authenticated: true, admin: { email: admin.email } });
  } catch (error) { return handleRouteError(error); }
}
