import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import {
  HUMAN_PLAYER_ID,
  TEEN_PATTI_STAKES,
  activeTeenPattiPlayers,
  applyTeenPattiAction,
  callAmount,
  createTeenPattiRound,
  humanTeenPattiPlayer,
  raiseAmount,
  type TeenPattiAction,
  type TeenPattiRoundState,
  type TeenPattiStake,
} from "@/lib/teen-patti/engine";
import { evaluateTeenPattiHand } from "@/lib/teen-patti/rules";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/session";
import { TeenPattiRound, User, Wallet } from "@/models";
import { applyWalletChange } from "@/services/walletService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestId = z.string().trim().min(12).max(100).regex(/^[a-zA-Z0-9:_-]+$/);
const startSchema = z.object({
  action: z.literal("START"),
  stake: z.number().int().refine((value): value is TeenPattiStake => TEEN_PATTI_STAKES.includes(value as TeenPattiStake)),
  requestId,
});
const actionSchema = z.object({
  action: z.enum(["SEEN", "CHAAL", "RAISE", "PACK", "SHOW"]),
  roundId: z.string().uuid(),
  requestId,
});
const bodySchema = z.discriminatedUnion("action", [startSchema, actionSchema]);

type RoundRecord = TeenPattiRoundState & {
  processedRequestIds: string[];
  startRequestId: string;
  activeKey?: string;
};

function secureRandomIndex(maxExclusive: number) {
  return randomInt(maxExclusive);
}

function plainRound(value: unknown): RoundRecord {
  const source = value as Record<string, unknown>;
  return {
    roundId: String(source.roundId),
    stakePreset: Number(source.stakePreset) as TeenPattiStake,
    pot: Number(source.pot),
    currentBet: Number(source.currentBet),
    playerPaid: Number(source.playerPaid),
    payout: Number(source.payout || 0),
    status: source.status === "COMPLETED" ? "COMPLETED" : "PLAYING",
    turnPlayerId: String(source.turnPlayerId || ""),
    actionCount: Number(source.actionCount || 0),
    playerBetTurns: Number(source.playerBetTurns || 0),
    players: Array.isArray(source.players) ? source.players as RoundRecord["players"] : [],
    actionHistory: Array.isArray(source.actionHistory) ? source.actionHistory as RoundRecord["actionHistory"] : [],
    lastActionBatch: Array.isArray(source.lastActionBatch) ? source.lastActionBatch as RoundRecord["lastActionBatch"] : [],
    winner: source.winner && typeof source.winner === "object" ? source.winner as RoundRecord["winner"] : null,
    startedAt: new Date(source.startedAt as Date | string),
    completedAt: source.completedAt ? new Date(source.completedAt as Date | string) : null,
    processedRequestIds: Array.isArray(source.processedRequestIds) ? source.processedRequestIds.map(String) : [],
    startRequestId: String(source.startRequestId || ""),
    activeKey: typeof source.activeKey === "string" ? source.activeKey : undefined,
  };
}

function publicRound(round: RoundRecord, balance: number) {
  const human = humanTeenPattiPlayer(round);
  const complete = round.status === "COMPLETED";
  const active = activeTeenPattiPlayers(round);
  const canAct = !complete && round.turnPlayerId === HUMAN_PLAYER_ID && !human.folded;
  const call = callAmount(round, human);
  const raise = raiseAmount(round, human);
  return {
    roundId: round.roundId,
    status: round.status,
    stake: round.stakePreset,
    pot: round.pot,
    currentBet: round.currentBet,
    playerPaid: round.playerPaid,
    balance,
    activePlayerId: round.turnPlayerId,
    actionCount: round.actionCount,
    playerBetTurns: round.playerBetTurns,
    targetBetTurns: 6,
    players: round.players.map((player) => ({
      id: player.id,
      name: player.name,
      isHuman: player.isHuman,
      seen: player.seen,
      folded: player.folded,
      contribution: player.contribution,
      lastAction: player.lastAction,
      cards: complete || (player.isHuman && player.seen) ? player.cards : [null, null, null],
      handName: complete ? evaluateTeenPattiHand(player.cards).name : null,
    })),
    controls: {
      canPack: canAct,
      canSeen: canAct && !human.seen,
      canChaal: canAct,
      canRaise: canAct && round.currentBet < round.stakePreset * 8,
      canShow: canAct && human.seen && active.length === 2,
      callAmount: call,
      raiseAmount: raise,
      showAmount: call,
    },
    events: round.lastActionBatch,
    result: complete && round.winner ? {
      winner: round.winner,
      playerWon: round.winner.id === HUMAN_PLAYER_ID,
      payout: round.winner.id === HUMAN_PLAYER_ID ? round.payout : 0,
      net: round.winner.id === HUMAN_PLAYER_ID ? round.payout - round.playerPaid : -round.playerPaid,
      hands: round.players.map((player) => ({
        id: player.id,
        name: player.name,
        folded: player.folded,
        cards: player.cards,
        handName: evaluateTeenPattiHand(player.cards).name,
      })),
    } : null,
  };
}

async function responseForRound(roundId: string, userId: string) {
  const [round, wallet] = await Promise.all([
    TeenPattiRound.findOne({ roundId, userId }).lean(),
    Wallet.findOne({ userId }).select("balance").lean(),
  ]);
  if (!round) throw new ApiError("Teen Patti round not found.", 404, "ROUND_NOT_FOUND");
  if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
  return publicRound(plainRound(round), Number(wallet.balance));
}

async function assertGamesAvailable(userId: string) {
  const account = await User.findById(userId).select("responsiblePlay").lean();
  const now = Date.now();
  const blockedUntil = [account?.responsiblePlay?.coolingOffUntil, account?.responsiblePlay?.selfExcludedUntil]
    .filter(Boolean)
    .map((value) => new Date(value as Date).getTime())
    .filter((value) => value > now)
    .sort((left, right) => right - left)[0];
  if (blockedUntil) throw new ApiError(`Games are paused until ${new Date(blockedUntil).toISOString()}.`, 403, "GAMES_PAUSED");
}

function engineError(error: unknown): never {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    ROUND_COMPLETE: "This round is already complete.",
    NOT_PLAYER_TURN: "Wait for your turn.",
    ALREADY_SEEN: "Your cards are already seen.",
    SHOW_REQUIRES_SEEN: "See your cards before requesting a show.",
    SHOW_REQUIRES_TWO: "Show becomes available when two players remain.",
    SHOW_OPPONENT_MISSING: "No opponent is available for show.",
  };
  if (messages[code]) throw new ApiError(messages[code], 409, code);
  throw error;
}

export async function GET() {
  try {
    const user = await requireUser();
    const [active, wallet] = await Promise.all([
      TeenPattiRound.findOne({ userId: user.userId, activeKey: user.userId }).lean(),
      Wallet.findOne({ userId: user.userId }).select("balance").lean(),
    ]);
    if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
    return noStoreJson({ round: active ? publicRound(plainRound(active), Number(wallet.balance)) : null, balance: Number(wallet.balance) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = await parseJson(request, bodySchema);
    const database = await connectDB();

    if (input.action === "START") {
      await enforceRateLimit(`teen-patti-start:${user.userId}`, 30, 60 * 60 * 1000);
      await assertGamesAvailable(user.userId);
      const previous = await TeenPattiRound.findOne({ userId: user.userId, startRequestId: input.requestId }).lean();
      if (previous) return noStoreJson({ round: await responseForRound(String(previous.roundId), user.userId) });
      const active = await TeenPattiRound.findOne({ userId: user.userId, activeKey: user.userId }).lean();
      if (active) return noStoreJson({ round: await responseForRound(String(active.roundId), user.userId) });

      const previousRound = await TeenPattiRound.findOne({ userId: user.userId }).sort({ createdAt: -1 }).select("players").lean();
      const previousAiNames = Array.isArray(previousRound?.players)
        ? previousRound.players.filter((player: { isHuman?: boolean }) => !player.isHuman).map((player: { name?: string }) => String(player.name || "")).filter(Boolean)
        : [];

      const roundId = randomUUID();
      await database.connection.transaction(async (session) => {
        const concurrent = await TeenPattiRound.findOne({ userId: user.userId, activeKey: user.userId }).session(session).lean();
        if (concurrent) throw new ApiError("Finish your active Teen Patti round first.", 409, "ROUND_ALREADY_ACTIVE");
        const state = createTeenPattiRound({
          roundId,
          username: user.username,
          stake: input.stake as TeenPattiStake,
          randomIndex: secureRandomIndex,
          previousAiNames,
        });
        await applyWalletChange({
          userId: user.userId,
          amount: -input.stake,
          type: "RACE_ENTRY",
          description: `Teen Patti ${input.stake} CR boot`,
          referenceId: roundId,
          idempotencyKey: `teen-patti:${roundId}:boot`,
          metadata: { game: "teen-patti", action: "BOOT", stake: input.stake, serverVerified: true },
        }, session);
        await TeenPattiRound.create([{
          ...state,
          userId: user.userId,
          activeKey: user.userId,
          startRequestId: input.requestId,
          processedRequestIds: [input.requestId],
        }], { session });
      });
      return noStoreJson({ round: await responseForRound(roundId, user.userId) }, { status: 201 });
    }

    await enforceRateLimit(`teen-patti-action:${user.userId}`, 300, 60 * 60 * 1000);
    await database.connection.transaction(async (session) => {
      const document = await TeenPattiRound.findOne({ roundId: input.roundId, userId: user.userId }).session(session);
      if (!document) throw new ApiError("Teen Patti round not found.", 404, "ROUND_NOT_FOUND");
      const state = plainRound(document.toObject());
      if (state.processedRequestIds.includes(input.requestId)) return;
      if (state.status === "COMPLETED") throw new ApiError("This round is already complete.", 409, "ROUND_COMPLETE");

      let debit = 0;
      try {
        debit = applyTeenPattiAction(state, input.action as TeenPattiAction, secureRandomIndex).debit;
      } catch (error) {
        engineError(error);
      }
      if (debit > 0) {
        await applyWalletChange({
          userId: user.userId,
          amount: -debit,
          type: "RACE_ENTRY",
          description: `Teen Patti ${input.action.toLocaleLowerCase()} bet`,
          referenceId: state.roundId,
          idempotencyKey: `teen-patti:${state.roundId}:${input.requestId}:bet`,
          metadata: { game: "teen-patti", action: input.action, serverVerified: true },
        }, session);
      }
      if (state.winner?.id === HUMAN_PLAYER_ID) {
        state.payout = state.pot;
        await applyWalletChange({
          userId: user.userId,
          amount: state.payout,
          type: "RACE_REWARD",
          description: `${state.winner.handName} Teen Patti pot win`,
          referenceId: state.roundId,
          idempotencyKey: `teen-patti:${state.roundId}:payout`,
          metadata: { game: "teen-patti", handName: state.winner.handName, pot: state.pot, serverVerified: true },
        }, session);
      }
      state.processedRequestIds.push(input.requestId);
      document.set({
        status: state.status,
        pot: state.pot,
        currentBet: state.currentBet,
        playerPaid: state.playerPaid,
        payout: state.payout,
        actionCount: state.actionCount,
        playerBetTurns: state.playerBetTurns,
        turnPlayerId: state.turnPlayerId,
        players: state.players,
        actionHistory: state.actionHistory,
        processedRequestIds: state.processedRequestIds,
        lastActionBatch: state.lastActionBatch,
        winner: state.winner,
        completedAt: state.completedAt,
      });
      if (state.winner) document.set("activeKey", undefined);
      await document.save({ session });
    });
    return noStoreJson({ round: await responseForRound(input.roundId, user.userId) });
  } catch (error) {
    if (error && typeof error === "object" && "hasErrorLabel" in error && typeof error.hasErrorLabel === "function" && error.hasErrorLabel("TransientTransactionError")) {
      return handleRouteError(new ApiError("That action is already being processed. Try again.", 409, "ACTION_IN_PROGRESS"));
    }
    return handleRouteError(error);
  }
}
