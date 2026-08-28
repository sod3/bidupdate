import { randomBytes } from "node:crypto";
import type { ClientSession } from "mongoose";
import { connectDB } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { PaymentMethod } from "@/lib/paymentConfig";
import { CreditRequest, Wallet, WalletTransaction } from "@/models";

export type WalletTransactionType =
  | "STARTING_BONUS"
  | "REFERRAL_BONUS"
  | "RACE_ENTRY"
  | "RACE_REWARD"
  | "ADMIN_ADJUSTMENT"
  | "TOP_UP"
  | "WITHDRAWAL_RESERVE"
  | "WITHDRAWAL_REFUND";

export function roundCredits(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function walletBuckets(wallet: { balance: number; cashBalance?: number; bonusBalance?: number; balanceBucketsInitialized?: boolean }) {
  if (!wallet.balanceBucketsInitialized) {
    return { cash: roundCredits(wallet.balance), bonus: 0 };
  }
  return {
    cash: roundCredits(wallet.cashBalance ?? 0),
    bonus: roundCredits(wallet.bonusBalance ?? 0),
  };
}

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

export async function createWallet(
  userId: string,
  startingBalance: number,
  session: ClientSession,
) {
  const safeStartingBalance = Math.max(0, roundCredits(startingBalance));
  const [wallet] = await Wallet.create(
    [{
      userId,
      balance: safeStartingBalance,
      cashBalance: 0,
      bonusBalance: safeStartingBalance,
      balanceBucketsInitialized: true,
      reservedBalance: 0,
      totalWagered: 0,
      totalWon: 0,
    }],
    { session },
  );
  if (safeStartingBalance > 0) {
    await WalletTransaction.create(
      [{
        walletId: wallet._id,
        userId,
        type: "STARTING_BONUS",
        amount: safeStartingBalance,
        balanceBefore: 0,
        balanceAfter: safeStartingBalance,
        cashBefore: 0,
        cashAfter: 0,
        bonusBefore: 0,
        bonusAfter: safeStartingBalance,
        balanceKind: "PROMOTIONAL",
        idempotencyKey: `welcome:${userId}`,
        description: "Welcome bonus (promotional, not withdrawable)",
      }],
      { session },
    );
  }
  return wallet;
}

export async function applyWalletChange(
  input: {
    userId: string;
    amount: number;
    reservedDelta?: number;
    type: WalletTransactionType;
    description: string;
    referenceId?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    balanceKind?: "CASH" | "PROMOTIONAL";
  },
  session: ClientSession,
) {
  const amount = roundCredits(input.amount);
  const wallet = await Wallet.findOne({ userId: input.userId }).session(session);
  if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
  const before = walletBuckets(wallet);
  if (amount < 0 && roundCredits(before.cash + before.bonus) < Math.abs(amount)) {
    throw new ApiError("Insufficient virtual credits.", 409, "INSUFFICIENT_BALANCE");
  }
  if ((input.reservedDelta ?? 0) < 0 && wallet.reservedBalance < Math.abs(input.reservedDelta ?? 0)) {
    throw new ApiError("Reserved balance is inconsistent.", 409, "RESERVED_BALANCE_ERROR");
  }

  let cashAfter = before.cash;
  let bonusAfter = before.bonus;
  let requestedKind = input.balanceKind;
  if (!requestedKind) {
    if (input.type === "STARTING_BONUS" || input.type === "REFERRAL_BONUS") requestedKind = "PROMOTIONAL";
    else if (input.type === "RACE_REWARD" && input.referenceId) {
      const entry = await WalletTransaction.findOne({
        userId: input.userId,
        referenceId: input.referenceId,
        type: "RACE_ENTRY",
      }).session(session).lean();
      requestedKind = entry && Number(entry.bonusBefore ?? 0) > Number(entry.bonusAfter ?? 0)
        ? "PROMOTIONAL"
        : "CASH";
    } else requestedKind = "CASH";
  }

  if (amount >= 0) {
    if (requestedKind === "PROMOTIONAL") bonusAfter = roundCredits(bonusAfter + amount);
    else cashAfter = roundCredits(cashAfter + amount);
  } else if (input.type === "WITHDRAWAL_RESERVE") {
    if (cashAfter < Math.abs(amount)) {
      throw new ApiError("Only the withdrawable balance can be withdrawn.", 409, "INSUFFICIENT_WITHDRAWABLE_BALANCE");
    }
    cashAfter = roundCredits(cashAfter + amount);
  } else {
    const debit = Math.abs(amount);
    const fromBonus = Math.min(bonusAfter, debit);
    bonusAfter = roundCredits(bonusAfter - fromBonus);
    cashAfter = roundCredits(cashAfter - (debit - fromBonus));
  }

  const balanceBefore = roundCredits(before.cash + before.bonus);
  const balanceAfter = roundCredits(cashAfter + bonusAfter);
  wallet.balance = balanceAfter;
  wallet.cashBalance = cashAfter;
  wallet.bonusBalance = bonusAfter;
  wallet.balanceBucketsInitialized = true;
  wallet.reservedBalance = roundCredits(wallet.reservedBalance + (input.reservedDelta ?? 0));
  if (input.type === "RACE_ENTRY") wallet.totalWagered = roundCredits(wallet.totalWagered + Math.abs(amount));
  if (input.type === "RACE_REWARD") wallet.totalWon = roundCredits(wallet.totalWon + Math.max(0, amount));
  await wallet.save({ session });

  const cashChanged = cashAfter !== before.cash;
  const bonusChanged = bonusAfter !== before.bonus;
  const balanceKind = cashChanged && bonusChanged ? "MIXED" : bonusChanged ? "PROMOTIONAL" : "CASH";

  const [transaction] = await WalletTransaction.create(
    [{
      walletId: wallet._id,
      userId: input.userId,
      type: input.type,
      amount,
      balanceBefore,
      balanceAfter,
      cashBefore: before.cash,
      cashAfter,
      bonusBefore: before.bonus,
      bonusAfter,
      balanceKind,
      referenceId: input.referenceId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      description: input.description,
      metadata: input.metadata ?? {},
    }],
    { session },
  );
  return { wallet, transaction };
}

function serializeCreditRequest(item: Record<string, unknown>) {
  return {
    id: String(item._id),
    reference: item.reference,
    type: item.type,
    amount: item.amount,
    method: item.method,
    transactionId: item.transactionId,
    payoutTransactionId: item.payoutTransactionId,
    status: item.status,
    reviewNote: item.reviewNote,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}


export async function getWalletSummary(userId: string) {
  await connectDB();
  const wallet = await Wallet.findOne({ userId })
    .select("balance cashBalance bonusBalance balanceBucketsInitialized reservedBalance totalWagered totalWon")
    .lean();
  if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
  const buckets = walletBuckets(wallet);
  return {
    balance: roundCredits(buckets.cash + buckets.bonus),
    cashBalance: buckets.cash,
    bonusBalance: buckets.bonus,
    withdrawableBalance: buckets.cash,
    reservedBalance: wallet.reservedBalance,
    totalWagered: wallet.totalWagered,
    totalWon: wallet.totalWon,
    transactions: [],
    creditRequests: [],
  };
}

export async function getWalletSnapshot(userId: string, transactionLimit = 50) {
  await connectDB();
  const [wallet, transactions, requests] = await Promise.all([
    Wallet.findOne({ userId }).select("balance cashBalance bonusBalance balanceBucketsInitialized reservedBalance totalWagered totalWon").lean(),
    WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(transactionLimit).lean(),
    CreditRequest.find({ userId }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);
  if (!wallet) throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
  const buckets = walletBuckets(wallet);
  return {
    balance: roundCredits(buckets.cash + buckets.bonus),
    cashBalance: buckets.cash,
    bonusBalance: buckets.bonus,
    withdrawableBalance: buckets.cash,
    reservedBalance: wallet.reservedBalance,
    totalWagered: wallet.totalWagered,
    totalWon: wallet.totalWon,
    transactions: transactions.map((item) => ({
      id: String(item._id),
      type: item.type,
      amount: item.amount,
      balanceBefore: item.balanceBefore,
      balanceAfter: item.balanceAfter,
      cashBefore: item.cashBefore,
      cashAfter: item.cashAfter,
      bonusBefore: item.bonusBefore,
      bonusAfter: item.bonusAfter,
      balanceKind: item.balanceKind,
      referenceId: item.referenceId,
      description: item.description,
      createdAt: item.createdAt,
    })),
    creditRequests: requests.map((item) => serializeCreditRequest(item as unknown as Record<string, unknown>)),
  };
}

export async function createCreditRequest(input: {
  userId: string;
  type: "TOP_UP" | "WITHDRAWAL";
  amount: number;
  method: PaymentMethod;
  transactionId?: string;
  payerMobile?: string;
  recipientMobile?: string;
  accountTitle?: string;
  paymentProof?: Buffer;
  paymentProofMime?: "image/jpeg" | "image/png" | "image/webp";
  paymentProofSize?: number;
  paymentProofSha256?: string;
  details: Record<string, unknown>;
  idempotencyKey: string;
}) {
  const database = await connectDB();
  const previous = await CreditRequest.findOne({ userId: input.userId, idempotencyKey: input.idempotencyKey }).lean();
  if (previous) return serializeCreditRequest(previous as unknown as Record<string, unknown>);
  const reference = `${input.type === "TOP_UP" ? "TOP" : "WDR"}-${randomBytes(6).toString("hex").toUpperCase()}`;
  let createdId = "";
  try {
    await database.connection.transaction(async (session) => {
      const [request] = await CreditRequest.create([{ ...input, reference, status: "PENDING" }], { session });
      createdId = String(request._id);
      if (input.type === "WITHDRAWAL") {
        await applyWalletChange({
          userId: input.userId,
          amount: -input.amount,
          reservedDelta: input.amount,
          type: "WITHDRAWAL_RESERVE",
          description: `Withdrawable credits reserved for request ${reference}`,
          referenceId: createdId,
          idempotencyKey: `withdrawal:${createdId}:reserve`,
          balanceKind: "CASH",
        }, session);
      }
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const concurrent = await CreditRequest.findOne({ userId: input.userId, idempotencyKey: input.idempotencyKey }).lean();
    if (concurrent) return serializeCreditRequest(concurrent as unknown as Record<string, unknown>);
    throw new ApiError("That transaction ID or receipt screenshot has already been submitted.", 409, "DUPLICATE_PAYMENT_PROOF");
  }
  const created = await CreditRequest.findById(createdId).lean();
  if (!created) throw new ApiError("Request could not be created.", 500, "REQUEST_CREATE_FAILED");
  return serializeCreditRequest(created as unknown as Record<string, unknown>);
}

export async function cancelCreditRequest(userId: string, requestId: string) {
  const database = await connectDB();
  await database.connection.transaction(async (session) => {
    const request = await CreditRequest.findOne({ _id: requestId, userId, status: "PENDING" }).session(session);
    if (!request) throw new ApiError("Only pending requests can be cancelled.", 409, "REQUEST_NOT_CANCELLABLE");
    if (request.type === "TOP_UP") {
      throw new ApiError("A submitted deposit cannot be cancelled because payment verification may already be in progress.", 409, "DEPOSIT_NOT_CANCELLABLE");
    }
    request.status = "CANCELLED";
    await request.save({ session });
    if (request.type === "WITHDRAWAL") {
      await applyWalletChange({
        userId,
        amount: request.amount,
        reservedDelta: -request.amount,
        type: "WITHDRAWAL_REFUND",
        description: `Cancelled withdrawal ${request.reference}`,
        referenceId: String(request._id),
        idempotencyKey: `withdrawal:${request.id}:cancel`,
        balanceKind: "CASH",
      }, session);
    }
  });
}

export async function reviewCreditRequest(input: {
  requestId: string;
  status: "APPROVED" | "REJECTED";
  adminEmail: string;
  reviewNote?: string;
  providerHistoryConfirmed?: boolean;
  amountAndAccountConfirmed?: boolean;
  proofConfirmed?: boolean;
  payoutTransactionId?: string;
  payoutProof?: Buffer;
  payoutProofMime?: "image/jpeg" | "image/png" | "image/webp";
  payoutProofSize?: number;
  payoutProofSha256?: string;
}) {
  const database = await connectDB();
  try {
    await database.connection.transaction(async (session) => {
      const request = await CreditRequest.findOne({ _id: input.requestId, status: "PENDING" })
        .select("+paymentProof +paymentProofMime +paymentProofSize +payerMobile +recipientMobile +accountTitle")
        .session(session);
      if (!request) throw new ApiError("Request is no longer pending.", 409, "REQUEST_ALREADY_REVIEWED");

      if (input.status === "APPROVED") {
        if (!input.providerHistoryConfirmed || !input.amountAndAccountConfirmed || !input.proofConfirmed) {
          throw new ApiError("Complete every payment verification check before approval.", 400, "VERIFICATION_INCOMPLETE");
        }
        if (request.type === "TOP_UP" && (!request.transactionId || !request.paymentProof || !request.payerMobile)) {
          throw new ApiError("This deposit is missing a transaction ID or receipt proof and cannot be approved.", 409, "PAYMENT_PROOF_MISSING");
        }
        if (request.type === "WITHDRAWAL") {
          if (!request.recipientMobile || !request.accountTitle) {
            throw new ApiError("This withdrawal is missing recipient wallet details.", 409, "PAYOUT_DETAILS_MISSING");
          }
          if (!input.payoutTransactionId || !input.payoutProof || !input.payoutProofMime || !input.payoutProofSha256) {
            throw new ApiError("Enter the payout transaction ID and upload the payout receipt before approval.", 400, "PAYOUT_PROOF_REQUIRED");
          }
          request.payoutTransactionId = input.payoutTransactionId;
          request.payoutProof = input.payoutProof;
          request.payoutProofMime = input.payoutProofMime;
          request.payoutProofSize = input.payoutProofSize ?? input.payoutProof.length;
          request.payoutProofSha256 = input.payoutProofSha256;
        }
      }

      request.status = input.status;
      request.reviewedBy = input.adminEmail;
      request.reviewNote = input.reviewNote || null;
      request.reviewedAt = new Date();
      request.verification = {
        providerHistoryConfirmed: input.status === "APPROVED" && Boolean(input.providerHistoryConfirmed),
        amountAndAccountConfirmed: input.status === "APPROVED" && Boolean(input.amountAndAccountConfirmed),
        proofConfirmed: input.status === "APPROVED" && Boolean(input.proofConfirmed),
      };
      await request.save({ session });

      if (request.type === "TOP_UP" && input.status === "APPROVED") {
        await applyWalletChange({
          userId: String(request.userId),
          amount: request.amount,
          type: "TOP_UP",
          description: `Verified ${String(request.method).toLowerCase()} deposit ${request.reference}`,
          referenceId: String(request._id),
          idempotencyKey: `topup:${request.id}:approve`,
          balanceKind: "CASH",
        }, session);
      }
      if (request.type === "WITHDRAWAL") {
        if (input.status === "APPROVED") {
          const wallet = await Wallet.findOne({ userId: request.userId }).session(session);
          if (!wallet || wallet.reservedBalance < request.amount) throw new ApiError("Reserved balance is inconsistent.", 409);
          wallet.reservedBalance = roundCredits(wallet.reservedBalance - request.amount);
          await wallet.save({ session });
        } else {
          await applyWalletChange({
            userId: String(request.userId),
            amount: request.amount,
            reservedDelta: -request.amount,
            type: "WITHDRAWAL_REFUND",
            description: `Rejected withdrawal ${request.reference}`,
            referenceId: String(request._id),
            idempotencyKey: `withdrawal:${request.id}:reject`,
            balanceKind: "CASH",
          }, session);
        }
      }
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ApiError("That payout transaction ID has already been used.", 409, "DUPLICATE_PAYOUT_TRANSACTION_ID");
    }
    throw error;
  }
}
