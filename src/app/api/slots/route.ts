import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/session";
import {
  SLOT_PAYLINES,
  SLOT_RNG_VERSION,
  SLOT_STAKES,
  SLOT_SYMBOLS,
  SLOT_TARGET_WIN_PERCENT,
  createSlotOutcome,
  type SlotStake,
} from "@/lib/slots/engine";
import { SlotSpin, User, Wallet } from "@/models";
import { applyWalletChange } from "@/services/walletService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestId = z.string().trim().min(12).max(100).regex(/^[a-zA-Z0-9:_-]+$/);
const spinSchema = z.object({
  stake: z.number().int().refine((value): value is SlotStake => SLOT_STAKES.includes(value as SlotStake)),
  requestId,
});

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

function serializeSpin(value: unknown) {
  const spin = value as Record<string, unknown>;
  return {
    spinId: String(spin.spinId),
    stake: Number(spin.stake),
    grid: spin.grid,
    winningLines: Array.isArray(spin.winningLines) ? spin.winningLines : [],
    totalMultiplier: Number(spin.totalMultiplier),
    payout: Number(spin.payout),
    net: Number(spin.net),
    result: spin.result,
    balance: Number(spin.balanceAfter),
    completedAt: spin.completedAt,
  };
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

export async function GET() {
  try {
    const user = await requireUser();
    const [wallet, recent] = await Promise.all([
      Wallet.findOne({ userId: user.userId }).select("balance").lean(),
      SlotSpin.find({ userId: user.userId }).sort({ createdAt: -1 }).limit(12).lean(),
    ]);
    if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
    return noStoreJson({
      balance: Number(wallet.balance),
      recent: recent.map(serializeSpin),
      configuration: {
        stakes: SLOT_STAKES,
        targetLossPercent: 100 - SLOT_TARGET_WIN_PERCENT,
        rngVersion: SLOT_RNG_VERSION,
        paylines: SLOT_PAYLINES,
        symbols: SLOT_SYMBOLS,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = await parseJson(request, spinSchema);
    await enforceRateLimit(`slots-spin:${user.userId}`, 600, 60 * 60 * 1000);
    await assertGamesAvailable(user.userId);
    const database = await connectDB();

    const previous = await SlotSpin.findOne({ userId: user.userId, requestId: input.requestId }).lean();
    if (previous) return noStoreJson({ spin: serializeSpin(previous), duplicate: true });

    const spinId = randomUUID();
    const outcome = createSlotOutcome(input.stake as SlotStake, randomInt);
    try {
      await database.connection.transaction(async (session) => {
        const concurrent = await SlotSpin.findOne({ userId: user.userId, requestId: input.requestId }).session(session).lean();
        if (concurrent) return;

        const debit = await applyWalletChange({
          userId: user.userId,
          amount: -input.stake,
          type: "RACE_ENTRY",
          description: `777 Slots ${input.stake} CR spin`,
          referenceId: spinId,
          idempotencyKey: `slots:${user.userId}:${input.requestId}:stake`,
          metadata: { game: "777-slots", action: "SPIN", stake: input.stake, serverVerified: true },
        }, session);
        let balanceAfter = Number(debit.wallet.balance);

        if (outcome.payout > 0) {
          const reward = await applyWalletChange({
            userId: user.userId,
            amount: outcome.payout,
            type: "RACE_REWARD",
            description: outcome.result === "JACKPOT" ? "777 Slots jackpot win" : "777 Slots line win",
            referenceId: spinId,
            idempotencyKey: `slots:${user.userId}:${input.requestId}:payout`,
            metadata: {
              game: "777-slots",
              action: "PAYOUT",
              stake: input.stake,
              multiplier: outcome.totalMultiplier,
              paylines: outcome.winningLines.map((line) => line.id),
              serverVerified: true,
            },
          }, session);
          balanceAfter = Number(reward.wallet.balance);
        }

        await SlotSpin.create([{
          spinId,
          userId: user.userId,
          requestId: input.requestId,
          stake: input.stake,
          grid: outcome.grid,
          winningLines: outcome.winningLines,
          totalMultiplier: outcome.totalMultiplier,
          payout: outcome.payout,
          net: outcome.payout - input.stake,
          result: outcome.result,
          balanceAfter,
          rngVersion: SLOT_RNG_VERSION,
          completedAt: new Date(),
        }], { session });
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const concurrent = await SlotSpin.findOne({ userId: user.userId, requestId: input.requestId }).lean();
      if (concurrent) return noStoreJson({ spin: serializeSpin(concurrent), duplicate: true });
      throw error;
    }

    const completed = await SlotSpin.findOne({ userId: user.userId, requestId: input.requestId }).lean();
    if (!completed) throw new ApiError("The spin could not be completed.", 500, "SPIN_CREATE_FAILED");
    return noStoreJson({ spin: serializeSpin(completed) }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "hasErrorLabel" in error && typeof error.hasErrorLabel === "function" && error.hasErrorLabel("TransientTransactionError")) {
      return handleRouteError(new ApiError("That spin is already being processed. Try again.", 409, "SPIN_IN_PROGRESS"));
    }
    return handleRouteError(error);
  }
}
