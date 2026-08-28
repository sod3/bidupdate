import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { User } from "@/models";

const schema = z.object({
  quality: z.enum(["AUTO", "LOW", "MEDIUM", "HIGH", "ULTRA"]).optional(),
  muted: z.boolean().optional(),
  musicEnabled: z.boolean().optional(),
  sfxEnabled: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  hideFromLeaderboard: z.boolean().optional(),
}).strict();

export async function GET() {
  try {
    const session = await requireUser();
    const user = await User.findById(session.userId).select("preferences").lean();
    return noStoreJson({ preferences: user?.preferences ?? {} });
  } catch (error) { return handleRouteError(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireUser();
    const input = await parseJson(request, schema);
    const updates = Object.fromEntries(Object.entries(input).map(([key, value]) => [`preferences.${key}`, value]));
    const user = await User.findByIdAndUpdate(session.userId, { $set: updates }, { returnDocument: "after" }).select("preferences").lean();
    return noStoreJson({ preferences: user?.preferences ?? {} });
  } catch (error) { return handleRouteError(error); }
}
