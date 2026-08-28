import { handleRouteError, noStoreJson } from "@/lib/api";
import type { PipelineStage } from "mongoose";
import { requireAdmin } from "@/lib/session";
import { escapeRegex } from "@/lib/utils";
import { WalletTransaction } from "@/models";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const type = params.get("type");
    const search = params.get("search")?.trim();
    const page = Math.max(1, Number(params.get("page") || 1));
    const limit = Math.min(100, Math.max(10, Number(params.get("limit") || 50)));
    const match: Record<string, unknown> = {};
    if (type) match.type = type;
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
    ];
    if (search) pipeline.push({ $match: { $or: [
      { "user.username": { $regex: escapeRegex(search), $options: "i" } },
      { "user.email": { $regex: escapeRegex(search), $options: "i" } },
      { description: { $regex: escapeRegex(search), $options: "i" } },
      { referenceId: { $regex: escapeRegex(search), $options: "i" } },
    ] } });
    pipeline.push({ $facet: {
      items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: {
        _id: 0, id: { $toString: "$_id" }, userId: { $toString: "$userId" }, username: "$user.username", email: "$user.email",
        type: 1, amount: 1, balanceBefore: 1, balanceAfter: 1, referenceId: 1, description: 1, createdAt: 1,
      } }],
      count: [{ $count: "total" }],
    } });
    const result = await WalletTransaction.aggregate(pipeline);
    return noStoreJson({ transactions: result[0]?.items ?? [], pagination: { page, limit, total: result[0]?.count?.[0]?.total ?? 0 } });
  } catch (error) { return handleRouteError(error); }
}
