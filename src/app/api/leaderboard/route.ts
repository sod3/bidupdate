import { handleRouteError, noStoreJson } from "@/lib/api";
import { RacingProfile, Wallet } from "@/models";
import { ensurePlatformData } from "@/services/bootstrapService";
import { getLiveBotLeaders, mergeLeaderboardEntries, type LeaderboardEntry } from "@/services/leaderboardService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensurePlatformData();
    const [profiles, bots] = await Promise.all([
      RacingProfile.find({ wins: { $gt: 0 } }).sort({ rankPoints: -1, wins: -1, bestTimeMs: 1 }).limit(100).populate("userId", "username status preferences.hideFromLeaderboard").lean(),
      getLiveBotLeaders("RACING"),
    ]);
    const wallets = await Wallet.find({ userId: { $in: profiles.map((profile) => (profile.userId as unknown as { _id?: unknown })?._id).filter(Boolean) } }).select("userId balance").lean();
    const balances = new Map(wallets.map((wallet) => [String(wallet.userId), wallet.balance]));
    const real = profiles
      .filter((profile) => {
        const user = profile.userId as unknown as { status?: string; preferences?: { hideFromLeaderboard?: boolean } };
        return user?.status === "ACTIVE" && !user.preferences?.hideFromLeaderboard;
      })
      .map<LeaderboardEntry>((profile) => {
        const user = profile.userId as unknown as { _id: unknown; username: string };
        const races = profile.wins + profile.losses;
        return { userId: String(user._id), username: user.username, wins: profile.wins, losses: profile.losses, winRate: races ? Math.round(profile.wins / races * 100) : 0, bestTimeMs: profile.bestTimeMs, rankName: profile.rank, rankPoints: profile.rankPoints, xp: profile.xp, winStreak: profile.winStreak, balance: balances.get(String(user._id)) ?? 0, isBot: false };
      });
    return noStoreJson({ leaders: mergeLeaderboardEntries(real, bots), refreshSeconds: 30 });
  } catch (error) { return handleRouteError(error); }
}
