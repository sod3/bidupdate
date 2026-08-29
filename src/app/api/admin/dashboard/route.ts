import { handleRouteError, noStoreJson } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import {
  ArcheryMatch,
  ArcheryProfile,
  AuditLog,
  CreditRequest,
  PenaltyMatch,
  PenaltyProfile,
  PlayerGameStat,
  PoolMatch,
  PoolProfile,
  RaceMatch,
  RacingProfile,
  SlotSpin,
  TeenPattiRound,
  TowerMatch,
  TowerProfile,
  User,
  Wallet,
  WalletTransaction,
} from "@/models";

type Plain = Record<string, unknown> & { _id?: unknown; userId?: unknown };

function id(value: unknown) {
  if (value && typeof value === "object" && "_id" in value) return String((value as { _id: unknown })._id);
  return value ? String(value) : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function userSummary(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const user = value as { _id?: unknown; username?: string; email?: string };
  return { id: id(user._id), username: user.username ?? "Unknown", email: user.email ?? "" };
}

function profileMap(rows: Plain[]) {
  return new Map(rows.map((row) => [id(row.userId), row]));
}

function gameStatsMap(rows: Plain[]) {
  const result = new Map<string, Record<string, Plain>>();
  for (const row of rows) {
    const userId = id(row.userId);
    const gameId = String(row.gameId || "Unknown game");
    result.set(userId, { ...(result.get(userId) ?? {}), [gameId]: row });
  }
  return result;
}

function matchRow(game: string, item: Plain) {
  const playerIds = Array.isArray(item.playerIds) ? item.playerIds.map(userSummary).filter(Boolean) : [];
  const winner = userSummary(item.winnerId);
  const possibleReward = number(item.possibleReward || item.prizePool);
  return {
    id: id(item._id),
    game,
    matchId: item.matchId,
    tierId: item.tierId,
    status: item.status,
    entryCredits: number(item.entryCredits),
    possibleReward,
    winnerType: item.winnerType ?? (winner ? "PLAYER" : "AI"),
    winner,
    players: playerIds,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    durationMs: item.durationMs ?? null,
    createdAt: item.createdAt,
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startWeek = new Date(startToday);
    startWeek.setDate(startWeek.getDate() - 6);
    const startTrend = new Date(startToday);
    startTrend.setDate(startTrend.getDate() - 13);

    // A player is an authenticated account with a server-recorded game entry.
    // Profiles and leaderboard rows can exist before a real round is played, so
    // they must never be used to populate the admin player list.
    const playerUserIds = await WalletTransaction.distinct("userId", { type: "RACE_ENTRY" });

    const [
      users,
      wallets,
      financialRows,
      withdrawals,
      requestCounts,
      racingProfiles,
      penaltyProfiles,
      poolProfiles,
      towerProfiles,
      archeryProfiles,
      premiumProfiles,
      slotProfiles,
      teenPattiProfiles,
      recentTransactions,
      creditRequests,
      auditLogs,
      raceMatches,
      penaltyMatches,
      poolMatches,
      towerMatches,
      archeryMatches,
      matchCounts,
      dailyLedger,
    ] = await Promise.all([
      User.find({ _id: { $in: playerUserIds } }).sort({ createdAt: -1 }).lean(),
      Wallet.find().lean(),
      WalletTransaction.aggregate([
        {
          $group: {
            _id: "$userId",
            gameSpent: { $sum: { $cond: [{ $eq: ["$type", "RACE_ENTRY"] }, { $abs: "$amount" }, 0] } },
            gameRewards: { $sum: { $cond: [{ $eq: ["$type", "RACE_REWARD"] }, "$amount", 0] } },
            purchased: { $sum: { $cond: [{ $eq: ["$type", "TOP_UP"] }, "$amount", 0] } },
            startingCredits: { $sum: { $cond: [{ $eq: ["$type", "STARTING_BONUS"] }, "$amount", 0] } },
            adminNet: { $sum: { $cond: [{ $eq: ["$type", "ADMIN_ADJUSTMENT"] }, "$amount", 0] } },
            adminCredits: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "ADMIN_ADJUSTMENT"] }, { $gt: ["$amount", 0] }] }, "$amount", 0] } },
            adminDebits: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "ADMIN_ADJUSTMENT"] }, { $lt: ["$amount", 0] }] }, { $abs: "$amount" }, 0] } },
            transactionCount: { $sum: 1 },
            lastTransactionAt: { $max: "$createdAt" },
            lastPlayedAt: { $max: { $cond: [{ $in: ["$type", ["RACE_ENTRY", "RACE_REWARD"]] }, "$createdAt", null] } },
          },
        },
      ]),
      CreditRequest.aggregate([
        { $match: { type: "WITHDRAWAL", status: "APPROVED" } },
        { $group: { _id: "$userId", withdrawn: { $sum: "$amount" }, withdrawals: { $sum: 1 }, lastWithdrawalAt: { $max: "$reviewedAt" } } },
      ]),
      CreditRequest.aggregate([{ $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 }, amount: { $sum: "$amount" } } }]),
      RacingProfile.find({ userId: { $in: playerUserIds } }).lean(),
      PenaltyProfile.find({ userId: { $in: playerUserIds } }).lean(),
      PoolProfile.find({ userId: { $in: playerUserIds } }).lean(),
      TowerProfile.find({ userId: { $in: playerUserIds } }).lean(),
      ArcheryProfile.find({ userId: { $in: playerUserIds } }).lean(),
      PlayerGameStat.find({ userId: { $in: playerUserIds }, rounds: { $gt: 0 } }).lean(),
      SlotSpin.aggregate([
        { $match: { userId: { $in: playerUserIds } } },
        {
          $group: {
            _id: "$userId",
            rounds: { $sum: 1 },
            wins: { $sum: { $cond: [{ $in: ["$result", ["WIN", "JACKPOT"]] }, 1, 0] } },
            losses: { $sum: { $cond: [{ $eq: ["$result", "LOSS"] }, 1, 0] } },
            lastPlayedAt: { $max: "$completedAt" },
          },
        },
      ]),
      TeenPattiRound.aggregate([
        { $match: { userId: { $in: playerUserIds }, status: "COMPLETED" } },
        {
          $group: {
            _id: "$userId",
            rounds: { $sum: 1 },
            wins: { $sum: { $cond: [{ $eq: ["$winner.id", "PLAYER"] }, 1, 0] } },
            losses: { $sum: { $cond: [{ $ne: ["$winner.id", "PLAYER"] }, 1, 0] } },
            lastPlayedAt: { $max: "$completedAt" },
          },
        },
      ]),
      WalletTransaction.find().sort({ createdAt: -1 }).limit(250).populate("userId", "username email").lean(),
      CreditRequest.find()
        .select("+details +payerMobile +recipientMobile +accountTitle +paymentProofSize +payoutProofSize")
        .sort({ createdAt: -1 })
        .limit(250)
        .populate("userId", "username email")
        .lean(),
      AuditLog.find().sort({ createdAt: -1 }).limit(250).lean(),
      RaceMatch.find().sort({ createdAt: -1 }).limit(60).populate("playerIds winnerId", "username email").lean(),
      PenaltyMatch.find().sort({ createdAt: -1 }).limit(60).populate("playerIds winnerId", "username email").lean(),
      PoolMatch.find().sort({ createdAt: -1 }).limit(60).populate("playerIds winnerId", "username email").lean(),
      TowerMatch.find().sort({ createdAt: -1 }).limit(60).populate("playerIds winnerId", "username email").lean(),
      ArcheryMatch.find().sort({ createdAt: -1 }).limit(60).populate("playerIds winnerId", "username email").lean(),
      Promise.all([
        RaceMatch.countDocuments(), PenaltyMatch.countDocuments(), PoolMatch.countDocuments(), TowerMatch.countDocuments(), ArcheryMatch.countDocuments(),
        RaceMatch.countDocuments({ status: "COMPLETED" }), PenaltyMatch.countDocuments({ status: "COMPLETED" }), PoolMatch.countDocuments({ status: "COMPLETED" }), TowerMatch.countDocuments({ status: "COMPLETED" }), ArcheryMatch.countDocuments({ status: "COMPLETED" }),
      ]),
      WalletTransaction.aggregate([
        { $match: { createdAt: { $gte: startTrend } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            entries: { $sum: { $cond: [{ $eq: ["$type", "RACE_ENTRY"] }, { $abs: "$amount" }, 0] } },
            rewards: { $sum: { $cond: [{ $eq: ["$type", "RACE_REWARD"] }, "$amount", 0] } },
            topUps: { $sum: { $cond: [{ $eq: ["$type", "TOP_UP"] }, "$amount", 0] } },
            adjustments: { $sum: { $cond: [{ $eq: ["$type", "ADMIN_ADJUSTMENT"] }, "$amount", 0] } },
            transactions: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const walletByUser = new Map(wallets.map((wallet) => [id(wallet.userId), wallet]));
    const financeByUser = new Map(financialRows.map((row) => [id(row._id), row]));
    const withdrawalsByUser = new Map(withdrawals.map((row) => [id(row._id), row]));
    const racingByUser = profileMap(racingProfiles as unknown as Plain[]);
    const penaltyByUser = profileMap(penaltyProfiles as unknown as Plain[]);
    const poolByUser = profileMap(poolProfiles as unknown as Plain[]);
    const towerByUser = profileMap(towerProfiles as unknown as Plain[]);
    const archeryByUser = profileMap(archeryProfiles as unknown as Plain[]);
    const premiumByUser = gameStatsMap((premiumProfiles as unknown as Plain[]).map((profile) => ({ ...profile, userId: profile.userId })));
    const slotsByUser = profileMap((slotProfiles as unknown as Plain[]).map((profile) => ({ ...profile, userId: profile._id })));
    const teenPattiByUser = profileMap((teenPattiProfiles as unknown as Plain[]).map((profile) => ({ ...profile, userId: profile._id })));

    const userRows = users.map((user) => {
      const userId = id(user._id);
      const wallet = walletByUser.get(userId);
      const finance = financeByUser.get(userId);
      const cashOut = withdrawalsByUser.get(userId);
      const games = {
        racing: racingByUser.get(userId),
        penalty: penaltyByUser.get(userId),
        pool: poolByUser.get(userId),
        tower: towerByUser.get(userId),
        archery: archeryByUser.get(userId),
        "777 slots": slotsByUser.get(userId),
        "teen patti": teenPattiByUser.get(userId),
        ...(premiumByUser.get(userId) ?? {}),
      };
      const profiles = Object.values(games).filter(Boolean) as Plain[];
      const totalWins = profiles.reduce((sum, profile) => sum + number(profile.wins), 0);
      const totalLosses = profiles.reduce((sum, profile) => sum + number(profile.losses), 0);
      const gameSpent = number(finance?.gameSpent ?? wallet?.totalWagered);
      const gameRewards = number(finance?.gameRewards ?? wallet?.totalWon);
      const profitLoss = gameRewards - gameSpent;
      return {
        id: userId,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        country: user.country,
        dateOfBirth: user.dateOfBirth,
        status: user.status,
        createdAt: user.createdAt,
        // Registration creates an authenticated session too. Older accounts did
        // not persist that first sign-in timestamp, so creation is the truthful
        // fallback for a player who already has verified gameplay.
        lastLoginAt: user.lastLoginAt ?? user.createdAt,
        lastPlayedAt: finance?.lastPlayedAt ?? finance?.lastTransactionAt ?? null,
        responsiblePlay: user.responsiblePlay,
        balance: number(wallet?.balance),
        reservedBalance: number(wallet?.reservedBalance),
        gameSpent,
        gameRewards,
        profitLoss,
        netProfit: Math.max(0, profitLoss),
        netLoss: Math.max(0, -profitLoss),
        purchased: number(finance?.purchased),
        withdrawn: number(cashOut?.withdrawn),
        netFunding: number(finance?.purchased) - number(cashOut?.withdrawn),
        startingCredits: number(finance?.startingCredits),
        adminNet: number(finance?.adminNet),
        adminCredits: number(finance?.adminCredits),
        adminDebits: number(finance?.adminDebits),
        transactionCount: number(finance?.transactionCount),
        lastTransactionAt: finance?.lastTransactionAt ?? null,
        totalWins,
        totalLosses,
        winRate: totalWins + totalLosses ? Math.round(totalWins / (totalWins + totalLosses) * 100) : 0,
        games: Object.fromEntries(Object.entries(games).map(([game, profile]) => [game, profile ? { rounds: number(profile.rounds) || number(profile.wins) + number(profile.losses), wins: number(profile.wins), losses: number(profile.losses), rank: profile.rank, rankPoints: number(profile.rankPoints), xp: number(profile.xp), lastPlayedAt: profile.lastPlayedAt ?? null } : null])),
      };
    });

    const requestSummary = new Map(requestCounts.map((row) => [`${row._id.type}:${row._id.status}`, row]));
    const totalBalance = wallets.reduce((sum, wallet) => sum + number(wallet.balance), 0);
    const totalReserved = wallets.reduce((sum, wallet) => sum + number(wallet.reservedBalance), 0);
    const totalWagered = userRows.reduce((sum, user) => sum + user.gameSpent, 0);
    const totalWon = userRows.reduce((sum, user) => sum + user.gameRewards, 0);
    const purchased = financialRows.reduce((sum, row) => sum + number(row.purchased), 0);
    const withdrawn = withdrawals.reduce((sum, row) => sum + number(row.withdrawn), 0);
    const adminNet = financialRows.reduce((sum, row) => sum + number(row.adminNet), 0);
    const totalMatches = matchCounts.slice(0, 5).reduce((sum, count) => sum + count, 0);
    const completedMatches = matchCounts.slice(5).reduce((sum, count) => sum + count, 0);
    const recentMatches = [
      ...raceMatches.map((item) => matchRow("Neon Drift", item as unknown as Plain)),
      ...penaltyMatches.map((item) => matchRow("Penalty Kings", item as unknown as Plain)),
      ...poolMatches.map((item) => matchRow("8 Ball", item as unknown as Plain)),
      ...towerMatches.map((item) => matchRow("Tower Clash", item as unknown as Plain)),
      ...archeryMatches.map((item) => matchRow("Precision Arena", item as unknown as Plain)),
    ].sort((left, right) => new Date(String(right.createdAt)).getTime() - new Date(String(left.createdAt)).getTime()).slice(0, 200);

    const requests = creditRequests.map((request) => ({
      id: id(request._id), reference: request.reference, type: request.type, amount: request.amount, method: request.method,
      transactionId: request.transactionId, payerMobile: request.payerMobile, recipientMobile: request.recipientMobile,
      accountTitle: request.accountTitle, hasPaymentProof: number(request.paymentProofSize) > 0,
      payoutTransactionId: request.payoutTransactionId, hasPayoutProof: number(request.payoutProofSize) > 0,
      details: request.details ?? {}, verification: request.verification, status: request.status, reviewedBy: request.reviewedBy, reviewNote: request.reviewNote,
      reviewedAt: request.reviewedAt, createdAt: request.createdAt, updatedAt: request.updatedAt, user: userSummary(request.userId),
    }));

    return noStoreJson({
      generatedAt: now,
      overview: {
        users: users.length,
        activeUsers: users.filter((user) => user.status === "ACTIVE").length,
        suspendedUsers: users.filter((user) => user.status === "SUSPENDED").length,
        newToday: users.filter((user) => new Date(user.createdAt).getTime() >= startToday.getTime()).length,
        newThisWeek: users.filter((user) => new Date(user.createdAt).getTime() >= startWeek.getTime()).length,
        totalBalance,
        totalReserved,
        walletLiability: totalBalance + totalReserved,
        totalWagered,
        totalWon,
        playerProfitLoss: totalWon - totalWagered,
        gamingNet: totalWagered - totalWon,
        purchased,
        withdrawn,
        netFunding: purchased - withdrawn,
        adminNet,
        totalMatches,
        completedMatches,
        completionRate: totalMatches ? Math.round(completedMatches / totalMatches * 100) : 0,
        pendingTopUps: number(requestSummary.get("TOP_UP:PENDING")?.amount),
        pendingWithdrawals: number(requestSummary.get("WITHDRAWAL:PENDING")?.amount),
        pendingRequests: number(requestSummary.get("TOP_UP:PENDING")?.count) + number(requestSummary.get("WITHDRAWAL:PENDING")?.count),
      },
      users: userRows.sort((left, right) => right.gameSpent - left.gameSpent),
      transactions: recentTransactions.map((transaction) => ({
        id: id(transaction._id), user: userSummary(transaction.userId), type: transaction.type, amount: transaction.amount,
        balanceBefore: transaction.balanceBefore, balanceAfter: transaction.balanceAfter, referenceId: transaction.referenceId,
        description: transaction.description, metadata: transaction.metadata, createdAt: transaction.createdAt,
      })),
      requests,
      matches: recentMatches,
      gameTotals: [
        { game: "Neon Drift", matches: matchCounts[0], completed: matchCounts[5] },
        { game: "Penalty Kings", matches: matchCounts[1], completed: matchCounts[6] },
        { game: "8 Ball", matches: matchCounts[2], completed: matchCounts[7] },
        { game: "Tower Clash", matches: matchCounts[3], completed: matchCounts[8] },
        { game: "Precision Arena", matches: matchCounts[4], completed: matchCounts[9] },
      ],
      dailyLedger: dailyLedger.map((row) => ({ date: row._id, entries: row.entries, rewards: row.rewards, gamingNet: row.entries - row.rewards, topUps: row.topUps, adjustments: row.adjustments, transactions: row.transactions })),
      audit: auditLogs.map((log) => ({ id: id(log._id), actor: log.actor, actorEmail: log.actorEmail, userId: id(log.userId), action: log.action, targetType: log.targetType, targetId: log.targetId, details: log.details, createdAt: log.createdAt })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
