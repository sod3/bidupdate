import { createHash } from "node:crypto";
import { connectDB } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { RateLimit } from "@/models";

export function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  return createHash("sha256").update(`${forwarded}|${agent}`).digest("hex");
}

export function hashIdentifier(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export async function enforceRateLimit(key: string, limit: number, windowMs: number) {
  await connectDB();
  const now = new Date();
  let record = await RateLimit.findOneAndUpdate(
    { key, resetAt: { $gt: now } },
    { $inc: { count: 1 } },
    { returnDocument: "after" },
  ).lean();

  if (!record) {
    try {
      record = await RateLimit.findOneAndUpdate(
        { key },
        { $set: { count: 1, resetAt: new Date(Date.now() + windowMs) } },
        { returnDocument: "after", upsert: true },
      ).lean();
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) {
        record = await RateLimit.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { returnDocument: "after" }).lean();
      } else {
        throw error;
      }
    }
  }

  if (record && record.count > limit) {
    throw new ApiError("Too many requests. Please wait and try again.", 429, "RATE_LIMITED");
  }
}
