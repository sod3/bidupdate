import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const objectId = Schema.Types.ObjectId;

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, unique: true, minlength: 3, maxlength: 24 },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 120 },
    emailIdentityHash: { type: String, unique: true, sparse: true, select: false },
    passwordHash: { type: String, required: true, select: false },
    dateOfBirth: { type: Date, required: true },
    country: { type: String, required: true, trim: true, maxlength: 80 },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE", index: true },
    referralCode: { type: String, uppercase: true, trim: true, unique: true, sparse: true, maxlength: 12 },
    referredByUserId: { type: objectId, ref: "User", default: null, index: true, immutable: true },
    signupFingerprintHash: { type: String, default: null, select: false },
    welcomeBonusIssuedAt: { type: Date, default: null },
    preferences: {
      quality: { type: String, enum: ["AUTO", "LOW", "MEDIUM", "HIGH", "ULTRA"], default: "AUTO" },
      muted: { type: Boolean, default: false },
      musicEnabled: { type: Boolean, default: true },
      sfxEnabled: { type: Boolean, default: true },
      reducedMotion: { type: Boolean, default: false },
      hideFromLeaderboard: { type: Boolean, default: false },
    },
    responsiblePlay: {
      sessionTimerMinutes: { type: Number, min: 15, max: 360, default: 60 },
      dailyLossLimit: { type: Number, min: 0, default: null },
      weeklyLossLimit: { type: Number, min: 0, default: null },
      coolingOffUntil: { type: Date, default: null },
      selfExcludedUntil: { type: Date, default: null },
    },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
userSchema.index({ username: "text", email: "text", fullName: "text" });

const authSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true, select: false },
    kind: { type: String, enum: ["USER", "ADMIN"], required: true, index: true },
    userId: { type: objectId, ref: "User", default: null, index: true },
    email: { type: String, required: true, lowercase: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    fingerprintHash: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);

const walletSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, unique: true, index: true },
    balance: { type: Number, min: 0, default: 0 },
    cashBalance: { type: Number, min: 0, default: 0 },
    bonusBalance: { type: Number, min: 0, default: 0 },
    balanceBucketsInitialized: { type: Boolean, default: false },
    reservedBalance: { type: Number, min: 0, default: 0 },
    totalWagered: { type: Number, min: 0, default: 0 },
    totalWon: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

const walletTransactionSchema = new Schema(
  {
    walletId: { type: objectId, ref: "Wallet", required: true, index: true },
    userId: { type: objectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "STARTING_BONUS",
        "REFERRAL_BONUS",
        "RACE_ENTRY",
        "RACE_REWARD",
        "ADMIN_ADJUSTMENT",
        "TOP_UP",
        "WITHDRAWAL_RESERVE",
        "WITHDRAWAL_REFUND",
      ],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    cashBefore: { type: Number, min: 0, default: 0 },
    cashAfter: { type: Number, min: 0, default: 0 },
    bonusBefore: { type: Number, min: 0, default: 0 },
    bonusAfter: { type: Number, min: 0, default: 0 },
    balanceKind: { type: String, enum: ["CASH", "PROMOTIONAL", "MIXED"], default: "CASH" },
    referenceId: { type: String, default: null, index: true },
    idempotencyKey: { type: String, default: null, unique: true, sparse: true },
    description: { type: String, required: true, maxlength: 240 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
walletTransactionSchema.index({ userId: 1, createdAt: -1 });

const leaderboardBotSchema = new Schema(
  {
    botId: { type: String, required: true, unique: true, index: true },
    game: { type: String, enum: ["RACING", "ARCHERY", "POOL", "TOWER", "PENALTY"], required: true, index: true },
    username: { type: String, required: true, trim: true, maxlength: 24 },
    balance: { type: Number, min: 0, required: true },
    wins: { type: Number, min: 0, required: true },
    losses: { type: Number, min: 0, required: true },
    xp: { type: Number, min: 0, required: true },
    rankPoints: { type: Number, min: 0, required: true },
    winStreak: { type: Number, min: 0, default: 0 },
    bestTimeMs: { type: Number, min: 0, default: null },
    bestScore: { type: Number, min: 0, default: 0 },
    rankName: { type: String, required: true },
    lastTick: { type: Number, required: true, index: true },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);
leaderboardBotSchema.index({ game: 1, rankPoints: -1, wins: -1 });

const creditRequestSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, index: true },
    reference: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ["TOP_UP", "WITHDRAWAL"], required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["MANUAL_REVIEW", "JAZZCASH", "EASYPAISA"], default: "MANUAL_REVIEW" },
    transactionId: { type: String, uppercase: true, trim: true, maxlength: 80, default: null },
    payerMobile: { type: String, trim: true, maxlength: 16, default: null, select: false },
    recipientMobile: { type: String, trim: true, maxlength: 16, default: null, select: false },
    accountTitle: { type: String, trim: true, maxlength: 80, default: null, select: false },
    paymentProof: { type: Buffer, default: null, select: false },
    paymentProofMime: { type: String, enum: ["image/jpeg", "image/png", "image/webp"], default: null, select: false },
    paymentProofSize: { type: Number, min: 0, default: null, select: false },
    paymentProofSha256: { type: String, maxlength: 64, default: null, select: false },
    payoutTransactionId: { type: String, uppercase: true, trim: true, maxlength: 80, default: null },
    payoutProof: { type: Buffer, default: null, select: false },
    payoutProofMime: { type: String, enum: ["image/jpeg", "image/png", "image/webp"], default: null, select: false },
    payoutProofSize: { type: Number, min: 0, default: null, select: false },
    payoutProofSha256: { type: String, maxlength: 64, default: null, select: false },
    verification: {
      providerHistoryConfirmed: { type: Boolean, default: false },
      amountAndAccountConfirmed: { type: Boolean, default: false },
      proofConfirmed: { type: Boolean, default: false },
    },
    details: { type: Schema.Types.Mixed, default: {}, select: false },
    idempotencyKey: { type: String, default: null, unique: true, sparse: true, select: false },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"], default: "PENDING", index: true },
    reviewedBy: { type: String, default: null },
    reviewNote: { type: String, default: null, maxlength: 240 },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
creditRequestSchema.index({ userId: 1, createdAt: -1 });
creditRequestSchema.index(
  { method: 1, transactionId: 1 },
  { unique: true, partialFilterExpression: { transactionId: { $type: "string" } } },
);
creditRequestSchema.index(
  { method: 1, paymentProofSha256: 1 },
  { unique: true, partialFilterExpression: { paymentProofSha256: { $type: "string" } } },
);
creditRequestSchema.index(
  { method: 1, payoutTransactionId: 1 },
  { unique: true, partialFilterExpression: { payoutTransactionId: { $type: "string" } } },
);

const bonusGrantSchema = new Schema(
  {
    grantKey: { type: String, required: true, unique: true, index: true, maxlength: 120 },
    userId: { type: objectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["WELCOME", "REFERRAL"], required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["ISSUED", "REJECTED"], required: true, index: true },
    reason: { type: String, required: true, maxlength: 240 },
    transactionId: { type: objectId, ref: "WalletTransaction", default: null, index: true },
    relatedReferralId: { type: objectId, ref: "Referral", default: null, index: true },
    fingerprintHash: { type: String, default: null, index: true, select: false },
    issuedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
bonusGrantSchema.index({ userId: 1, type: 1, createdAt: -1 });
bonusGrantSchema.index(
  { fingerprintHash: 1, type: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { fingerprintHash: { $type: "string" }, type: "WELCOME", status: "ISSUED" },
  },
);

const referralSchema = new Schema(
  {
    referrerUserId: { type: objectId, ref: "User", required: true, index: true, immutable: true },
    referredUserId: { type: objectId, ref: "User", required: true, unique: true, index: true, immutable: true },
    referralCode: { type: String, required: true, uppercase: true, trim: true, maxlength: 12, immutable: true },
    status: { type: String, enum: ["PENDING", "VERIFIED", "REWARDED", "REJECTED"], default: "PENDING", index: true },
    rewardAmount: { type: Number, required: true, min: 0, default: 300 },
    verificationReason: { type: String, default: "Awaiting new-account checks", maxlength: 240 },
    transactionId: { type: objectId, ref: "WalletTransaction", default: null, index: true },
    verifiedAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
referralSchema.index({ referrerUserId: 1, createdAt: -1 });
referralSchema.index({ referrerUserId: 1, referredUserId: 1 }, { unique: true });

const supportTicketSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    subject: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 3000 },
    status: { type: String, enum: ["OPEN", "IN_PROGRESS", "RESOLVED"], default: "OPEN", index: true },
    adminNote: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true, versionKey: false },
);

const siteSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String, default: null, maxlength: 240 },
    isPublic: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, versionKey: false },
);

const auditLogSchema = new Schema(
  {
    actor: { type: String, enum: ["ADMIN", "USER", "SYSTEM"], required: true, index: true },
    actorEmail: { type: String, default: null },
    userId: { type: objectId, ref: "User", default: null, index: true },
    action: { type: String, required: true, index: true, maxlength: 80 },
    targetType: { type: String, required: true, maxlength: 60 },
    targetId: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
    fingerprintHash: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
auditLogSchema.index({ createdAt: -1 });

const rateLimitSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    count: { type: Number, required: true, default: 1 },
    resetAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false },
);

const racingProfileSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, unique: true, index: true },
    level: { type: Number, min: 1, default: 1 },
    xp: { type: Number, min: 0, default: 0 },
    rank: { type: String, enum: ["Bronze III", "Bronze II", "Bronze I", "Silver III", "Silver II", "Silver I", "Gold III", "Gold II", "Gold I", "Platinum", "Diamond", "Master", "Legend"], default: "Bronze III", index: true },
    rankPoints: { type: Number, min: 0, default: 0 },
    wins: { type: Number, min: 0, default: 0 },
    losses: { type: Number, min: 0, default: 0 },
    winStreak: { type: Number, min: 0, default: 0 },
    bestWinStreak: { type: Number, min: 0, default: 0 },
    bestTimeMs: { type: Number, min: 0, default: null },
    totalDriftScore: { type: Number, min: 0, default: 0 },
    perfectDrifts: { type: Number, min: 0, default: 0 },
    nearMisses: { type: Number, min: 0, default: 0 },
    topSpeedKmh: { type: Number, min: 0, default: 0 },
    selectedVehicleId: { type: String, default: "nightfang" },
  },
  { timestamps: true, versionKey: false },
);

const penaltyProfileSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, unique: true, index: true },
    level: { type: Number, min: 1, default: 1 },
    xp: { type: Number, min: 0, default: 0 },
    rank: { type: String, enum: ["Bronze III", "Bronze II", "Bronze I", "Silver III", "Silver II", "Silver I", "Gold III", "Gold II", "Gold I", "Platinum", "Diamond", "Master", "Legend"], default: "Bronze III", index: true },
    rankPoints: { type: Number, min: 0, default: 0 },
    wins: { type: Number, min: 0, default: 0 },
    losses: { type: Number, min: 0, default: 0 },
    winStreak: { type: Number, min: 0, default: 0 },
    bestWinStreak: { type: Number, min: 0, default: 0 },
    goals: { type: Number, min: 0, default: 0 },
    saves: { type: Number, min: 0, default: 0 },
    shots: { type: Number, min: 0, default: 0 },
    perfectShots: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

const poolProfileSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, unique: true, index: true },
    level: { type: Number, min: 1, default: 1 },
    xp: { type: Number, min: 0, default: 0 },
    rank: { type: String, enum: ["Bronze III", "Bronze II", "Bronze I", "Silver III", "Silver II", "Silver I", "Gold III", "Gold II", "Gold I", "Platinum", "Diamond", "Master", "Legend"], default: "Bronze III", index: true },
    rankPoints: { type: Number, min: 0, default: 0 },
    wins: { type: Number, min: 0, default: 0 },
    losses: { type: Number, min: 0, default: 0 },
    winStreak: { type: Number, min: 0, default: 0 },
    bestWinStreak: { type: Number, min: 0, default: 0 },
    ballsPotted: { type: Number, min: 0, default: 0 },
    bankShots: { type: Number, min: 0, default: 0 },
    trickShots: { type: Number, min: 0, default: 0 },
    breakAndRuns: { type: Number, min: 0, default: 0 },
    fouls: { type: Number, min: 0, default: 0 },
    bestClearanceMs: { type: Number, min: 0, default: null },
    selectedCueId: { type: String, default: "house" },
    selectedTableId: { type: String, default: "emerald" },
    selectedBallSkinId: { type: String, default: "tournament" },
    unlockedAchievementIds: [{ type: String }],
    dailyKey: { type: String, default: "" },
    daily: {
      pots: { type: Number, min: 0, default: 0 },
      banks: { type: Number, min: 0, default: 0 },
      wins: { type: Number, min: 0, default: 0 },
    },
  },
  { timestamps: true, versionKey: false },
);

const towerProfileSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, unique: true, index: true },
    level: { type: Number, min: 1, default: 1 },
    xp: { type: Number, min: 0, default: 0 },
    rank: { type: String, enum: ["Rookie", "Warrior", "Knight", "Commander", "King", "Legend"], default: "Rookie", index: true },
    rankPoints: { type: Number, min: 0, default: 0 },
    wins: { type: Number, min: 0, default: 0 },
    losses: { type: Number, min: 0, default: 0 },
    winStreak: { type: Number, min: 0, default: 0 },
    bestWinStreak: { type: Number, min: 0, default: 0 },
    castlesDestroyed: { type: Number, min: 0, default: 0 },
    damageDealt: { type: Number, min: 0, default: 0 },
    criticalHits: { type: Number, min: 0, default: 0 },
    partsDestroyed: { type: Number, min: 0, default: 0 },
    projectilesFired: { type: Number, min: 0, default: 0 },
    abilitiesUsed: { type: Number, min: 0, default: 0 },
    bestVictoryMs: { type: Number, min: 0, default: null },
    highestDamageShot: { type: Number, min: 0, default: 0 },
    selectedCannonId: { type: String, default: "oak-breaker" },
    selectedProjectileSkinId: { type: String, default: "forged" },
    selectedCastleId: { type: String, default: "highland-keep" },
    selectedArenaId: { type: String, default: "moonfall" },
    unlockedAchievementIds: [{ type: String }],
    dailyKey: { type: String, default: "" },
    daily: {
      damage: { type: Number, min: 0, default: 0 },
      criticals: { type: Number, min: 0, default: 0 },
      wins: { type: Number, min: 0, default: 0 },
    },
  },
  { timestamps: true, versionKey: false },
);

const archeryProfileSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, unique: true, index: true },
    level: { type: Number, min: 1, default: 1 },
    xp: { type: Number, min: 0, default: 0 },
    rank: { type: String, enum: ["Rookie", "Ranger", "Hunter", "Marksman", "Champion", "Legend"], default: "Rookie", index: true },
    rankPoints: { type: Number, min: 0, default: 0 },
    wins: { type: Number, min: 0, default: 0 },
    losses: { type: Number, min: 0, default: 0 },
    winStreak: { type: Number, min: 0, default: 0 },
    bestWinStreak: { type: Number, min: 0, default: 0 },
    totalScore: { type: Number, min: 0, default: 0 },
    bullseyes: { type: Number, min: 0, default: 0 },
    perfectShots: { type: Number, min: 0, default: 0 },
    longRangeShots: { type: Number, min: 0, default: 0 },
    arrowsFired: { type: Number, min: 0, default: 0 },
    bestDuelScore: { type: Number, min: 0, default: 0 },
    selectedBowId: { type: String, default: "field-recurve" },
    selectedArrowId: { type: String, default: "cedar" },
    selectedTargetId: { type: String, default: "classic" },
    selectedCosmeticId: { type: String, default: "valley-scout" },
    selectedEnvironmentId: { type: String, default: "mountain-valley" },
    unlockedAchievementIds: [{ type: String }],
    dailyKey: { type: String, default: "" },
    daily: {
      score: { type: Number, min: 0, default: 0 },
      bullseyes: { type: Number, min: 0, default: 0 },
      wins: { type: Number, min: 0, default: 0 },
    },
  },
  { timestamps: true, versionKey: false },
);

const vehicleSchema = new Schema(
  {
    vehicleId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    color: { type: String, required: true },
    accent: { type: String, required: true },
    stats: { acceleration: Number, topSpeed: Number, handling: Number, nitro: Number },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

const ownedVehicleSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, index: true },
    vehicleId: { type: String, required: true, index: true },
    paint: { type: String, default: null },
    underglow: { type: String, default: null },
    rims: { type: String, default: "street" },
    spoiler: { type: String, default: "stock" },
    decal: { type: String, default: "none" },
    nitroEffect: { type: String, default: "ion" },
  },
  { timestamps: true, versionKey: false },
);
ownedVehicleSchema.index({ userId: 1, vehicleId: 1 }, { unique: true });

const cosmeticSchema = new Schema(
  {
    cosmeticId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    slot: { type: String, enum: ["PAINT", "WHEELS", "UNDERGLOW", "DECAL", "NITRO", "VICTORY"], required: true, index: true },
    rarity: { type: String, enum: ["COMMON", "RARE", "EPIC", "LEGENDARY"], default: "COMMON" },
    config: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

const ownedCosmeticSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, index: true },
    cosmeticId: { type: String, required: true, index: true },
    unlockedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);
ownedCosmeticSchema.index({ userId: 1, cosmeticId: 1 }, { unique: true });

const competitionTierSchema = new Schema(
  {
    tierId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    entryCredits: { type: Number, required: true, min: 0 },
    prizePool: { type: Number, required: true, min: 0 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

const trackSchema = new Schema(
  {
    trackId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    distanceMeters: { type: Number, required: true },
    checkpointMeters: [{ type: Number, required: true }],
    environment: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

const raceMatchSchema = new Schema(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    tierId: { type: String, required: true, index: true },
    trackId: { type: String, required: true, index: true },
    environmentSeed: { type: Number, required: true },
    entryCredits: { type: Number, required: true },
    prizePool: { type: Number, required: true },
    playerIds: [{ type: objectId, ref: "User", required: true }],
    winnerId: { type: objectId, ref: "User", default: null, index: true },
    status: { type: String, enum: ["COUNTDOWN", "RACING", "COMPLETED", "ABANDONED"], default: "COUNTDOWN", index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    photoFinish: { type: Boolean, default: false },
    differenceMs: { type: Number, default: null },
    aiOpponent: { type: Schema.Types.Mixed, default: null },
    aiTargetTimeMs: { type: Number, min: 0, default: null },
  },
  { timestamps: true, versionKey: false },
);

const penaltyMatchSchema = new Schema(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    tierId: { type: String, required: true, index: true },
    stadiumId: { type: String, default: "champions-arena", index: true },
    environmentSeed: { type: Number, required: true },
    entryCredits: { type: Number, required: true },
    prizePool: { type: Number, required: true },
    playerIds: [{ type: objectId, ref: "User", required: true }],
    winnerId: { type: objectId, ref: "User", default: null, index: true },
    status: { type: String, enum: ["COUNTDOWN", "PLAYING", "COMPLETED", "ABANDONED"], default: "COUNTDOWN", index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    suddenDeath: { type: Boolean, default: false },
    rounds: { type: Number, min: 0, default: 0 },
    scores: { type: Schema.Types.Mixed, default: {} },
    histories: { type: Schema.Types.Mixed, default: {} },
    players: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, versionKey: false },
);

const poolMatchSchema = new Schema(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    tierId: { type: String, required: true, index: true },
    roomId: { type: String, default: "midnight-lounge", index: true },
    environmentSeed: { type: Number, required: true },
    entryCredits: { type: Number, required: true },
    possibleReward: { type: Number, required: true },
    playerIds: [{ type: objectId, ref: "User", required: true }],
    winnerId: { type: objectId, ref: "User", default: null, index: true },
    winnerType: { type: String, enum: ["PLAYER", "AI"], default: null },
    status: { type: String, enum: ["COUNTDOWN", "PLAYING", "COMPLETED", "ABANDONED"], default: "COUNTDOWN", index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, min: 0, default: null },
    aiFavored: { type: Boolean, default: true },
    cueId: { type: String, default: "house" },
    tableDesignId: { type: String, default: "emerald" },
    ballSkinId: { type: String, default: "tournament" },
    stats: { type: Schema.Types.Mixed, default: {} },
    players: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, versionKey: false },
);

const towerMatchSchema = new Schema(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    tierId: { type: String, required: true, index: true },
    arenaId: { type: String, default: "moonfall", index: true },
    environmentSeed: { type: Number, required: true },
    entryCredits: { type: Number, required: true },
    possibleReward: { type: Number, required: true },
    playerIds: [{ type: objectId, ref: "User", required: true }],
    winnerId: { type: objectId, ref: "User", default: null, index: true },
    winnerType: { type: String, enum: ["PLAYER", "AI"], default: null },
    status: { type: String, enum: ["COUNTDOWN", "PLAYING", "COMPLETED", "ABANDONED"], default: "COUNTDOWN", index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, min: 0, default: null },
    aiFavored: { type: Boolean, default: true },
    cannonId: { type: String, default: "oak-breaker" },
    castleId: { type: String, default: "highland-keep" },
    projectileSkinId: { type: String, default: "forged" },
    stats: { type: Schema.Types.Mixed, default: {} },
    players: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, versionKey: false },
);

const archeryMatchSchema = new Schema(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    tierId: { type: String, required: true, index: true },
    environmentId: { type: String, default: "mountain-valley", index: true },
    environmentSeed: { type: Number, required: true },
    entryCredits: { type: Number, required: true },
    possibleReward: { type: Number, required: true },
    playerIds: [{ type: objectId, ref: "User", required: true }],
    winnerId: { type: objectId, ref: "User", default: null, index: true },
    winnerType: { type: String, enum: ["PLAYER", "AI"], default: null },
    status: { type: String, enum: ["COUNTDOWN", "PLAYING", "COMPLETED", "ABANDONED"], default: "COUNTDOWN", index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, min: 0, default: null },
    aiFavored: { type: Boolean, default: true },
    bowId: { type: String, default: "field-recurve" },
    arrowId: { type: String, default: "cedar" },
    targetId: { type: String, default: "classic" },
    cosmeticId: { type: String, default: "valley-scout" },
    scores: { type: Schema.Types.Mixed, default: {} },
    stats: { type: Schema.Types.Mixed, default: {} },
    players: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, versionKey: false },
);

const teenPattiRoundSchema = new Schema(
  {
    roundId: { type: String, required: true, unique: true, index: true },
    userId: { type: objectId, ref: "User", required: true, index: true },
    activeKey: { type: String, unique: true, sparse: true, default: undefined },
    startRequestId: { type: String, required: true, unique: true },
    status: { type: String, enum: ["PLAYING", "COMPLETED"], default: "PLAYING", index: true },
    stakePreset: { type: Number, enum: [50, 100, 250, 500], required: true },
    pot: { type: Number, min: 0, required: true },
    currentBet: { type: Number, min: 0, required: true },
    playerPaid: { type: Number, min: 0, required: true },
    payout: { type: Number, min: 0, default: 0 },
    actionCount: { type: Number, min: 0, default: 0 },
    playerBetTurns: { type: Number, min: 0, default: 0 },
    turnPlayerId: { type: String, default: "PLAYER" },
    players: { type: Schema.Types.Mixed, required: true },
    actionHistory: { type: Schema.Types.Mixed, default: [] },
    processedRequestIds: [{ type: String, required: true }],
    lastActionBatch: { type: Schema.Types.Mixed, default: [] },
    winner: { type: Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: Date.now, required: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: "__v" },
);
teenPattiRoundSchema.index({ userId: 1, createdAt: -1 });

const slotSpinSchema = new Schema(
  {
    spinId: { type: String, required: true, unique: true, index: true },
    userId: { type: objectId, ref: "User", required: true, index: true },
    requestId: { type: String, required: true },
    stake: { type: Number, enum: [10, 25, 50, 100, 250, 500], required: true },
    grid: { type: Schema.Types.Mixed, required: true },
    winningLines: { type: Schema.Types.Mixed, default: [] },
    totalMultiplier: { type: Number, min: 0, required: true },
    payout: { type: Number, min: 0, required: true },
    net: { type: Number, required: true },
    result: { type: String, enum: ["LOSS", "WIN", "JACKPOT"], required: true, index: true },
    balanceAfter: { type: Number, min: 0, required: true },
    rngVersion: { type: String, required: true },
    completedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true, versionKey: false },
);
slotSpinSchema.index({ userId: 1, requestId: 1 }, { unique: true });
slotSpinSchema.index({ userId: 1, createdAt: -1 });

const gameSchema = new Schema(
  {
    gameId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, maxlength: 80 },
    category: { type: String, enum: ["REELS", "TABLE", "CASUAL", "SKILL"], required: true, index: true },
    enabled: { type: Boolean, default: true, index: true },
    maintenanceMode: { type: Boolean, default: false, index: true },
    artwork: { type: String, required: true, maxlength: 240 },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true, versionKey: false },
);

const gameSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: objectId, ref: "User", required: true, index: true },
    gameId: { type: String, required: true, index: true },
    status: { type: String, enum: ["ACTIVE", "DISCONNECTED", "CLOSED"], default: "ACTIVE", index: true },
    activeRoundId: { type: String, default: null, index: true },
    connectedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    disconnectedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
gameSessionSchema.index({ userId: 1, gameId: 1, status: 1 });

const gameRoundSchema = new Schema(
  {
    roundId: { type: String, required: true, unique: true, index: true },
    requestId: { type: String, required: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true, immutable: true },
    userId: { type: objectId, ref: "User", required: true, index: true },
    gameId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    status: { type: String, enum: ["PLAYING", "COMPLETED", "VOID"], required: true, index: true },
    phase: { type: String, enum: ["BETTING", "ANIMATING", "RESULT"], default: "ANIMATING" },
    totalStake: { type: Number, required: true, min: 0 },
    payout: { type: Number, required: true, min: 0, default: 0 },
    net: { type: Number, required: true, default: 0 },
    result: { type: String, enum: ["PENDING", "WIN", "LOSS", "PUSH", "VOID"], default: "PENDING", index: true },
    resultLabel: { type: String, default: null, maxlength: 120 },
    selections: { type: Schema.Types.Mixed, required: true },
    outcome: { type: Schema.Types.Mixed, default: null },
    rngVersion: { type: String, required: true },
    rngCommitment: { type: String, required: true, index: true },
    rngSeed: { type: String, required: true, select: false },
    serverResultHash: { type: String, default: null, index: true },
    balanceAfter: { type: Number, min: 0, required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, default: null, index: true },
    crashMultiplier: { type: Number, min: 1, max: 100, default: null, select: false },
    cashedOutMultiplier: { type: Number, min: 1, max: 100, default: null },
  },
  { timestamps: true, versionKey: false },
);
gameRoundSchema.index({ userId: 1, gameId: 1, requestId: 1 }, { unique: true });
gameRoundSchema.index({ userId: 1, gameId: 1, createdAt: -1 });
gameRoundSchema.index(
  { userId: 1, gameId: 1, status: 1 },
  { name: "one_playing_premium_round", unique: true, partialFilterExpression: { status: "PLAYING" } },
);

const gameBetSchema = new Schema(
  {
    betId: { type: String, required: true, unique: true, index: true },
    roundId: { type: String, required: true, index: true, immutable: true },
    userId: { type: objectId, ref: "User", required: true, index: true, immutable: true },
    gameId: { type: String, required: true, index: true, immutable: true },
    amount: { type: Number, required: true, min: 0, immutable: true },
    status: { type: String, enum: ["ACCEPTED", "SETTLED", "VOID"], default: "ACCEPTED", index: true },
    payout: { type: Number, min: 0, default: 0 },
    idempotencyKey: { type: String, required: true, unique: true, index: true, immutable: true },
    acceptedAt: { type: Date, default: Date.now, immutable: true },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

const betSelectionSchema = new Schema(
  {
    betId: { type: String, required: true, index: true, immutable: true },
    roundId: { type: String, required: true, index: true, immutable: true },
    userId: { type: objectId, ref: "User", required: true, index: true, immutable: true },
    gameId: { type: String, required: true, index: true, immutable: true },
    selectionId: { type: String, required: true, maxlength: 80, immutable: true },
    amount: { type: Number, required: true, min: 0, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
betSelectionSchema.index({ betId: 1, selectionId: 1 }, { unique: true });

const gameResultSchema = new Schema(
  {
    roundId: { type: String, required: true, unique: true, index: true, immutable: true },
    userId: { type: objectId, ref: "User", required: true, index: true, immutable: true },
    gameId: { type: String, required: true, index: true, immutable: true },
    result: { type: String, enum: ["WIN", "LOSS", "PUSH", "VOID"], required: true, index: true, immutable: true },
    resultLabel: { type: String, required: true, maxlength: 120, immutable: true },
    totalStake: { type: Number, required: true, min: 0, immutable: true },
    payout: { type: Number, required: true, min: 0, immutable: true },
    winningOptions: { type: [String], default: [], immutable: true },
    payload: { type: Schema.Types.Mixed, required: true, immutable: true },
    settledAt: { type: Date, default: Date.now, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

const playerGameStatSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, index: true },
    gameId: { type: String, required: true, index: true },
    rounds: { type: Number, min: 0, default: 0 },
    wins: { type: Number, min: 0, default: 0 },
    losses: { type: Number, min: 0, default: 0 },
    pushes: { type: Number, min: 0, default: 0 },
    totalStaked: { type: Number, min: 0, default: 0 },
    totalPaid: { type: Number, min: 0, default: 0 },
    biggestWin: { type: Number, min: 0, default: 0 },
    lastPlayedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
playerGameStatSchema.index({ userId: 1, gameId: 1 }, { unique: true });

const gameHistorySchema = new Schema(
  {
    roundId: { type: String, required: true, unique: true, index: true, immutable: true },
    userId: { type: objectId, ref: "User", required: true, index: true, immutable: true },
    gameId: { type: String, required: true, index: true, immutable: true },
    result: { type: String, enum: ["WIN", "LOSS", "PUSH", "VOID"], required: true, index: true, immutable: true },
    label: { type: String, required: true, maxlength: 120, immutable: true },
    stake: { type: Number, required: true, min: 0, immutable: true },
    payout: { type: Number, required: true, min: 0, immutable: true },
    multiplier: { type: Number, required: true, min: 0, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
gameHistorySchema.index({ userId: 1, gameId: 1, createdAt: -1 });

const rngRoundSchema = new Schema(
  {
    roundId: { type: String, required: true, unique: true, index: true, immutable: true },
    gameId: { type: String, required: true, index: true, immutable: true },
    userId: { type: objectId, ref: "User", required: true, index: true, immutable: true },
    version: { type: String, required: true, immutable: true },
    commitment: { type: String, required: true, index: true, immutable: true },
    seed: { type: String, required: true, select: false, immutable: true },
    resultHash: { type: String, default: null, index: true },
    revealedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

const gameBonusSchema = new Schema(
  {
    bonusId: { type: String, required: true, unique: true, index: true },
    userId: { type: objectId, ref: "User", required: true, index: true },
    gameId: { type: String, required: true, index: true },
    type: { type: String, required: true, maxlength: 60 },
    value: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["LOCKED", "AVAILABLE", "CLAIMED", "EXPIRED"], default: "LOCKED", index: true },
    sourceRoundId: { type: String, default: null, index: true },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false },
);

const gameSettingSchema = new Schema(
  {
    gameId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: true, index: true },
    maintenanceMode: { type: Boolean, default: false, index: true },
    minStake: { type: Number, min: 1, required: true },
    maxStake: { type: Number, min: 1, required: true },
    chipDenominations: { type: [Number], required: true },
    artwork: { type: String, default: null, maxlength: 240 },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

const fraudFlagSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, index: true },
    gameId: { type: String, default: null, index: true },
    roundId: { type: String, default: null, index: true },
    code: { type: String, required: true, index: true, maxlength: 80 },
    severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true, index: true },
    status: { type: String, enum: ["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"], default: "OPEN", index: true },
    evidence: { type: Schema.Types.Mixed, default: {} },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

const raceParticipantSchema = new Schema(
  {
    matchId: { type: String, required: true, index: true },
    userId: { type: objectId, ref: "User", required: true, index: true },
    username: { type: String, required: true },
    vehicleId: { type: String, required: true },
    finishTimeMs: { type: Number, default: null },
    result: { type: String, enum: ["WIN", "LOSS", "DNF", "PENDING"], default: "PENDING" },
    stats: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);
raceParticipantSchema.index({ matchId: 1, userId: 1 }, { unique: true });

const raceCheckpointSchema = new Schema(
  {
    matchId: { type: String, required: true, index: true },
    userId: { type: objectId, ref: "User", required: true, index: true },
    checkpoint: { type: Number, required: true },
    raceTimeMs: { type: Number, required: true },
    position: { x: Number, z: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
raceCheckpointSchema.index({ matchId: 1, userId: 1, checkpoint: 1 }, { unique: true });

const missionSchema = new Schema(
  {
    missionId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    metric: { type: String, required: true },
    target: { type: Number, required: true },
    xpReward: { type: Number, required: true },
    cadence: { type: String, enum: ["DAILY", "WEEKLY", "PERMANENT"], required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

const missionProgressSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, index: true },
    missionId: { type: String, required: true, index: true },
    progress: { type: Number, min: 0, default: 0 },
    completedAt: { type: Date, default: null },
    periodKey: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);
missionProgressSchema.index({ userId: 1, missionId: 1, periodKey: 1 }, { unique: true });

const achievementSchema = new Schema(
  {
    achievementId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    metric: { type: String, required: true },
    target: { type: Number, required: true },
  },
  { timestamps: true, versionKey: false },
);

const playerAchievementSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, index: true },
    achievementId: { type: String, required: true, index: true },
    unlockedAt: { type: Date, default: Date.now },
    matchId: { type: String, default: null },
  },
  { timestamps: false, versionKey: false },
);
playerAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

const matchmakingQueueSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, index: true },
    tierId: { type: String, required: true, index: true },
    socketId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: false, versionKey: false },
);

const antiCheatLogSchema = new Schema(
  {
    matchId: { type: String, required: true, index: true },
    userId: { type: objectId, ref: "User", required: true, index: true },
    rule: { type: String, required: true, index: true },
    severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true },
    telemetry: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

const reportSchema = new Schema(
  {
    matchId: { type: String, required: true, index: true },
    reporterId: { type: objectId, ref: "User", required: true, index: true },
    reportedUserId: { type: objectId, ref: "User", required: true, index: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ["OPEN", "REVIEWED", "DISMISSED", "ACTIONED"], default: "OPEN", index: true },
  },
  { timestamps: true, versionKey: false },
);

function existingModel<T>(name: string, schema: Schema<T>) {
  return (models[name] as Model<T> | undefined) ?? model<T>(name, schema);
}

export type UserDocument = InferSchemaType<typeof userSchema>;
export type AuthSessionDocument = InferSchemaType<typeof authSessionSchema>;
export type WalletDocument = InferSchemaType<typeof walletSchema>;
export type WalletTransactionDocument = InferSchemaType<typeof walletTransactionSchema>;
export type LeaderboardBotDocument = InferSchemaType<typeof leaderboardBotSchema>;
export type CreditRequestDocument = InferSchemaType<typeof creditRequestSchema>;
export type BonusGrantDocument = InferSchemaType<typeof bonusGrantSchema>;
export type ReferralDocument = InferSchemaType<typeof referralSchema>;
export type SupportTicketDocument = InferSchemaType<typeof supportTicketSchema>;
export type SiteSettingDocument = InferSchemaType<typeof siteSettingSchema>;
export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export type RateLimitDocument = InferSchemaType<typeof rateLimitSchema>;
export type RacingProfileDocument = InferSchemaType<typeof racingProfileSchema>;
export type PenaltyProfileDocument = InferSchemaType<typeof penaltyProfileSchema>;
export type PoolProfileDocument = InferSchemaType<typeof poolProfileSchema>;
export type TowerProfileDocument = InferSchemaType<typeof towerProfileSchema>;
export type ArcheryProfileDocument = InferSchemaType<typeof archeryProfileSchema>;
export type VehicleDocument = InferSchemaType<typeof vehicleSchema>;
export type OwnedVehicleDocument = InferSchemaType<typeof ownedVehicleSchema>;
export type CosmeticDocument = InferSchemaType<typeof cosmeticSchema>;
export type OwnedCosmeticDocument = InferSchemaType<typeof ownedCosmeticSchema>;
export type CompetitionTierDocument = InferSchemaType<typeof competitionTierSchema>;
export type TrackDocument = InferSchemaType<typeof trackSchema>;
export type RaceMatchDocument = InferSchemaType<typeof raceMatchSchema>;
export type PenaltyMatchDocument = InferSchemaType<typeof penaltyMatchSchema>;
export type PoolMatchDocument = InferSchemaType<typeof poolMatchSchema>;
export type TowerMatchDocument = InferSchemaType<typeof towerMatchSchema>;
export type ArcheryMatchDocument = InferSchemaType<typeof archeryMatchSchema>;
export type TeenPattiRoundDocument = InferSchemaType<typeof teenPattiRoundSchema>;
export type SlotSpinDocument = InferSchemaType<typeof slotSpinSchema>;
export type GameDocument = InferSchemaType<typeof gameSchema>;
export type GameSessionDocument = InferSchemaType<typeof gameSessionSchema>;
export type GameRoundDocument = InferSchemaType<typeof gameRoundSchema>;
export type GameBetDocument = InferSchemaType<typeof gameBetSchema>;
export type BetSelectionDocument = InferSchemaType<typeof betSelectionSchema>;
export type GameResultDocument = InferSchemaType<typeof gameResultSchema>;
export type PlayerGameStatDocument = InferSchemaType<typeof playerGameStatSchema>;
export type GameHistoryDocument = InferSchemaType<typeof gameHistorySchema>;
export type RngRoundDocument = InferSchemaType<typeof rngRoundSchema>;
export type GameBonusDocument = InferSchemaType<typeof gameBonusSchema>;
export type GameSettingDocument = InferSchemaType<typeof gameSettingSchema>;
export type FraudFlagDocument = InferSchemaType<typeof fraudFlagSchema>;
export type RaceParticipantDocument = InferSchemaType<typeof raceParticipantSchema>;
export type RaceCheckpointDocument = InferSchemaType<typeof raceCheckpointSchema>;
export type MissionDocument = InferSchemaType<typeof missionSchema>;
export type MissionProgressDocument = InferSchemaType<typeof missionProgressSchema>;
export type AchievementDocument = InferSchemaType<typeof achievementSchema>;
export type PlayerAchievementDocument = InferSchemaType<typeof playerAchievementSchema>;
export type MatchmakingQueueDocument = InferSchemaType<typeof matchmakingQueueSchema>;
export type AntiCheatLogDocument = InferSchemaType<typeof antiCheatLogSchema>;
export type ReportDocument = InferSchemaType<typeof reportSchema>;

export const User = existingModel("User", userSchema);
export const AuthSession = existingModel("AuthSession", authSessionSchema);
export const Wallet = existingModel("Wallet", walletSchema);
export const WalletTransaction = existingModel("WalletTransaction", walletTransactionSchema);
export const LeaderboardBot = existingModel("LeaderboardBot", leaderboardBotSchema);
export const CreditRequest = existingModel("CreditRequest", creditRequestSchema);
export const BonusGrant = existingModel("BonusGrant", bonusGrantSchema);
export const Referral = existingModel("Referral", referralSchema);
export const SupportTicket = existingModel("SupportTicket", supportTicketSchema);
export const SiteSetting = existingModel("SiteSetting", siteSettingSchema);
export const AuditLog = existingModel("AuditLog", auditLogSchema);
export const RateLimit = existingModel("RateLimit", rateLimitSchema);
export const RacingProfile = existingModel("RacingProfile", racingProfileSchema);
export const PenaltyProfile = existingModel("PenaltyProfile", penaltyProfileSchema);
export const PoolProfile = existingModel("PoolProfile", poolProfileSchema);
export const TowerProfile = existingModel("TowerProfile", towerProfileSchema);
export const ArcheryProfile = existingModel("ArcheryProfile", archeryProfileSchema);
export const Vehicle = existingModel("Vehicle", vehicleSchema);
export const OwnedVehicle = existingModel("OwnedVehicle", ownedVehicleSchema);
export const Cosmetic = existingModel("Cosmetic", cosmeticSchema);
export const OwnedCosmetic = existingModel("OwnedCosmetic", ownedCosmeticSchema);
export const CompetitionTier = existingModel("CompetitionTier", competitionTierSchema);
export const Track = existingModel("Track", trackSchema);
export const RaceMatch = existingModel("RaceMatch", raceMatchSchema);
export const PenaltyMatch = existingModel("PenaltyMatch", penaltyMatchSchema);
export const PoolMatch = existingModel("PoolMatch", poolMatchSchema);
export const TowerMatch = existingModel("TowerMatch", towerMatchSchema);
export const ArcheryMatch = existingModel("ArcheryMatch", archeryMatchSchema);
export const TeenPattiRound = existingModel("TeenPattiRound", teenPattiRoundSchema);
export const SlotSpin = existingModel("SlotSpin", slotSpinSchema);
export const Game = existingModel("Game", gameSchema);
export const GameSession = existingModel("GameSession", gameSessionSchema);
export const GameRound = existingModel("GameRound", gameRoundSchema);
export const GameBet = existingModel("GameBet", gameBetSchema);
export const BetSelection = existingModel("BetSelection", betSelectionSchema);
export const GameResult = existingModel("GameResult", gameResultSchema);
export const PlayerGameStat = existingModel("PlayerGameStat", playerGameStatSchema);
export const GameHistory = existingModel("GameHistory", gameHistorySchema);
export const RngRound = existingModel("RngRound", rngRoundSchema);
export const GameBonus = existingModel("GameBonus", gameBonusSchema);
export const GameSetting = existingModel("GameSetting", gameSettingSchema);
export const FraudFlag = existingModel("FraudFlag", fraudFlagSchema);
export const RaceParticipant = existingModel("RaceParticipant", raceParticipantSchema);
export const RaceCheckpoint = existingModel("RaceCheckpoint", raceCheckpointSchema);
export const Mission = existingModel("Mission", missionSchema);
export const MissionProgress = existingModel("MissionProgress", missionProgressSchema);
export const Achievement = existingModel("Achievement", achievementSchema);
export const PlayerAchievement = existingModel("PlayerAchievement", playerAchievementSchema);
export const MatchmakingQueue = existingModel("MatchmakingQueue", matchmakingQueueSchema);
export const AntiCheatLog = existingModel("AntiCheatLog", antiCheatLogSchema);
export const Report = existingModel("Report", reportSchema);
