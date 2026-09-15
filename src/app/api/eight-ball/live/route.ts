import { timingSafeEqual } from "node:crypto";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { poolCommand, poolView, tickPool } from "@/lib/eight-ball/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const input = await request.json() as Record<string, unknown>;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError("Invalid table command.");
    const expected = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET || "";
    const received = request.headers.get("x-pool-server-secret") || "";
    const expectedBytes=Buffer.from(expected),receivedBytes=Buffer.from(received);
    const trusted = expected.length >= 32 && receivedBytes.length === expectedBytes.length && timingSafeEqual(expectedBytes,receivedBytes);
    if (trusted) {
      if (input.action === "TICK") {
        const ids = Array.isArray(input.users) ? input.users.filter((id): id is string => typeof id === "string") : [];
        if (input.heartbeat) for (const id of ids) await poolCommand(id, { action: "STATUS" });
        await tickPool();
        const views = [];
        for (const id of ids) views.push(await poolView(id));
        return noStoreJson({ views });
      }
      if (typeof input.userId !== "string") throw new ApiError("Missing player identity.");
      return noStoreJson(await poolCommand(input.userId, input));
    }
    assertSameOrigin(request);
    if (!["JOIN", "STATUS", "SHOT", "PLACE", "LEAVE", "CANCEL", "RESIGN"].includes(String(input.action))) throw new ApiError("Unknown table command.");
    const user = await requireUser();
    await tickPool();
    return noStoreJson(await poolCommand(user.userId, input));
  } catch (error) { return handleRouteError(error); }
}
