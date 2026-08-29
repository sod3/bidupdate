import { createHash, randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { premiumGame, premiumGameDefinitions, type PremiumGameId } from "@/lib/premium-games/definitions";
import { createFlightCrash, createPremiumOutcome, flightElapsedFor, flightMultiplierAt, type PremiumRoundOutcome, type RoundSelection } from "@/lib/premium-games/engine";
import { createRoundSeed, PREMIUM_RNG_VERSION } from "@/lib/premium-games/rngService";
import {
  BetSelection,
  GameBet,
  GameHistory,
  GameResult,
  GameRound,
  GameSession,
  GameSetting,
  PlayerGameStat,
  RngRound,
  Wallet,
} from "@/models";
import { applyWalletChange } from "@/services/walletService";

interface EffectiveSetting {
  gameId: PremiumGameId;
  enabled: boolean;
  maintenanceMode: boolean;
  minStake: number;
  maxStake: number;
  chipDenominations: number[];
  artwork: string;
}

function roundCredits(value: number) {
  return Math.max(0, Math.round((value + Number.EPSILON) * 100) / 100);
}

function sumStake(selections: readonly RoundSelection[]) {
  return roundCredits(selections.reduce((sum, selection) => sum + selection.amount, 0));
}

function resultHash(seed: string, outcome: PremiumRoundOutcome) {
  return createHash("sha256").update(`${seed}:${JSON.stringify(outcome)}`).digest("hex");
}

function id(value: unknown) {
  return value ? String(value) : "";
}

export async function getGameSetting(gameId: PremiumGameId): Promise<EffectiveSetting> {
  const definition = premiumGame(gameId);
  const stored = await GameSetting.findOne({ gameId }).lean();
  return {
    gameId,
    enabled: stored?.enabled ?? true,
    maintenanceMode: stored?.maintenanceMode ?? false,
    minStake: Number(stored?.minStake ?? definition.minStake),
    maxStake: Number(stored?.maxStake ?? definition.maxStake),
    chipDenominations: Array.isArray(stored?.chipDenominations) && stored.chipDenominations.length ? stored.chipDenominations.map(Number) : [...definition.chips],
    artwork: String(stored?.artwork || definition.thumbnail),
  };
}

export async function assertGameAvailable(gameId: PremiumGameId) {
  const setting = await getGameSetting(gameId);
  if (!setting.enabled) throw new ApiError("This game is currently unavailable.", 403, "GAME_DISABLED");
  if (setting.maintenanceMode) throw new ApiError("This game is being tuned. Please try again shortly.", 503, "GAME_MAINTENANCE");
  return setting;
}

export async function touchGameSession(userId: string, gameId: PremiumGameId) {
  const now = new Date();
  return GameSession.findOneAndUpdate(
    { userId, gameId, status: "ACTIVE" },
    { $set: { lastSeenAt: now }, $setOnInsert: { sessionId: `${gameId}_session_${randomUUID()}`, connectedAt: now } },
    { upsert: true, new: true },
  ).lean();
}

function serializeHistory(row: Record<string, unknown>) {
  return {
    roundId: String(row.roundId),
    result: row.result,
    label: row.label,
    stake: Number(row.stake),
    payout: Number(row.payout),
    multiplier: Number(row.multiplier),
    createdAt: row.createdAt,
  };
}

function serializeCompletedRound(row: Record<string, unknown>) {
  const outcome = (row.outcome ?? {}) as Record<string, unknown>;
  return {
    roundId: String(row.roundId),
    requestId: String(row.requestId),
    gameId: String(row.gameId),
    status: row.status,
    result: row.result,
    label: row.resultLabel,
    totalStake: Number(row.totalStake),
    payout: Number(row.payout),
    net: Number(row.net),
    balance: Number(row.balanceAfter),
    multiplier: Number(outcome.multiplier ?? (Number(row.totalStake) ? Number(row.payout) / Number(row.totalStake) : 0)),
    winningOptions: Array.isArray(outcome.winningOptions) ? outcome.winningOptions : [],
    payload: outcome.payload ?? {},
    commitment: row.rngCommitment,
    seed: row.rngSeed,
    resultHash: row.serverResultHash,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function serializeActiveFlight(row: Record<string, unknown>) {
  return {
    roundId: String(row.roundId),
    requestId: String(row.requestId),
    gameId: "flight-x",
    status: "PLAYING",
    totalStake: Number(row.totalStake),
    balance: Number(row.balanceAfter),
    commitment: row.rngCommitment,
    startedAt: row.startedAt,
    serverNow: new Date(),
  };
}

export async function getPremiumGameState(userId: string, gameId: PremiumGameId) {
  // For normal games all opening reads/writes are independent. Run them in one
  // database wave instead of waiting for setting/session work before wallet and
  // history. This is one of the hottest paths after a game card is clicked.
  if (gameId !== "flight-x") {
    const [setting, session, wallet, history] = await Promise.all([
      assertGameAvailable(gameId),
      touchGameSession(userId, gameId),
      Wallet.findOne({ userId }).select("balance").lean(),
      GameHistory.find({ userId, gameId }).select("roundId result label stake payout multiplier createdAt").sort({ createdAt: -1 }).limit(16).lean(),
    ]);
    if (!session) throw new ApiError("The game session could not be opened.", 500, "SESSION_CREATE_FAILED");
    if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
    return {
      balance: Number(wallet.balance),
      sessionId: String(session.sessionId),
      serverNow: new Date(),
      setting,
      history: history.map((row) => serializeHistory(row as unknown as Record<string, unknown>)),
      activeRound: null,
      latestRound: null,
      rngVersion: PREMIUM_RNG_VERSION,
    };
  }

  // Flight X may need to settle a timed-out active flight before the opening
  // wallet/history snapshot, so it intentionally keeps that dependency ordered.
  const [setting, session] = await Promise.all([
    assertGameAvailable(gameId),
    touchGameSession(userId, gameId),
  ]);
  if (!session) throw new ApiError("The game session could not be opened.", 500, "SESSION_CREATE_FAILED");

  const activeBeforeOpen = await GameRound.findOne({ userId, gameId, status: "PLAYING" }).select("+rngSeed +crashMultiplier").sort({ createdAt: -1 }).lean();
  if (activeBeforeOpen) await settleFlightRound(userId, String(activeBeforeOpen.roundId), false);

  const [wallet, history, active, latestRound] = await Promise.all([
    Wallet.findOne({ userId }).select("balance").lean(),
    GameHistory.find({ userId, gameId }).select("roundId result label stake payout multiplier createdAt").sort({ createdAt: -1 }).limit(16).lean(),
    GameRound.findOne({ userId, gameId, status: "PLAYING" }).sort({ createdAt: -1 }).lean(),
    GameRound.findOne({ userId, gameId, status: "COMPLETED" }).select("+rngSeed").sort({ completedAt: -1 }).lean(),
  ]);
  if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
  return {
    balance: Number(wallet.balance),
    sessionId: String(session.sessionId),
    serverNow: new Date(),
    setting,
    history: history.map((row) => serializeHistory(row as unknown as Record<string, unknown>)),
    activeRound: active ? serializeActiveFlight(active as unknown as Record<string, unknown>) : null,
    latestRound: latestRound ? serializeCompletedRound(latestRound as unknown as Record<string, unknown>) : null,
    rngVersion: PREMIUM_RNG_VERSION,
  };
}

async function createSettlementRecords(input: {
  userId: string;
  gameId: PremiumGameId;
  roundId: string;
  betId: string;
  totalStake: number;
  outcome: PremiumRoundOutcome;
  session: ClientSession;
}) {
  const { userId, gameId, roundId, betId, totalStake, outcome, session } = input;
  await GameBet.updateOne({ betId, status: "ACCEPTED" }, { $set: { status: "SETTLED", payout: outcome.payout, settledAt: new Date() } }, { session });
  await GameResult.create([{
    roundId, userId, gameId, result: outcome.result, resultLabel: outcome.label, totalStake, payout: outcome.payout,
    winningOptions: outcome.winningOptions, payload: outcome.payload, settledAt: new Date(),
  }], { session });
  await GameHistory.create([{
    roundId, userId, gameId, result: outcome.result, label: outcome.label, stake: totalStake, payout: outcome.payout,
    multiplier: outcome.multiplier,
  }], { session });
  await PlayerGameStat.updateOne(
    { userId, gameId },
    {
      $inc: {
        rounds: 1,
        wins: outcome.result === "WIN" ? 1 : 0,
        losses: outcome.result === "LOSS" ? 1 : 0,
        pushes: outcome.result === "PUSH" ? 1 : 0,
        totalStaked: totalStake,
        totalPaid: outcome.payout,
      },
      $max: { biggestWin: outcome.payout },
      $set: { lastPlayedAt: new Date() },
    },
    { upsert: true, session },
  );
}

export async function playPremiumRound(input: {
  userId: string;
  gameId: Exclude<PremiumGameId, "flight-x">;
  requestId: string;
  selections: RoundSelection[];
}) {
  const existing = await GameRound.findOne({ userId: input.userId, gameId: input.gameId, requestId: input.requestId }).select("+rngSeed").lean();
  if (existing) return { round: serializeCompletedRound(existing as unknown as Record<string, unknown>), duplicate: true };

  const database = await connectDB();
  const gameSession = await touchGameSession(input.userId, input.gameId);
  if (!gameSession) throw new ApiError("The game session could not be opened.", 500, "SESSION_CREATE_FAILED");
  const totalStake = sumStake(input.selections);
  const rng = createRoundSeed(input.gameId);
  const outcome = createPremiumOutcome(input.gameId, rng.seed, input.selections);
  const hash = resultHash(rng.seed, outcome);
  const betId = `${input.gameId}_bet_${randomUUID()}`;

  await database.connection.transaction(async (session) => {
    const concurrent = await GameRound.findOne({ userId: input.userId, gameId: input.gameId, requestId: input.requestId }).session(session).lean();
    if (concurrent) return;

    const debit = await applyWalletChange({
      userId: input.userId,
      amount: -totalStake,
      type: "RACE_ENTRY",
      description: `${premiumGame(input.gameId).title} wager`,
      referenceId: rng.roundId,
      idempotencyKey: `premium:${input.userId}:${input.gameId}:${input.requestId}:stake`,
      metadata: { game: input.gameId, roundId: rng.roundId, selections: input.selections, serverVerified: true },
    }, session);
    let balanceAfter = Number(debit.wallet.balance);

    if (outcome.payout > 0) {
      const reward = await applyWalletChange({
        userId: input.userId,
        amount: outcome.payout,
        type: "RACE_REWARD",
        description: `${premiumGame(input.gameId).title} ${outcome.label}`,
        referenceId: rng.roundId,
        idempotencyKey: `premium:${input.userId}:${input.gameId}:${input.requestId}:payout`,
        metadata: { game: input.gameId, roundId: rng.roundId, multiplier: outcome.multiplier, result: outcome.result, serverVerified: true },
      }, session);
      balanceAfter = Number(reward.wallet.balance);
    }

    await GameRound.create([{
      roundId: rng.roundId, requestId: input.requestId,
      idempotencyKey: `premium:${input.userId}:${input.gameId}:${input.requestId}`,
      userId: input.userId, gameId: input.gameId, sessionId: gameSession.sessionId,
      status: "COMPLETED", phase: "RESULT", totalStake, payout: outcome.payout, net: outcome.payout - totalStake, result: outcome.result,
      resultLabel: outcome.label, selections: input.selections, outcome, rngVersion: PREMIUM_RNG_VERSION, rngCommitment: rng.commitment,
      rngSeed: rng.seed, serverResultHash: hash, balanceAfter, startedAt: new Date(), completedAt: new Date(),
    }], { session });
    await GameBet.create([{
      betId, roundId: rng.roundId, userId: input.userId, gameId: input.gameId, amount: totalStake, status: "ACCEPTED",
      idempotencyKey: `premium:${input.userId}:${input.gameId}:${input.requestId}:bet`,
    }], { session });
    await BetSelection.insertMany(input.selections.map((selection) => ({ betId, roundId: rng.roundId, userId: input.userId, gameId: input.gameId, selectionId: selection.id, amount: selection.amount })), { session });
    await RngRound.create([{
      roundId: rng.roundId, gameId: input.gameId, userId: input.userId, version: PREMIUM_RNG_VERSION, commitment: rng.commitment,
      seed: rng.seed, resultHash: hash, revealedAt: new Date(),
    }], { session });
    await GameSession.updateOne({ sessionId: gameSession.sessionId }, { $set: { activeRoundId: null, lastSeenAt: new Date() } }, { session });
    await createSettlementRecords({ userId: input.userId, gameId: input.gameId, roundId: rng.roundId, betId, totalStake, outcome, session });
  });

  const completed = await GameRound.findOne({ userId: input.userId, gameId: input.gameId, requestId: input.requestId }).select("+rngSeed").lean();
  if (!completed) throw new ApiError("The round could not be completed.", 500, "ROUND_CREATE_FAILED");
  return { round: serializeCompletedRound(completed as unknown as Record<string, unknown>), duplicate: id(completed.roundId) !== rng.roundId };
}

export async function startFlightRound(input: { userId: string; requestId: string; selections: RoundSelection[] }) {
  const gameId = "flight-x" as const;
  const prior = await GameRound.findOne({ userId: input.userId, gameId, requestId: input.requestId }).select("+rngSeed +crashMultiplier").lean();
  if (prior) return prior.status === "PLAYING"
    ? { round: serializeActiveFlight(prior as unknown as Record<string, unknown>), duplicate: true }
    : { round: serializeCompletedRound(prior as unknown as Record<string, unknown>), duplicate: true };

  const active = await GameRound.findOne({ userId: input.userId, gameId, status: "PLAYING" }).select("+rngSeed +crashMultiplier").lean();
  if (active) {
    const settled = await settleFlightRound(input.userId, String(active.roundId), false);
    if (settled.status === "PLAYING") return { round: settled, duplicate: true };
  }

  const database = await connectDB();
  const gameSession = await touchGameSession(input.userId, gameId);
  if (!gameSession) throw new ApiError("The flight session could not be opened.", 500, "SESSION_CREATE_FAILED");
  const totalStake = sumStake(input.selections);
  const rng = createRoundSeed(gameId);
  const crashMultiplier = createFlightCrash(rng.seed);
  const betId = `${gameId}_bet_${randomUUID()}`;
  const startedAt = new Date();

  await database.connection.transaction(async (session) => {
    const concurrent = await GameRound.findOne({ userId: input.userId, gameId, requestId: input.requestId }).session(session).lean();
    if (concurrent) return;
    const debit = await applyWalletChange({
      userId: input.userId, amount: -totalStake, type: "RACE_ENTRY", description: "Crash launch", referenceId: rng.roundId,
      idempotencyKey: `premium:${input.userId}:${gameId}:${input.requestId}:stake`,
      metadata: { game: gameId, roundId: rng.roundId, commitment: rng.commitment, serverVerified: true },
    }, session);
    await GameRound.create([{
      roundId: rng.roundId, requestId: input.requestId,
      idempotencyKey: `premium:${input.userId}:${gameId}:${input.requestId}`,
      userId: input.userId, gameId, sessionId: gameSession.sessionId,
      status: "PLAYING", phase: "ANIMATING", totalStake, payout: 0, net: -totalStake, result: "PENDING", selections: input.selections,
      rngVersion: PREMIUM_RNG_VERSION, rngCommitment: rng.commitment, rngSeed: rng.seed, crashMultiplier,
      balanceAfter: Number(debit.wallet.balance), startedAt,
    }], { session });
    await GameBet.create([{ betId, roundId: rng.roundId, userId: input.userId, gameId, amount: totalStake, status: "ACCEPTED", idempotencyKey: `premium:${input.userId}:${gameId}:${input.requestId}:bet` }], { session });
    await BetSelection.insertMany(input.selections.map((selection) => ({ betId, roundId: rng.roundId, userId: input.userId, gameId, selectionId: selection.id, amount: selection.amount })), { session });
    await RngRound.create([{ roundId: rng.roundId, gameId, userId: input.userId, version: PREMIUM_RNG_VERSION, commitment: rng.commitment, seed: rng.seed }], { session });
    await GameSession.updateOne({ sessionId: gameSession.sessionId }, { $set: { activeRoundId: rng.roundId, lastSeenAt: startedAt } }, { session });
  });

  const created = await GameRound.findOne({ userId: input.userId, gameId, requestId: input.requestId }).lean();
  if (!created) throw new ApiError("The flight could not be launched.", 500, "ROUND_CREATE_FAILED");
  return { round: serializeActiveFlight(created as unknown as Record<string, unknown>), duplicate: id(created.roundId) !== rng.roundId };
}

export async function settleFlightRound(userId: string, roundId: string, cashout: boolean) {
  const gameId = "flight-x" as const;
  // A cash-out is judged at server request arrival, not after wallet/database
  // work completes. This prevents transaction latency from turning an on-time
  // click into a crash while keeping the timestamp fully server-controlled.
  const cashoutRequestedAt = Date.now();
  const round = await GameRound.findOne({ userId, gameId, roundId }).select("+rngSeed +crashMultiplier").lean();
  if (!round) throw new ApiError("Flight round not found.", 404, "ROUND_NOT_FOUND");
  if (round.status !== "PLAYING") return serializeCompletedRound(round as unknown as Record<string, unknown>);

  const elapsed = (cashout ? cashoutRequestedAt : Date.now()) - new Date(round.startedAt).getTime();
  const current = flightMultiplierAt(elapsed);
  const crashMultiplier = Number(round.crashMultiplier);
  const crashed = elapsed >= flightElapsedFor(crashMultiplier) || current >= crashMultiplier;
  if (!cashout && !crashed) return serializeActiveFlight(round as unknown as Record<string, unknown>);

  const database = await connectDB();

  await database.connection.transaction(async (session) => {
    const live = await GameRound.findOne({ userId, gameId, roundId, status: "PLAYING" }).select("+rngSeed +crashMultiplier").session(session).lean();
    if (!live) return;
    const liveElapsed = (cashout ? cashoutRequestedAt : Date.now()) - new Date(live.startedAt).getTime();
    const liveCurrent = flightMultiplierAt(liveElapsed);
    const liveCrash = Number(live.crashMultiplier);
    const liveCrashed = liveElapsed >= flightElapsedFor(liveCrash) || liveCurrent >= liveCrash;
    const liveCashout = cashout && !liveCrashed ? liveCurrent : null;
    const livePayout = liveCashout ? roundCredits(Number(live.totalStake) * liveCashout) : 0;
    const liveOutcome: PremiumRoundOutcome = {
      result: livePayout > 0 ? "WIN" : "LOSS",
      label: livePayout > 0 ? `CASHED OUT AT ${liveCashout?.toFixed(2)}×` : `ROUND ENDED AT ${liveCrash.toFixed(2)}×`,
      payout: livePayout,
      multiplier: livePayout > 0 ? Number(liveCashout) : 0,
      winningOptions: livePayout > 0 ? ["FLIGHT"] : [],
      payload: { crashMultiplier: liveCrash, cashedOutMultiplier: liveCashout },
    };
    const liveHash = resultHash(String(live.rngSeed), liveOutcome);
    let balanceAfter = Number(live.balanceAfter);
    if (livePayout > 0) {
      const reward = await applyWalletChange({
        userId, amount: livePayout, type: "RACE_REWARD", description: `Crash ${liveOutcome.label}`, referenceId: roundId,
        idempotencyKey: `premium:${userId}:${gameId}:${roundId}:payout`,
        metadata: { game: gameId, roundId, multiplier: liveCashout, serverVerified: true },
      }, session);
      balanceAfter = Number(reward.wallet.balance);
    }
    const bet = await GameBet.findOne({ roundId }).session(session).lean();
    if (!bet) throw new ApiError("Flight bet record is missing.", 500, "BET_NOT_FOUND");
    await GameRound.updateOne({ roundId, status: "PLAYING" }, { $set: {
      status: "COMPLETED", phase: "RESULT", payout: livePayout, net: livePayout - Number(live.totalStake), result: liveOutcome.result,
      resultLabel: liveOutcome.label, outcome: liveOutcome, serverResultHash: liveHash, balanceAfter, cashedOutMultiplier: liveCashout, completedAt: new Date(),
    } }, { session });
    await RngRound.updateOne({ roundId }, { $set: { resultHash: liveHash, revealedAt: new Date() } }, { session });
    await GameSession.updateOne({ sessionId: live.sessionId }, { $set: { activeRoundId: null, lastSeenAt: new Date() } }, { session });
    await createSettlementRecords({ userId, gameId, roundId, betId: String(bet.betId), totalStake: Number(live.totalStake), outcome: liveOutcome, session });
  });

  const settled = await GameRound.findOne({ userId, gameId, roundId }).select("+rngSeed").lean();
  if (!settled) throw new ApiError("The flight could not be settled.", 500, "ROUND_SETTLE_FAILED");
  return serializeCompletedRound(settled as unknown as Record<string, unknown>);
}

export function allDefaultGameSettings() {
  return Object.values(premiumGameDefinitions).map((game) => ({
    gameId: game.id,
    title: game.title,
    artwork: game.thumbnail,
    enabled: true,
    maintenanceMode: false,
    minStake: game.minStake,
    maxStake: game.maxStake,
    chipDenominations: [...game.chips],
  }));
}
