import { randomBytes } from "node:crypto";
import { Types, type ClientSession } from "mongoose";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { BonusGrant, Referral, User } from "@/models";
import { applyWalletChange } from "@/services/walletService";

export const WELCOME_BONUS_AMOUNT = 500;
export const REFERRAL_REWARD_AMOUNT = 300;

const referralAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateReferralCode(length = 8) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => referralAlphabet[byte % referralAlphabet.length]).join("");
}

function duplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

export async function ensureReferralCode(userId: string) {
  await connectDB();
  const existing = await User.findById(userId).select("referralCode").lean();
  if (!existing) throw new ApiError("User not found.", 404, "USER_NOT_FOUND");
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = generateReferralCode();
    try {
      const updated = await User.findOneAndUpdate(
        { _id: userId, $or: [{ referralCode: null }, { referralCode: { $exists: false } }] },
        { $set: { referralCode } },
        { returnDocument: "after" },
      ).select("referralCode").lean();
      if (updated?.referralCode) return updated.referralCode;
      const raced = await User.findById(userId).select("referralCode").lean();
      if (raced?.referralCode) return raced.referralCode;
    } catch (error) {
      if (!duplicateKey(error)) throw error;
    }
  }
  throw new ApiError("A referral code could not be created.", 503, "REFERRAL_CODE_UNAVAILABLE");
}

export async function findReferrerByCode(code: string) {
  await connectDB();
  return User.findOne({ referralCode: code.trim().toUpperCase(), status: "ACTIVE" })
    .select("_id referralCode +signupFingerprintHash")
    .lean();
}

export async function createPendingReferral(input: {
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
}, session: ClientSession) {
  if (input.referrerUserId === input.referredUserId) {
    throw new ApiError("You cannot refer yourself.", 409, "SELF_REFERRAL");
  }
  const [referral] = await Referral.create([{
    ...input,
    status: "PENDING",
    rewardAmount: REFERRAL_REWARD_AMOUNT,
    verificationReason: "Awaiting new-account anti-abuse checks",
  }], { session });
  return referral;
}

export interface IncentiveResult {
  welcomeAwarded: boolean;
  referralRewarded: boolean;
  referralRejectedReason?: string;
}

export async function finalizeAccountIncentives(
  userId: string,
  session: ClientSession,
): Promise<IncentiveResult> {
  const result: IncentiveResult = { welcomeAwarded: false, referralRewarded: false };
  const user = await User.findById(userId)
    .select("welcomeBonusIssuedAt referredByUserId +signupFingerprintHash")
    .session(session);
  if (!user) return result;

  const welcomeGrantKey = `welcome:${user.id}`;
  let welcomeGrant = await BonusGrant.findOne({ grantKey: welcomeGrantKey })
    .select("+fingerprintHash")
    .session(session);
  let issueWelcomeBonus = false;
  if (!welcomeGrant) {
    [welcomeGrant] = await BonusGrant.create([{
      grantKey: welcomeGrantKey,
      userId: user._id,
      type: "WELCOME",
      amount: WELCOME_BONUS_AMOUNT,
      status: "ISSUED",
      reason: "New-account welcome promotion",
      issuedAt: new Date(),
    }], { session });
    issueWelcomeBonus = true;
  } else if (welcomeGrant.status === "REJECTED") {
    // Repair grants rejected by the former email/device-verification flow.
    welcomeGrant.status = "ISSUED";
    welcomeGrant.reason = "New-account welcome promotion";
    welcomeGrant.fingerprintHash = null;
    welcomeGrant.rejectedAt = null;
    welcomeGrant.issuedAt = new Date();
    await welcomeGrant.save({ session });
    issueWelcomeBonus = true;
  }

  if (issueWelcomeBonus) {
    const { transaction } = await applyWalletChange({
      userId: user.id,
      amount: WELCOME_BONUS_AMOUNT,
      type: "STARTING_BONUS",
      balanceKind: "PROMOTIONAL",
      description: "Rs 500 welcome bonus (promotional, not withdrawable)",
      referenceId: welcomeGrant.id,
      idempotencyKey: welcomeGrantKey,
      metadata: { promotion: "WELCOME", withdrawalAllowed: false },
    }, session);
    welcomeGrant.transactionId = transaction._id;
    await welcomeGrant.save({ session });
    user.welcomeBonusIssuedAt = new Date();
    result.welcomeAwarded = true;
  } else if (!user.welcomeBonusIssuedAt && welcomeGrant.status === "ISSUED") {
    user.welcomeBonusIssuedAt = welcomeGrant.issuedAt ?? new Date();
  }

  const referral = await Referral.findOne({ referredUserId: user._id, status: "PENDING" }).session(session);
  if (referral) {
    const referrer = await User.findById(referral.referrerUserId)
      .select("status referredByUserId +signupFingerprintHash")
      .session(session);
    let rejectedReason = "";
    if (!referrer || referrer.status !== "ACTIVE") rejectedReason = "Referrer account is not active";
    else if (String(referrer._id) === user.id) rejectedReason = "Self-referral is not allowed";
    else if (String(referrer.referredByUserId ?? "") === user.id) rejectedReason = "Referral loops are not allowed";
    else if (user.signupFingerprintHash && referrer.signupFingerprintHash === user.signupFingerprintHash) rejectedReason = "Referrer and referred account use the same device signal";
    else if (welcomeGrant?.status !== "ISSUED") rejectedReason = "Referred account did not pass new-user anti-abuse checks";

    if (rejectedReason) {
      referral.status = "REJECTED";
      referral.verificationReason = rejectedReason;
      referral.rejectedAt = new Date();
      await referral.save({ session });
      result.referralRejectedReason = rejectedReason;
    } else {
      referral.status = "VERIFIED";
      referral.verifiedAt = new Date();
      referral.verificationReason = "New-account checks passed";
      const grantKey = `referral:${referral.id}`;
      const [grant] = await BonusGrant.create([{
        grantKey,
        userId: referral.referrerUserId,
        type: "REFERRAL",
        amount: referral.rewardAmount,
        status: "ISSUED",
        reason: `Qualified referral ${referral.referralCode}`,
        relatedReferralId: referral._id,
        fingerprintHash: user.signupFingerprintHash,
        issuedAt: new Date(),
      }], { session });
      const { transaction } = await applyWalletChange({
        userId: String(referral.referrerUserId),
        amount: referral.rewardAmount,
        type: "REFERRAL_BONUS",
        balanceKind: "PROMOTIONAL",
        description: "Referral reward (promotional, not withdrawable)",
        referenceId: referral.id,
        idempotencyKey: grantKey,
        metadata: { promotion: "REFERRAL", referredUserId: user.id, withdrawalAllowed: false },
      }, session);
      grant.transactionId = transaction._id;
      await grant.save({ session });
      referral.status = "REWARDED";
      referral.transactionId = transaction._id;
      referral.rewardedAt = new Date();
      await referral.save({ session });
      result.referralRewarded = true;
    }
  }

  await user.save({ session });
  return result;
}

export async function getReferralDashboard(userId: string, origin: string) {
  await connectDB();
  const code = await ensureReferralCode(userId);
  const [joined, qualified, earned] = await Promise.all([
    Referral.countDocuments({ referrerUserId: userId }),
    Referral.countDocuments({ referrerUserId: userId, status: { $in: ["VERIFIED", "REWARDED"] } }),
    Referral.aggregate<{ total: number }>([
      { $match: { referrerUserId: new Types.ObjectId(userId), status: "REWARDED" } },
      { $group: { _id: null, total: { $sum: "$rewardAmount" } } },
    ]),
  ]);
  const referralLink = `${origin.replace(/\/$/, "")}/register?ref=${encodeURIComponent(code)}`;
  return { code, referralLink, joined, qualified, earned: earned[0]?.total ?? 0 };
}
