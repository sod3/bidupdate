import { z } from "zod";
import { ApiError, assertSameOrigin, handleRouteError, noStoreJson, parseJson } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { isPremiumGameId, premiumGame, type PremiumGameId } from "@/lib/premium-games/definitions";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/session";
import { User } from "@/models";
import { assertGameAvailable, getPremiumGameState, playPremiumRound, settleFlightRound, startFlightRound } from "@/services/serverResultService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestId = z.string().trim().min(12).max(120).regex(/^[a-zA-Z0-9:_-]+$/);
const selectionSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[A-Z0-9_-]+$/),
  amount: z.number().int().positive().max(5000),
});
const playSchema = z.object({
  action: z.literal("play"),
  requestId,
  selections: z.array(selectionSchema).min(1).max(50),
});
const cashoutSchema = z.object({
  action: z.literal("cashout"),
  roundId: z.string().trim().min(20).max(160).regex(/^[a-zA-Z0-9:_-]+$/),
});
const actionSchema = z.discriminatedUnion("action", [playSchema, cashoutSchema]);

async function assertPlayerAvailable(userId: string) {
  const account = await User.findById(userId).select("responsiblePlay status").lean();
  if (!account || account.status !== "ACTIVE") throw new ApiError("This account cannot start a game.", 403, "ACCOUNT_UNAVAILABLE");
  const now = Date.now();
  const blockedUntil = [account.responsiblePlay?.coolingOffUntil, account.responsiblePlay?.selfExcludedUntil]
    .filter(Boolean)
    .map((value) => new Date(value as Date).getTime())
    .filter((value) => value > now)
    .sort((left, right) => right - left)[0];
  if (blockedUntil) throw new ApiError(`Games are paused until ${new Date(blockedUntil).toISOString()}.`, 403, "GAMES_PAUSED");
}

function gameFrom(value: string): PremiumGameId {
  if (!isPremiumGameId(value)) throw new ApiError("Unknown game.", 404, "GAME_NOT_FOUND");
  return value;
}

export async function GET(_request: Request, context: { params: Promise<{ game: string }> }) {
  try {
    const user = await requireUser();
    await connectDB();
    const gameId = gameFrom((await context.params).game);
    await assertPlayerAvailable(user.userId);
    return noStoreJson(await getPremiumGameState(user.userId, gameId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ game: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const gameId = gameFrom((await context.params).game);
    const input = await parseJson(request, actionSchema);
    await connectDB();
    await enforceRateLimit(`premium-game:${gameId}:${user.userId}`, gameId === "flight-x" ? 900 : 500, 60 * 60 * 1000);
    await assertPlayerAvailable(user.userId);
    const setting = await assertGameAvailable(gameId);

    if (input.action === "cashout") {
      if (gameId !== "flight-x") throw new ApiError("Cash out is only available in Crash.", 400, "ACTION_NOT_SUPPORTED");
      return noStoreJson({ round: await settleFlightRound(user.userId, input.roundId, true) });
    }

    const definition = premiumGame(gameId);
    const allowed = new Set(definition.options.map((option) => option.id));
    const duplicateSelection = new Set(input.selections.map((selection) => selection.id)).size !== input.selections.length;
    const totalStake = input.selections.reduce((sum, selection) => sum + selection.amount, 0);
    const gcd = (left: number, right: number): number => right ? gcd(right, left % right) : left;
    const chipStep = setting.chipDenominations.reduce(gcd);
    if (duplicateSelection || input.selections.some((selection) => !allowed.has(selection.id) || selection.amount % chipStep !== 0)) {
      throw new ApiError("One or more bet selections are not available.", 400, "INVALID_SELECTION");
    }
    if (totalStake < setting.minStake || totalStake > setting.maxStake) {
      throw new ApiError(`Total stake must be between ${setting.minStake} and ${setting.maxStake} credits.`, 400, "INVALID_STAKE");
    }

    const result = gameId === "flight-x"
      ? await startFlightRound({ userId: user.userId, requestId: input.requestId, selections: input.selections })
      : await playPremiumRound({ userId: user.userId, gameId, requestId: input.requestId, selections: input.selections });
    return noStoreJson(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return handleRouteError(new ApiError("That round is already being processed. Reconnecting…", 409, "ROUND_IN_PROGRESS"));
    }
    if (error && typeof error === "object" && "hasErrorLabel" in error && typeof error.hasErrorLabel === "function" && error.hasErrorLabel("TransientTransactionError")) {
      return handleRouteError(new ApiError("That round is already being processed. Reconnecting…", 409, "ROUND_IN_PROGRESS"));
    }
    return handleRouteError(error);
  }
}
