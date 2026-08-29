import { handleRouteError, noStoreJson } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { escapeRegex } from "@/lib/utils";
import { User, Wallet, WalletTransaction } from "@/models";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim();
    const status = params.get("status");
    const page = Math.max(1, Number(params.get("page") || 1));
    const limit = Math.min(100, Math.max(10, Number(params.get("limit") || 30)));
    const playerUserIds = await WalletTransaction.distinct("userId", { type: "RACE_ENTRY" });
    const filter: Record<string, unknown> = { _id: { $in: playerUserIds } };
    if (search) filter.$or = [
      { username: { $regex: escapeRegex(search), $options: "i" } },
      { email: { $regex: escapeRegex(search), $options: "i" } },
      { fullName: { $regex: escapeRegex(search), $options: "i" } },
    ];
    if (status && ["ACTIVE", "SUSPENDED"].includes(status)) filter.status = status;
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    const userIds = users.map((item) => item._id);
    const [wallets, financialRows] = await Promise.all([
      Wallet.find({ userId: { $in: userIds } }).lean(),
      WalletTransaction.aggregate([
        { $match: { userId: { $in: userIds } } },
        {
          $group: {
            _id: "$userId",
            earnings: { $sum: { $cond: [{ $eq: ["$type", "RACE_REWARD"] }, "$amount", 0] } },
            wagered: { $sum: { $cond: [{ $eq: ["$type", "RACE_ENTRY"] }, { $abs: "$amount" }, 0] } },
            lastPlayedAt: { $max: { $cond: [{ $in: ["$type", ["RACE_ENTRY", "RACE_REWARD"]] }, "$createdAt", null] } },
          },
        },
      ]),
    ]);
    const balances = new Map(wallets.map((item) => [String(item.userId), item]));
    const financials = new Map(financialRows.map((item) => [String(item._id), item]));
    return noStoreJson({
      users: users.map((item) => ({
        id: String(item._id), username: item.username, fullName: item.fullName, email: item.email, country: item.country,
        status: item.status, createdAt: item.createdAt, lastLoginAt: item.lastLoginAt ?? item.createdAt,
        balance: balances.get(String(item._id))?.balance ?? 0,
        reservedBalance: balances.get(String(item._id))?.reservedBalance ?? 0,
        earnings: financials.get(String(item._id))?.earnings ?? 0,
        wagered: financials.get(String(item._id))?.wagered ?? 0,
        profitLoss: (financials.get(String(item._id))?.earnings ?? 0) - (financials.get(String(item._id))?.wagered ?? 0),
        lastPlayedAt: financials.get(String(item._id))?.lastPlayedAt ?? null,
      })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) { return handleRouteError(error); }
}
