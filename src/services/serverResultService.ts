import { createHash, randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { premiumGame, premiumGameDefinitions, type PremiumGameId } from "@/lib/premium-games/definitions";
import { createFlightCrash, createPremiumOutcome, flightCashoutPayout, flightMultiplierAt, hasFlightCrashed, type PremiumRoundOutcome, type RoundSelection } from "@/lib/premium-games/engine";
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

type FlightBetId = "FLIGHT_1" | "FLIGHT_2";
interface ServerFlightBet {
  id: FlightBetId;
  amount: number;
  state: "active" | "cashed_out" | "lost";
  cashOutMultiplier: number | null;
  payout: number;
  cashOutRequestedAt?: Date | null;
}

function flightBets(row: Record<string, unknown>): ServerFlightBet[] {
  if (Array.isArray(row.flightBets)) return row.flightBets as ServerFlightBet[];
  const selections = Array.isArray(row.selections) ? row.selections as RoundSelection[] : [];
  return selections.map((selection, index) => ({
    id: (selection.id === "FLIGHT_2" || index === 1 ? "FLIGHT_2" : "FLIGHT_1") as FlightBetId,
    amount: Number(selection.amount), state: "active", cashOutMultiplier: null, payout: 0,
  }));
}

function publicFlightBets(row: Record<string, unknown>) {
  return flightBets(row).map(({ id: betId, amount, state, cashOutMultiplier, payout }) => ({ id: betId, amount, state, cashOutMultiplier, payout }));
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
    selections: Array.isArray(row.selections) ? row.selections : [],
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
    crashMultiplier: Number(row.crashMultiplier),
    roundId: String(row.roundId),
    requestId: String(row.requestId),
    gameId: "flight-x",
    status: "PLAYING",
    totalStake: Number(row.totalStake),
    balance: Number(row.balanceAfter),
    commitment: row.rngCommitment,
    startedAt: row.startedAt,
    serverNow: new Date(),
    bets: publicFlightBets(row),
  };
}

export async function getPremiumGameState(userId: string, gameId: PremiumGameId) {
  // For normal games all opening reads/writes are independent. Run them in one
  // database wave instead of waiting for setting/session work before wallet and
  // history. This is one of the hottest paths after a game card is clicked.
  if (gameId !== "flight-x") {
    const [setting, session, wallet, history, latestRound] = await Promise.all([
      assertGameAvailable(gameId),
      touchGameSession(userId, gameId),
      Wallet.findOne({ userId }).select("balance").lean(),
      GameHistory.find({ userId, gameId }).select("roundId result label stake payout multiplier createdAt").sort({ createdAt: -1 }).limit(16).lean(),
      gameId === "red-vs-black"
        ? GameRound.findOne({ userId, gameId, status: "COMPLETED" }).select("+rngSeed").sort({ completedAt: -1 }).lean()
        : Promise.resolve(null),
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
      latestRound: latestRound ? serializeCompletedRound(latestRound as unknown as Record<string, unknown>) : null,
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
    GameRound.findOne({ userId, gameId, status: "PLAYING" }).select("+crashMultiplier").sort({ createdAt: -1 }).lean(),
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
  // Commit the endpoint exactly once, before the flight starts. It depends only
  // on this round's RNG seed and is never rerolled after inspecting any wager.
  const crashMultiplier = createFlightCrash(rng.seed);
  const initialFlightBets: ServerFlightBet[] = input.selections.map((selection) => ({
    id: selection.id as FlightBetId,
    amount: selection.amount,
    state: "active",
    cashOutMultiplier: null,
    payout: 0,
  }));
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
      rngVersion: PREMIUM_RNG_VERSION, rngCommitment: rng.commitment, rngSeed: rng.seed, crashMultiplier, flightBets: initialFlightBets,
      balanceAfter: Number(debit.wallet.balance), startedAt,
    }], { session });
    await GameBet.create([{ betId, roundId: rng.roundId, userId: input.userId, gameId, amount: totalStake, status: "ACCEPTED", idempotencyKey: `premium:${input.userId}:${gameId}:${input.requestId}:bet` }], { session });
    await BetSelection.insertMany(input.selections.map((selection) => ({ betId, roundId: rng.roundId, userId: input.userId, gameId, selectionId: selection.id, amount: selection.amount })), { session });
    await RngRound.create([{ roundId: rng.roundId, gameId, userId: input.userId, version: PREMIUM_RNG_VERSION, commitment: rng.commitment, seed: rng.seed }], { session });
    await GameSession.updateOne({ sessionId: gameSession.sessionId }, { $set: { activeRoundId: rng.roundId, lastSeenAt: startedAt } }, { session });
  });

  const created = await GameRound.findOne({ userId: input.userId, gameId, requestId: input.requestId }).select("+crashMultiplier").lean();
  if (!created) throw new ApiError("The flight could not be launched.", 500, "ROUND_CREATE_FAILED");
  return { round: serializeActiveFlight(created as unknown as Record<string, unknown>), duplicate: id(created.roundId) !== rng.roundId };
}

export async function settleFlightRound(userId: string, roundId: string, cashout: boolean, betId?: FlightBetId, requestedAt = Date.now(), capturedMultiplier?: number) {
  const gameId = "flight-x" as const;
  // A cash-out is judged at server request arrival, not after wallet/database
  // work completes. This prevents transaction latency from turning an on-time
  // click into a crash while keeping the timestamp fully server-controlled.
  const cashoutRequestedAt = requestedAt;
  const round = await GameRound.findOne({ userId, gameId, roundId }).select("+rngSeed +crashMultiplier").lean();
  if (!round) throw new ApiError("Flight round not found.", 404, "ROUND_NOT_FOUND");
  if (round.status !== "PLAYING") return serializeCompletedRound(round as unknown as Record<string, unknown>);

  const elapsed = (cashout ? cashoutRequestedAt : Date.now()) - new Date(round.startedAt).getTime();
  const crashMultiplier = Number(round.crashMultiplier);
  const crashed = hasFlightCrashed(elapsed, crashMultiplier);
  if (!cashout && !crashed) return serializeActiveFlight(round as unknown as Record<string, unknown>);
  if (cashout && !betId) throw new ApiError("Choose the bet to cash out.", 400, "BET_REQUIRED");

  const database = await connectDB();

  if (cashout && !crashed) {
    await database.connection.transaction(async (session) => {
      const live = await GameRound.findOne({ userId, gameId, roundId, status: "PLAYING" }).select("+rngSeed +crashMultiplier").session(session).lean();
      if (!live) return;
      const liveElapsed = cashoutRequestedAt - new Date(live.startedAt).getTime();
      const liveCurrent = flightMultiplierAt(liveElapsed);
      const liveCrash = Number(live.crashMultiplier);
      if (hasFlightCrashed(liveElapsed, liveCrash)) return;
      const bets = flightBets(live as unknown as Record<string, unknown>);
      const target = bets.find((item) => item.id === betId);
      if (!target) throw new ApiError("That flight bet was not found.", 404, "BET_NOT_FOUND");
      if (target.state !== "active") return;
      const lockedMultiplier = Math.min(liveCrash, liveCurrent, capturedMultiplier ?? liveCurrent);
      const payout = flightCashoutPayout(target.amount, lockedMultiplier);
      const claimed = await GameRound.updateOne(
        { roundId, status: "PLAYING", flightBets: { $elemMatch: { id: betId, state: "active" } } },
        { $set: {
          "flightBets.$[cashoutBet].state": "cashed_out",
          "flightBets.$[cashoutBet].cashOutMultiplier": lockedMultiplier,
          "flightBets.$[cashoutBet].payout": payout,
          "flightBets.$[cashoutBet].cashOutRequestedAt": new Date(cashoutRequestedAt),
        } },
        { session, arrayFilters: [{ "cashoutBet.id": betId, "cashoutBet.state": "active" }] },
      );
      if (claimed.modifiedCount !== 1) return;
      const reward = await applyWalletChange({
        userId, amount: payout, type: "RACE_REWARD", description: `Crash cash-out at ${lockedMultiplier.toFixed(2)}x`, referenceId: roundId,
        idempotencyKey: `premium:${userId}:${gameId}:${roundId}:payout:${betId}`,
        metadata: { game: gameId, roundId, betId, multiplier: lockedMultiplier, requestedAt: new Date(cashoutRequestedAt), serverVerified: true },
      }, session);
      target.state = "cashed_out";
      target.cashOutMultiplier = lockedMultiplier;
      target.payout = payout;
      target.cashOutRequestedAt = new Date(cashoutRequestedAt);
      const totalPayout = roundCredits(bets.reduce((sum, item) => sum + item.payout, 0));
      await GameRound.updateOne({ roundId, status: "PLAYING" }, { $set: {
        payout: totalPayout, net: totalPayout - Number(live.totalStake), balanceAfter: Number(reward.wallet.balance),
      } }, { session });
    });

    const updated = await GameRound.findOne({ userId, gameId, roundId }).select("+rngSeed +crashMultiplier").lean();
    if (!updated) throw new ApiError("Flight round not found.", 404, "ROUND_NOT_FOUND");
    if (updated.status !== "PLAYING") return serializeCompletedRound(updated as unknown as Record<string, unknown>);
    const active = serializeActiveFlight(updated as unknown as Record<string, unknown>);
    return { ...active, acceptedCashout: active.bets.find((item) => item.id === betId) };
  }

  await database.connection.transaction(async (session) => {
    const live = await GameRound.findOne({ userId, gameId, roundId, status: "PLAYING" }).select("+rngSeed +crashMultiplier").session(session).lean();
    if (!live) return;
    const liveElapsed = (cashout ? cashoutRequestedAt : Date.now()) - new Date(live.startedAt).getTime();
    const liveCrash = Number(live.crashMultiplier);
    const liveCrashed = hasFlightCrashed(liveElapsed, liveCrash);
    if (!liveCrashed) return;
    const bets = flightBets(live as unknown as Record<string, unknown>).map((item) => item.state === "active" ? { ...item, state: "lost" as const } : item);
    const livePayout = roundCredits(bets.reduce((sum, item) => sum + item.payout, 0));
    const highestCashout = bets.reduce<number | null>((highest, item) => item.cashOutMultiplier == null ? highest : Math.max(highest ?? 1, item.cashOutMultiplier), null);
    const liveOutcome: PremiumRoundOutcome = {
      result: livePayout > 0 ? "WIN" : "LOSS",
      label: `FLEW AWAY AT ${liveCrash.toFixed(2)}×`,
      payout: livePayout,
      multiplier: liveCrash,
      winningOptions: bets.filter((item) => item.state === "cashed_out").map((item) => item.id),
      payload: { crashMultiplier: liveCrash, cashedOutMultiplier: highestCashout, bets: publicFlightBets({ flightBets: bets }) },
    };
    const liveHash = resultHash(String(live.rngSeed), liveOutcome);
    const balanceAfter = Number(live.balanceAfter);
    const bet = await GameBet.findOne({ roundId }).session(session).lean();
    if (!bet) throw new ApiError("Flight bet record is missing.", 500, "BET_NOT_FOUND");
    await GameRound.updateOne({ roundId, status: "PLAYING" }, { $set: {
      status: "COMPLETED", phase: "RESULT", payout: livePayout, net: livePayout - Number(live.totalStake), result: liveOutcome.result,
      resultLabel: liveOutcome.label, outcome: liveOutcome, serverResultHash: liveHash, balanceAfter, cashedOutMultiplier: highestCashout, flightBets: bets, completedAt: new Date(),
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
