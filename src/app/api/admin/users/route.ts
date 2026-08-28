import { handleRouteError, noStoreJson } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { escapeRegex } from "@/lib/utils";
import { User, Wallet } from "@/models";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim();
    const status = params.get("status");
    const page = Math.max(1, Number(params.get("page") || 1));
    const limit = Math.min(100, Math.max(10, Number(params.get("limit") || 30)));
    const filter: Record<string, unknown> = {};
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
    const wallets = await Wallet.find({ userId: { $in: users.map((item) => item._id) } }).lean();
    const balances = new Map(wallets.map((item) => [String(item.userId), item]));
    return noStoreJson({
      users: users.map((item) => ({
        id: String(item._id), username: item.username, fullName: item.fullName, email: item.email, country: item.country,
        status: item.status, createdAt: item.createdAt, lastLoginAt: item.lastLoginAt,
        balance: balances.get(String(item._id))?.balance ?? 0,
        reservedBalance: balances.get(String(item._id))?.reservedBalance ?? 0,
      })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) { return handleRouteError(error); }
}
