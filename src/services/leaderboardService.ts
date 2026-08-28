import { connectDB } from "@/lib/db";
import { LeaderboardBot } from "@/models";

export type LeaderboardGame = "RACING" | "ARCHERY" | "POOL" | "TOWER" | "PENALTY";

export interface LeaderboardEntry {
  rank?: number;
  userId: string;
  username: string;
  wins: number;
  losses: number;
  winRate: number;
  bestTimeMs: number | null;
  bestScore?: number;
  rankName: string;
  rankPoints: number;
  xp: number;
  winStreak: number;
  balance: number;
  isBot: boolean;
  updatedAt?: Date | string;
  [key: string]: unknown;
}

const TICK_MS = 30_000;

const names: Record<LeaderboardGame, string[]> = {
  RACING: ["VortexAce", "NovaRider", "TurboHex", "DriftRogue", "NightVolt", "ApexGhost", "IonRunner", "RainRebel"],
  ARCHERY: ["ArrowNova", "GoldFletch", "QuietQuiver", "HawkEyeX", "CedarStorm", "BullseyeBot", "ValleyArc", "MoonMarksman"],
  POOL: ["CuePhantom", "EightAce", "BankShotX", "VelvetBreak", "CornerKing", "ChalkNova", "RailRider", "MidnightCue"],
  TOWER: ["SiegeNova", "CastleCrush", "IronArc", "RoyalRubble", "CannonHex", "MoonBreaker", "KeepHunter", "EmberKing"],
  PENALTY: ["TopBinsAI", "NetPhantom", "SpotKickX", "GloveWall", "GoalNova", "CurveKing", "FinalWhistle", "StadiumAce"],
};

function hash(input: string) {
  let result = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    result ^= input.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function rankName(game: LeaderboardGame, points: number) {
  if (game === "TOWER") return points >= 2200 ? "Legend" : points >= 1700 ? "King" : points >= 1300 ? "Commander" : points >= 900 ? "Knight" : points >= 500 ? "Warrior" : "Rookie";
  if (game === "ARCHERY") return points >= 2200 ? "Legend" : points >= 1700 ? "Champion" : points >= 1300 ? "Marksman" : points >= 900 ? "Hunter" : points >= 500 ? "Ranger" : "Rookie";
  return points >= 2600 ? "Legend" : points >= 2200 ? "Master" : points >= 1850 ? "Diamond" : points >= 1550 ? "Platinum" : points >= 1250 ? "Gold I" : points >= 1000 ? "Gold II" : points >= 800 ? "Silver I" : points >= 600 ? "Silver II" : "Bronze I";
}

function seedRows(game: LeaderboardGame, tick: number) {
  return names[game].map((username, index) => {
    const points = 760 + (names[game].length - index) * 175 + hash(`${game}:${username}`) % 140;
    return {
      botId: `${game.toLowerCase()}:${username.toLowerCase()}`,
      game,
      username,
      balance: 8_500 + (names[game].length - index) * 2_750 + hash(username) % 1_800,
      wins: 34 + (names[game].length - index) * 8 + hash(`${username}:wins`) % 9,
      losses: 14 + index * 4 + hash(`${username}:losses`) % 8,
      xp: 4_000 + points * 3 + hash(`${username}:xp`) % 900,
      rankPoints: points,
      winStreak: hash(`${username}:streak`) % 7,
      bestTimeMs: game === "RACING" ? 73_000 + index * 1_700 + hash(`${username}:time`) % 1_200 : game === "POOL" || game === "TOWER" ? 92_000 + index * 2_100 + hash(`${username}:time`) % 2_000 : null,
      bestScore: game === "ARCHERY" ? 235 + (names[game].length - index) * 9 + hash(`${username}:score`) % 12 : 0,
      rankName: rankName(game, points),
      lastTick: tick,
      lastUpdatedAt: new Date(),
    };
  });
}

export async function getLiveBotLeaders(game: LeaderboardGame) {
  await connectDB();
  const tick = Math.floor(Date.now() / TICK_MS);
  await LeaderboardBot.bulkWrite(seedRows(game, tick).map((bot) => ({
    updateOne: { filter: { botId: bot.botId }, update: { $setOnInsert: bot }, upsert: true },
  })));

  const current = await LeaderboardBot.find({ game }).lean();
  await Promise.all(current.map(async (bot) => {
    const elapsed = Math.min(20, Math.max(0, tick - bot.lastTick));
    if (!elapsed) return;
    const roll = hash(`${bot.botId}:${tick}`);
    const gamesPlayed = Math.max(1, Math.ceil(elapsed / 2));
    const wins = roll % 100 < 58 + roll % 18 ? gamesPlayed : Math.max(0, gamesPlayed - 1);
    const losses = gamesPlayed - wins;
    const entry = [100, 250, 500, 1_000, 2_500][roll % 5];
    const balanceDelta = wins * Math.round(entry * 0.85) - losses * entry;
    const nextPoints = Math.max(0, bot.rankPoints + wins * 24 - losses * 12);
    const nextBalance = Math.max(250, bot.balance + balanceDelta);
    const nextBestTime = bot.bestTimeMs ? Math.max(35_000, bot.bestTimeMs - (wins ? roll % 180 : 0)) : null;
    const nextBestScore = game === "ARCHERY" ? Math.max(bot.bestScore, 245 + roll % 85) : bot.bestScore;
    await LeaderboardBot.updateOne(
      { _id: bot._id, lastTick: bot.lastTick },
      {
        $set: {
          balance: nextBalance,
          rankPoints: nextPoints,
          rankName: rankName(game, nextPoints),
          winStreak: wins ? bot.winStreak + wins : 0,
          bestTimeMs: nextBestTime,
          bestScore: nextBestScore,
          lastTick: tick,
          lastUpdatedAt: new Date(),
        },
        $inc: { wins, losses, xp: gamesPlayed * (70 + roll % 65) },
      },
    );
  }));

  const bots = await LeaderboardBot.find({ game }).sort({ rankPoints: -1, wins: -1 }).lean();
  return bots.map<LeaderboardEntry>((bot) => {
    const matches = bot.wins + bot.losses;
    return {
      userId: `bot:${bot.botId}`,
      username: bot.username,
      wins: bot.wins,
      losses: bot.losses,
      winRate: matches ? Math.round(bot.wins / matches * 100) : 0,
      bestTimeMs: bot.bestTimeMs ?? null,
      bestScore: bot.bestScore,
      rankName: bot.rankName,
      rankPoints: bot.rankPoints,
      xp: bot.xp,
      winStreak: bot.winStreak,
      balance: bot.balance,
      isBot: true,
      updatedAt: bot.lastUpdatedAt,
    };
  });
}

export function mergeLeaderboardEntries(real: LeaderboardEntry[], bots: LeaderboardEntry[]) {
  return [...real, ...bots]
    .sort((left, right) => right.rankPoints - left.rankPoints || right.wins - left.wins || (left.bestTimeMs ?? Number.MAX_SAFE_INTEGER) - (right.bestTimeMs ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 100)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
