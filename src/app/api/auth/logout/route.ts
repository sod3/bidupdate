import { assertSameOrigin, handleRouteError, noStoreJson } from "@/lib/api";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroySession("USER");
    return noStoreJson({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
