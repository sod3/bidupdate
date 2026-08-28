import { z } from "zod";
import { assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { SiteSetting } from "@/models";
import { ensurePlatformData } from "@/services/bootstrapService";
import { writeAudit } from "@/services/auditService";

const schema = z.object({
  settings: z.array(z.object({
    key: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9._-]+$/),
    value: z.unknown(),
    description: z.string().trim().max(240).nullable().optional(),
    isPublic: z.boolean(),
  })).min(1).max(100),
});

export async function GET() {
  try {
    await requireAdmin();
    await ensurePlatformData();
    const settings = await SiteSetting.find().sort({ key: 1 }).lean();
    return noStoreJson({ settings: settings.map((item) => ({ id: String(item._id), key: item.key, value: item.value, description: item.description, isPublic: item.isPublic })) });
  } catch (error) { return handleRouteError(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const input = await parseJson(request, schema);
    await SiteSetting.bulkWrite(input.settings.map((item) => ({
      updateOne: { filter: { key: item.key }, update: { $set: item }, upsert: true },
    })));
    await writeAudit({ actor: "ADMIN", actorEmail: admin.email, action: "SITE_SETTINGS_UPDATED", targetType: "SITE_SETTING", details: { keys: input.settings.map((item) => item.key) }, request });
    return noStoreJson({ ok: true });
  } catch (error) { return handleRouteError(error); }
}
