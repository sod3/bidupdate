import { installPoolLive } from "./pool-live.mjs";
import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import next from "next";
import { createGameSocket } from "./pool-socket.mjs";
import { isAiFavoredRoll } from "./game-ai.mjs";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const checkpoints = [600, 1200, 1800, 2400, 3000, 3600, 4200];
const tiers = {
  rookie: { entry: 100, pool: 200 },
  street: { entry: 250, pool: 500 },
  pro: { entry: 500, pool: 1000 },
  elite: { entry: 1000, pool: 2000 },
  legend: { entry: 2500, pool: 5000 },
};
const allowedVehicles = new Set(["nightfang", "vortex-r", "phantom-x"]);
const matches = new Map();
const activeMatchByPlayer = new Map();
const penaltyTiers = {
  academy: { entry: 100, pool: 200, name: "Academy Shootout" },
  champions: { entry: 500, pool: 1000, name: "Champions Shootout" },
  "world-class": { entry: 1000, pool: 2000, name: "World Class Shootout" },
};
const penaltyMatches = new Map();
const activePenaltyByPlayer = new Map();
const validKeeperZones = new Set(["upper-left", "upper-right", "low-left", "center", "low-right"]);
const poolTiers = {
  club: { entry: 100, reward: 200, name: "Club Table" },
  pro: { entry: 500, reward: 1000, name: "Pro Circuit" },
  "high-roller": { entry: 1000, reward: 2000, name: "High Roller" },
};
const allowedPoolCues = new Set(["house", "neon-viper", "royal-flush", "black-diamond"]);
const allowedPoolTables = new Set(["emerald", "electric-blue", "royal-purple"]);
const allowedBallSkins = new Set(["tournament", "neon", "obsidian"]);
const poolMatches = new Map();
const activePoolByPlayer = new Map();
const towerTiers = {
  frontier: { entry: 100, reward: 200, name: "Frontier Siege", boss: "STONE WARDEN", title: "Rampart Keeper", health: 90 },
  warfront: { entry: 500, reward: 1000, name: "Iron Warfront", boss: "IRON DUCHESS", title: "Breaker of Crowns", health: 110 },
  royal: { entry: 1000, reward: 2000, name: "Royal Cataclysm", boss: "DRAGON KING", title: "The Final Bastion", health: 135 },
};
const allowedTowerCannons = new Set(["oak-breaker", "iron-wolf", "dragon-mouth", "kings-thunder"]);
const allowedTowerCastles = new Set(["highland-keep", "crimson-fort", "sun-king-citadel"]);
const allowedTowerArenas = new Set(["moonfall", "ember-field", "red-dunes", "frost-crown"]);
const allowedTowerSkins = new Set(["forged", "arcane", "solar"]);
const towerMatches = new Map();
const activeTowerByPlayer = new Map();
const archeryTiers = {
  valley: { entry: 100, reward: 200, name: "Valley Open", title: "Wind Reader" },
  temple: { entry: 500, reward: 1000, name: "Temple Masters", title: "Silent Arrow" },
  legend: { entry: 1000, reward: 2000, name: "Legend Arena", title: "Perfect Hunter" },
};
const allowedArcheryBows = new Set(["field-recurve", "sakura-yumi", "moon-hunter", "solar-legend"]);
const allowedArcheryArrows = new Set(["cedar", "sakura", "frost", "voltage"]);
const allowedArcheryTargets = new Set(["classic", "sakura", "neon"]);
const allowedArcheryCosmetics = new Set(["valley-scout", "temple-guard", "neon-ranger"]);
const allowedArcheryEnvironments = new Set(["mountain-valley", "japanese-temple", "moonlit-forest", "desert-kingdom", "castle-battlefield", "neon-rooftop", "snowy-mountains"]);
const archeryMatches = new Map();
const activeArcheryByPlayer = new Map();
const dummyOpponentNames = [
  "Ayaan Voss", "Mira Vale", "Zoya Flint", "Kian Rook", "Nyla Soren", "Rafi Arden",
  "Lina Marlow", "Sami Riven", "Tara Quinn", "Noor Vega", "Ari Kestrel", "Hana Solis",
  "Ilyas Rune", "Maya Corin", "Omar Vail", "Zain Orra", "Leena Frost", "Rayen Knox",
  "Sora Venn", "Dani Rowan", "Imran Hale", "Nora Syl", "Kareem Pike", "Alina Wren",
];

async function persist(body) {
  const secret = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("RACE_SERVER_SECRET or JWT_SECRET is required.");
  const response = await fetch(`http://127.0.0.1:${port}/api/neon-drift/match`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-race-server-secret": secret },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Race persistence rejected the event.");
  return payload;
}

async function persistPenalty(body) {
  const secret = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("RACE_SERVER_SECRET or JWT_SECRET is required.");
  const response = await fetch(`http://127.0.0.1:${port}/api/penalty-kings/match`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-race-server-secret": secret },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Penalty Kings persistence rejected the event.");
  return payload;
}

async function persistPool(body) {
  const secret = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("RACE_SERVER_SECRET or JWT_SECRET is required.");
  const response = await fetch(`http://127.0.0.1:${port}/api/eight-ball/match`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-race-server-secret": secret },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "8 Ball persistence rejected the event.");
  return payload;
}

async function persistTower(body) {
  const secret = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("RACE_SERVER_SECRET or JWT_SECRET is required.");
  const response = await fetch(`http://127.0.0.1:${port}/api/tower-clash/match`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-race-server-secret": secret },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Tower Clash persistence rejected the event.");
  return payload;
}

async function persistArchery(body) {
  const secret = process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("RACE_SERVER_SECRET or JWT_SECRET is required.");
  const response = await fetch(`http://127.0.0.1:${port}/api/precision-arena/match`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-race-server-secret": secret },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Precision Arena persistence rejected the event.");
  return payload;
}

function publicOpponent(player) {
  return { id: player.id, username: player.username, level: player.level, rank: player.rank, vehicleId: player.vehicleId, winStreak: player.winStreak, isBot: Boolean(player.isBot) };
}

function sanitizedStats(input) {
  const number = (key, max) => Math.max(0, Math.min(max, Number(input?.[key]) || 0));
  return { perfectDrifts: Math.floor(number("perfectDrifts", 100)), nearMisses: Math.floor(number("nearMisses", 100)), topSpeedKmh: Math.floor(number("topSpeedKmh", 360)), driftScore: Math.floor(number("driftScore", 1_000_000)) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function penaltyOpponent(player) {
  return { id: player.id, username: player.username, level: player.level, rank: player.rank, winStreak: player.winStreak, isBot: Boolean(player.isBot) };
}

function randomItem(items) {
  return items[randomInt(0, items.length)];
}

function createRaceBot(identity, tierId, humanVehicleId) {
  const aiFavored = isAiFavoredRoll(randomInt(0, 100));
  const tierIndex = Object.keys(tiers).indexOf(tierId);
  const targetFinishTimeMs = aiFavored
    ? randomInt(50_000 - tierIndex * 550, 55_001 - tierIndex * 550)
    : randomInt(66_000 - tierIndex * 350, 74_001 - tierIndex * 350);
  const vehicleIds = [...allowedVehicles].filter((id) => id !== humanVehicleId);
  return {
    id: `race-ai-${randomUUID()}`,
    username: randomItem(dummyOpponentNames),
    level: Math.max(18, identity.level + randomInt(3, 10)),
    rank: tierIndex >= 3 ? "Legend" : "Master",
    vehicleId: randomItem(vehicleIds),
    winStreak: randomInt(4, 13),
    isBot: true,
    aiFavored,
    targetFinishTimeMs,
    state: { x: 2.6, z: 0, speed: 0, heading: 0, checkpoint: 0, nitro: 100, drifting: false },
    lastUpdate: Date.now(),
    finishTimeMs: null,
    stats: { perfectDrifts: randomInt(3, 10), nearMisses: randomInt(4, 14), topSpeedKmh: 342, driftScore: randomInt(18_000, 52_000) },
    checkpoints: [],
    violations: 0,
    disconnectedAt: null,
  };
}

function createPenaltyBot(identity, tierId) {
  const tierIndex = Object.keys(penaltyTiers).indexOf(tierId);
  return {
    id: `penalty-ai-${randomUUID()}`,
    username: randomItem(dummyOpponentNames),
    level: Math.max(22, identity.level + randomInt(4, 12)),
    rank: tierIndex === 2 ? "Legend" : "Master",
    winStreak: randomInt(5, 15),
    isBot: true,
    aiFavored: isAiFavoredRoll(randomInt(0, 100)),
    disconnectedAt: null,
  };
}

function createPoolBot(identity, tierId) {
  const tierIndex = Object.keys(poolTiers).indexOf(tierId);
  return {
    id: `pool-ai-${randomUUID()}`,
    username: randomItem(dummyOpponentNames),
    level: Math.max(20, identity.level + randomInt(4, 12)),
    rank: tierIndex === 2 ? "Legend" : "Master",
    winStreak: randomInt(4, 14),
    isBot: true,
    aiFavored: isAiFavoredRoll(randomInt(0, 100)),
  };
}

function sanitizedPoolStats(input) {
  const number = (key, max) => Math.floor(Math.max(0, Math.min(max, Number(input?.[key]) || 0)));
  return { shots: number("shots", 100), ballsPotted: number("ballsPotted", 15), bankShots: number("bankShots", 15), trickShots: number("trickShots", 15), fouls: number("fouls", 50), maxRun: number("maxRun", 15) };
}

function createTowerBot(identity, tierId) {
  const tierIndex = Object.keys(towerTiers).indexOf(tierId);
  const tier = towerTiers[tierId];
  return {
    id: `tower-ai-${randomUUID()}`,
    username: randomItem(dummyOpponentNames),
    title: tier.title,
    level: Math.max(18 + tierIndex * 8, identity.level + randomInt(4, 13)),
    rank: tierIndex === 2 ? "Legend" : tierIndex === 1 ? "Commander" : "Knight",
    isBot: true,
    aiFavored: isAiFavoredRoll(randomInt(0, 100)),
  };
}

function sanitizedTowerStats(input) {
  const number = (key, max) => Math.floor(Math.max(0, Math.min(max, Number(input?.[key]) || 0)));
  return {
    shots: number("shots", 100), hits: number("hits", 100), damageDealt: number("damageDealt", 5000),
    criticalHits: number("criticalHits", 100), partsDestroyed: number("partsDestroyed", 200),
    abilitiesUsed: number("abilitiesUsed", 50), maxDamage: number("maxDamage", 250),
  };
}

function createArcheryBot(identity, tierId) {
  const tierIndex = Object.keys(archeryTiers).indexOf(tierId);
  const tier = archeryTiers[tierId];
  return {
    id: `archery-ai-${randomUUID()}`,
    username: randomItem(dummyOpponentNames),
    title: tier.title,
    level: Math.max(16 + tierIndex * 9, identity.level + randomInt(4, 13)),
    rank: tierIndex === 2 ? "Legend" : tierIndex === 1 ? "Marksman" : "Hunter",
    isBot: true,
    aiFavored: isAiFavoredRoll(randomInt(0, 100)),
  };
}

function sanitizedArcheryStats(input) {
  const number = (key, max) => Math.floor(Math.max(0, Math.min(max, Number(input?.[key]) || 0)));
  return {
    score: number("score", 1500), bullseyes: number("bullseyes", 5), perfectShots: number("perfectShots", 5),
    longRangeShots: number("longRangeShots", 5), arrows: number("arrows", 5), bestCombo: number("bestCombo", 5),
  };
}

function plainPenaltyState(match) {
  return {
    scores: Object.fromEntries(match.scores),
    histories: Object.fromEntries([...match.histories].map(([id, values]) => [id, [...values]])),
  };
}

function pressureText(match, viewerId, strikerId) {
  if (match.suddenDeath) return "SUDDEN DEATH";
  if (match.turn < 8) return "";
  if (viewerId === strikerId) return match.turn === 8 ? "MATCH POINT" : "MUST SCORE";
  return "SAVE TO WIN";
}

function validShot(input) {
  const keys = ["directionX", "height", "power", "curve", "timing"];
  return input && keys.every((key) => typeof input[key] === "number" && Number.isFinite(input[key]));
}

function shotTarget(shot) {
  const timingOffset = (clamp(shot.timing, 0, 1) - .5) * 1.05 * (.35 + clamp(shot.power, .18, 1));
  return {
    x: clamp(shot.directionX, -1.2, 1.2) * 3.35 + clamp(shot.curve, -1, 1) * .5 * clamp(shot.power, .18, 1) + timingOffset,
    y: .12 + clamp(shot.height, 0, 1.15) * 2.35 + Math.abs(clamp(shot.timing, 0, 1) - .5) * .28,
  };
}

function aiKeeperSave(match, shot) {
  const zones = {
    "upper-left": [-2.35, 1.78], "upper-right": [2.35, 1.78], "low-left": [-2.35, .52], center: [0, .88], "low-right": [2.35, .52],
  };
  const target = shotTarget(shot);
  const closest = Object.entries(zones).sort((left, right) =>
    Math.hypot(target.x - left[1][0], target.y - left[1][1]) - Math.hypot(target.x - right[1][0], target.y - right[1][1]))[0][0];
  const accuracy = match.aiFavored ? 88 : 28;
  const zone = randomInt(0, 100) < accuracy
    ? closest
    : randomItem([...validKeeperZones].filter((candidate) => candidate !== closest));
  return { zone, submittedAt: match.pending.startedAt + randomInt(420, 950) };
}

function aiStrikerShot(match) {
  const accurate = randomInt(0, 100) < (match.aiFavored ? 96 : 62);
  if (!accurate) {
    return { directionX: randomInt(0, 2) === 0 ? -1.2 : 1.2, height: 1.12, power: .74, curve: randomInt(0, 2) === 0 ? -.8 : .8, timing: .62, submittedAt: match.pending.startedAt + 520 };
  }
  const targets = [
    { directionX: -.72, height: .72, power: .88, curve: -.08 },
    { directionX: .72, height: .72, power: .9, curve: .08 },
    { directionX: -.72, height: .16, power: .94, curve: 0 },
    { directionX: .72, height: .16, power: .94, curve: 0 },
    { directionX: 0, height: .34, power: .82, curve: 0 },
  ];
  return { ...randomItem(targets), timing: .5 + randomInt(-24, 25) / 1000, submittedAt: match.pending.startedAt + randomInt(480, 900) };
}

function resolvePenalty(match) {
  const shot = match.pending.shot || { directionX: 1.5, height: 1.2, power: .2, curve: 0, timing: 0 };
  const keeperZone = match.pending.save?.zone || "center";
  const timingOffset = (clamp(shot.timing, 0, 1) - .5) * 1.05 * (.35 + clamp(shot.power, .18, 1));
  const targetX = clamp(shot.directionX, -1.2, 1.2) * 3.35 + clamp(shot.curve, -1, 1) * .5 * clamp(shot.power, .18, 1) + timingOffset;
  const targetY = .12 + clamp(shot.height, 0, 1.15) * 2.35 + Math.abs(clamp(shot.timing, 0, 1) - .5) * .28;
  const zoneTargets = {
    "upper-left": [-2.35, 1.78], "upper-right": [2.35, 1.78], "low-left": [-2.35, .52], center: [0, .88], "low-right": [2.35, .52],
  };
  const [keeperX, keeperY] = zoneTargets[keeperZone];
  const inFrame = Math.abs(targetX) <= 3.55 && targetY >= .08 && targetY <= 2.48;
  const reactionMs = match.pending.save ? match.pending.save.submittedAt - match.pending.startedAt : 8_000;
  const anticipation = clamp(1 - reactionMs / 8_000, 0, 1);
  const saveRadius = .86 + anticipation * .28 - clamp(shot.power, .18, 1) * .25;
  const saved = inFrame && Math.hypot(targetX - keeperX, targetY - keeperY) <= saveRadius;
  const goal = inFrame && !saved;
  const perfect = Math.abs(clamp(shot.timing, 0, 1) - .5) <= .075 && inFrame;
  const shotType = shot.power < .48 && shot.height > .55 ? "PANENKA" : shot.power > .86 ? "POWER" : Math.abs(shot.curve) > .38 ? "CURVED" : shot.height < .34 ? "LOW_DRIVEN" : "PLACED";
  return { turn: match.turn, strikerId: match.pending.strikerId, keeperId: match.pending.keeperId, goal, outcome: goal ? "GOAL" : saved ? "SAVE" : "MISS", shotType, targetX, targetY, keeperZone, perfect };
}

function beginPenaltyTurn(io, match) {
  if (match.finalized) return;
  const strikerId = match.order[match.turn % 2];
  const keeperId = match.order[(match.turn + 1) % 2];
  const deadlineAt = Date.now() + 8_000;
  match.pending = { strikerId, keeperId, shot: null, save: null, startedAt: Date.now(), deadlineAt, settled: false };
  if (match.players.get(strikerId)?.isBot) match.pending.shot = aiStrikerShot(match);
  const state = plainPenaltyState(match);
  for (const player of match.players.values()) {
    if (player.isBot) continue;
    player.socket.emit("penalty:turn", {
      turn: match.turn,
      strikerId,
      keeperId,
      shotNumber: Math.floor(match.turn / 2) + 1,
      suddenDeath: match.suddenDeath,
      deadlineAt,
      pressureText: pressureText(match, player.id, strikerId),
      ...state,
    });
  }
  match.turnTimer = setTimeout(() => settlePenaltyTurn(io, match), 8_100);
  match.turnTimer.unref();
}

function settlePenaltyTurn(io, match) {
  if (match.finalized || !match.pending || match.pending.settled) return;
  if (match.players.get(match.pending.strikerId)?.isBot && !match.pending.shot) match.pending.shot = aiStrikerShot(match);
  if (match.players.get(match.pending.keeperId)?.isBot && !match.pending.save) {
    const shot = match.pending.shot || { directionX: 1.5, height: 1.2, power: .2, curve: 0, timing: 0 };
    match.pending.save = aiKeeperSave(match, shot);
  }
  match.pending.settled = true;
  if (match.turnTimer) clearTimeout(match.turnTimer);
  const resolution = resolvePenalty(match);
  if (resolution.goal) match.scores.set(resolution.strikerId, (match.scores.get(resolution.strikerId) || 0) + 1);
  match.histories.get(resolution.strikerId).push(resolution.outcome);
  const striker = match.players.get(resolution.strikerId);
  const keeper = match.players.get(resolution.keeperId);
  striker.stats.shots += 1;
  striker.stats.goals += resolution.goal ? 1 : 0;
  striker.stats.perfectShots += resolution.perfect ? 1 : 0;
  keeper.stats.saves += resolution.outcome === "SAVE" ? 1 : 0;
  io.to(match.id).emit("penalty:resolved", { ...resolution, ...plainPenaltyState(match) });
  match.turn += 1;
  const pairFinished = match.turn >= 10 && match.turn % 2 === 0;
  if (pairFinished && match.scores.get(match.order[0]) !== match.scores.get(match.order[1])) {
    match.nextTimer = setTimeout(() => finalizePenaltyMatch(io, match), 2_500);
    match.nextTimer.unref();
    return;
  }
  if (match.turn >= 10) match.suddenDeath = true;
  match.nextTimer = setTimeout(() => beginPenaltyTurn(io, match), 3_350);
  match.nextTimer.unref();
}

function finalizePenaltyMatch(io, match) {
  if (match.finalized) return;
  match.finalized = true;
  if (match.turnTimer) clearTimeout(match.turnTimer);
  if (match.nextTimer) clearTimeout(match.nextTimer);
  const [firstId, secondId] = match.order;
  const winnerId = match.scores.get(firstId) > match.scores.get(secondId) ? firstId : secondId;
  const winner = match.players.get(winnerId);
  const state = plainPenaltyState(match);
  for (const player of match.players.values()) {
    if (player.isBot) continue;
    player.socket.emit("penalty:result", {
      winnerId,
      winnerName: winner.username,
      suddenDeath: match.suddenDeath,
      xpAwarded: player.id === winnerId ? 420 : 170,
      creditsAwarded: player.id === winnerId ? match.tier.pool : 0,
      rankDelta: player.id === winnerId ? 14 : -8,
      stats: player.stats,
      ...state,
    });
  }
  const players = [...match.players.values()].map((player) => ({ id: player.id, username: player.username, isBot: Boolean(player.isBot), stats: player.stats }));
  void persistPenalty({ phase: "RESULT", matchId: match.id, winnerId, suddenDeath: match.suddenDeath, rounds: Math.ceil(match.turn / 2), players, ...state }).catch((error) => process.stderr.write(`Penalty result persistence failed for ${match.id}: ${error.message}\n`));
  setTimeout(() => {
    if (match.rematchRequests.size === 0) {
      for (const player of match.players.values()) if (!player.isBot && activePenaltyByPlayer.get(player.id) === match.id) activePenaltyByPlayer.delete(player.id);
      penaltyMatches.delete(match.id);
    }
  }, 120_000).unref();
}

async function createPenaltyMatch(io, first, second, tierId) {
  const tier = penaltyTiers[tierId];
  const players = [first, second].map((player) => ({ ...player, stats: { goals: 0, saves: 0, perfectShots: 0, shots: 0 }, disconnectedAt: null }));
  const match = {
    id: randomUUID(), tierId, tier, environmentSeed: randomInt(1, 2_147_483_647), startAt: Date.now() + 4_200,
    players: new Map(players.map((player) => [player.id, player])), order: players.map((player) => player.id), scores: new Map(players.map((player) => [player.id, 0])),
    histories: new Map(players.map((player) => [player.id, []])), turn: 0, suddenDeath: false, pending: null, finalized: false, turnTimer: null, nextTimer: null, rematchRequests: new Set(),
    aiFavored: Boolean(players.find((player) => player.isBot)?.aiFavored),
  };
  await persistPenalty({ phase: "START", matchId: match.id, tierId, environmentSeed: match.environmentSeed, startAt: match.startAt, aiFavored: match.aiFavored, players: players.map(({ id, username, isBot }) => ({ id, username, isBot: Boolean(isBot) })) });
  penaltyMatches.set(match.id, match);
  for (const player of players) {
    if (player.isBot) continue;
    activePenaltyByPlayer.set(player.id, match.id);
    player.socket.join(match.id);
  }
  for (const player of players) {
    if (player.isBot) continue;
    const opponent = players.find((candidate) => candidate.id !== player.id);
    player.socket.emit("penalty:match-found", { matchId: match.id, startAt: match.startAt, environmentSeed: match.environmentSeed, opponent: penaltyOpponent(opponent), firstStrikerId: match.order[0], tierId, aiFavored: match.aiFavored });
  }
  match.nextTimer = setTimeout(() => beginPenaltyTurn(io, match), Math.max(0, match.startAt - Date.now()));
  match.nextTimer.unref();
  return match;
}

function playerResult(player, winnerId) {
  return {
    id: player.id,
    username: player.username,
    isBot: Boolean(player.isBot),
    finishTimeMs: player.finishTimeMs,
    stats: player.stats,
    result: player.id === winnerId ? "WIN" : player.finishTimeMs ? "LOSS" : "DNF",
    checkpoints: player.checkpoints,
  };
}

function startRaceBot(io, match, bot) {
  const emitState = () => {
    if (match.finalized) return;
    const elapsed = Math.max(0, Date.now() - match.startAt);
    const progress = clamp(elapsed / bot.targetFinishTimeMs, 0, 1);
    const scriptedZ = 4200 * (1 - Math.pow(1 - progress, 1.08));
    const human = [...match.players.values()].find((player) => !player.isBot);
    const humanZ = human?.state?.z ?? scriptedZ;
    const duelSwing = Math.sin(progress * Math.PI * 8.5) * 16 + Math.sin(progress * Math.PI * 3) * 7;
    const desiredDuelZ = clamp(humanZ + duelSwing + (bot.aiFavored ? 5 : -2), 0, 4194);
    const hasLiveHuman = Boolean(human && humanZ > 8 && progress < .965);
    const duelBlend = Math.min(.84, Math.max(0, (elapsed - 500) / 1_800));
    const candidateZ = hasLiveHuman
      ? scriptedZ * (1 - duelBlend) + desiredDuelZ * duelBlend
      : scriptedZ;
    const previousZ = bot.state.z;
    const z = Math.max(previousZ, Math.min(4194, candidateZ));
    const sampledSpeed = Math.max(0, (z - previousZ) / .1);
    const cruiseSpeed = (4200 / (bot.targetFinishTimeMs / 1000)) * (.55 + Math.min(1, elapsed / 3_000) * .68);
    const speed = progress >= 1 ? 0 : clamp(sampledSpeed * .42 + cruiseSpeed * .58, 48, 97);
    const x = 2.6 + Math.sin(progress * Math.PI * 10) * 1.35 + Math.sin(elapsed / 920) * .35;
    const checkpoint = checkpoints.filter((value) => z >= value).length;
    bot.state = { x, z, speed, heading: Math.cos(progress * Math.PI * 10) * .025, checkpoint, nitro: progress > .12 && progress < .9 ? 100 : 58, drifting: Math.sin(progress * Math.PI * 6) > .72 };
    for (const player of match.players.values()) {
      if (!player.isBot) player.socket.emit("race:state", { playerId: bot.id, state: bot.state });
    }
  };

  const finishBot = () => {
    if (match.finalized || bot.finishTimeMs !== null) return;
    if (match.botTelemetryTimer) clearInterval(match.botTelemetryTimer);
    bot.finishTimeMs = bot.targetFinishTimeMs;
    bot.state = { ...bot.state, z: 4200, speed: 0, checkpoint: 7 };
    bot.checkpoints = checkpoints.map((z, index) => ({ checkpoint: index + 1, raceTimeMs: Math.round(bot.targetFinishTimeMs * (z / 4200)), x: 2.6, z }));
    for (const player of match.players.values()) {
      if (!player.isBot) player.socket.emit("race:state", { playerId: bot.id, state: bot.state });
    }
    const players = [...match.players.values()];
    if (players.every((item) => item.finishTimeMs !== null)) finalizeMatch(io, match);
    else if (!match.finishTimer) {
      match.finishTimer = setTimeout(() => finalizeMatch(io, match), 12_000);
      match.finishTimer.unref();
    }
  };

  match.botTelemetryTimer = setInterval(emitState, 100);
  match.botTelemetryTimer.unref();
  match.botFinishTimer = setTimeout(finishBot, Math.max(0, match.startAt + bot.targetFinishTimeMs - Date.now()));
  match.botFinishTimer.unref();
  emitState();
}

async function createRaceMatch(io, player, tierId) {
  const bot = createRaceBot(player, tierId, player.vehicleId);
  const match = {
    id: randomUUID(),
    tierId,
    tier: tiers[tierId],
    environmentSeed: randomInt(1, 2_147_483_647),
    startAt: Date.now() + 5_200,
    players: new Map([[player.id, player], [bot.id, bot]]),
    finalized: false,
    finishTimer: null,
    botTelemetryTimer: null,
    botFinishTimer: null,
  };
  await persist({
    phase: "START",
    matchId: match.id,
    tierId,
    environmentSeed: match.environmentSeed,
    startAt: match.startAt,
    players: [player, bot].map(({ id, username, vehicleId, isBot }) => ({ id, username, vehicleId, isBot: Boolean(isBot) })),
  });
  matches.set(match.id, match);
  activeMatchByPlayer.set(player.id, match.id);
  player.socket.join(match.id);
  player.socket.emit("match:found", { matchId: match.id, startAt: match.startAt, environmentSeed: match.environmentSeed, opponent: publicOpponent(bot) });
  startRaceBot(io, match, bot);
  return match;
}

function finalizeMatch(io, match) {
  if (match.finalized) return;
  match.finalized = true;
  if (match.finishTimer) clearTimeout(match.finishTimer);
  if (match.botFinishTimer) clearTimeout(match.botFinishTimer);
  if (match.botTelemetryTimer) clearInterval(match.botTelemetryTimer);
  const players = [...match.players.values()];
  const finishers = players.filter((player) => player.finishTimeMs !== null).sort((a, b) => a.finishTimeMs - b.finishTimeMs);
  const winner = finishers[0] || players.find((player) => !player.disconnectedAt) || players[0];
  const differenceMs = finishers.length === 2 ? Math.abs(finishers[0].finishTimeMs - finishers[1].finishTimeMs) : null;
  const photoFinish = differenceMs !== null && differenceMs <= 700;
  const results = players.map((player) => playerResult(player, winner.id));
  for (const player of players) {
    if (player.isBot) continue;
    player.socket.emit("race:result", {
      winnerId: winner.id,
      photoFinish,
      differenceMs,
      players: results,
      xpAwarded: player.id === winner.id ? 420 : 180,
      creditsAwarded: player.id === winner.id ? match.tier.pool : 0,
      rankDelta: player.id === winner.id ? 14 : -8,
    });
    activeMatchByPlayer.delete(player.id);
  }
  void persist({ phase: "RESULT", matchId: match.id, winnerId: winner.id, photoFinish, differenceMs, players: results }).catch((error) => process.stderr.write(`Race result persistence failed for ${match.id}: ${error.message}\n`));
  setTimeout(() => matches.delete(match.id), 60_000).unref();
}

function poolOpponent(player) {
  return { id: player.id, username: player.username, level: player.level, rank: player.rank, winStreak: player.winStreak, isBot: true };
}

async function createPoolMatch(player, tierId, cosmetics = {}) {
  const bot = createPoolBot(player, tierId);
  const cueId = allowedPoolCues.has(cosmetics.cueId) ? cosmetics.cueId : "house";
  const tableId = allowedPoolTables.has(cosmetics.tableId) ? cosmetics.tableId : "emerald";
  const ballSkinId = allowedBallSkins.has(cosmetics.ballSkinId) ? cosmetics.ballSkinId : "tournament";
  const match = {
    id: randomUUID(),
    tierId,
    tier: poolTiers[tierId],
    environmentSeed: randomInt(1, 2_147_483_647),
    startAt: Date.now() + 3_400,
    player,
    bot,
    aiFavored: bot.aiFavored,
    cueId,
    tableId,
    ballSkinId,
    finalized: false,
    disconnectTimer: null,
  };
  await persistPool({
    phase: "START",
    matchId: match.id,
    tierId,
    environmentSeed: match.environmentSeed,
    startAt: match.startAt,
    aiFavored: match.aiFavored,
    cueId,
    tableId,
    ballSkinId,
    players: [
      { id: player.id, username: player.username, isBot: false },
      { id: bot.id, username: bot.username, isBot: true },
    ],
  });
  poolMatches.set(match.id, match);
  activePoolByPlayer.set(player.id, match.id);
  player.socket.emit("pool:match-found", {
    matchId: match.id,
    tierId,
    startAt: match.startAt,
    environmentSeed: match.environmentSeed,
    opponent: poolOpponent(bot),
    aiFavored: match.aiFavored,
  });
  return match;
}

async function finalizePoolMatch(match, winnerType, input = {}) {
  if (match.finalized) return;
  match.finalized = true;
  if (match.disconnectTimer) clearTimeout(match.disconnectTimer);
  const winner = winnerType === "PLAYER" ? match.player : match.bot;
  const stats = sanitizedPoolStats(input.stats);
  const durationMs = Math.max(20_000, Math.min(3_600_000, Number(input.durationMs) || Date.now() - match.startAt));
  try {
    const persisted = await persistPool({
      phase: "RESULT",
      matchId: match.id,
      winnerId: winner.id,
      durationMs,
      stats,
      players: [
        { id: match.player.id, username: match.player.username, isBot: false },
        { id: match.bot.id, username: match.bot.username, isBot: true },
      ],
    });
    match.player.socket.emit("pool:result", {
      winnerId: winner.id,
      winnerName: winner.username,
      xpAwarded: winnerType === "PLAYER" ? 600 : 230,
      creditsAwarded: winnerType === "PLAYER" ? match.tier.reward : 0,
      rankDelta: winnerType === "PLAYER" ? 18 : -9,
      durationMs,
      profile: persisted.profile,
    });
    setTimeout(() => {
      if (activePoolByPlayer.get(match.player.id) === match.id) activePoolByPlayer.delete(match.player.id);
      poolMatches.delete(match.id);
    }, 120_000).unref();
  } catch (error) {
    match.finalized = false;
    match.player.socket.emit("pool:rejected", { message: error instanceof Error ? error.message : "The final rack could not be verified." });
  }
}

function towerOpponent(player) {
  return { id: player.id, username: player.username, title: player.title, level: player.level, rank: player.rank, isBot: true };
}

async function createTowerMatch(player, tierId, cosmetics = {}) {
  const bot = createTowerBot(player, tierId);
  const tier = towerTiers[tierId];
  const cannonId = allowedTowerCannons.has(cosmetics.cannonId) ? cosmetics.cannonId : "oak-breaker";
  const castleId = allowedTowerCastles.has(cosmetics.castleId) ? cosmetics.castleId : "highland-keep";
  const arenaId = allowedTowerArenas.has(cosmetics.arenaId) ? cosmetics.arenaId : tierId === "royal" ? "red-dunes" : tierId === "warfront" ? "ember-field" : "moonfall";
  const projectileSkinId = allowedTowerSkins.has(cosmetics.projectileSkinId) ? cosmetics.projectileSkinId : "forged";
  const match = {
    id: randomUUID(), tierId, tier, environmentSeed: randomInt(1, 2_147_483_647), startAt: Date.now() + 3_300,
    player, bot, aiFavored: bot.aiFavored, cannonId, castleId, arenaId, projectileSkinId, finalized: false, disconnectTimer: null,
  };
  await persistTower({
    phase: "START", matchId: match.id, tierId, environmentSeed: match.environmentSeed, startAt: match.startAt,
    aiFavored: match.aiFavored, cannonId, castleId, arenaId, projectileSkinId,
    players: [
      { id: player.id, username: player.username, isBot: false },
      { id: bot.id, username: bot.username, isBot: true },
    ],
  });
  towerMatches.set(match.id, match);
  activeTowerByPlayer.set(player.id, match.id);
  player.socket.emit("tower:match-found", {
    matchId: match.id, tierId, startAt: match.startAt, environmentSeed: match.environmentSeed,
    opponent: towerOpponent(bot), aiFavored: match.aiFavored,
  });
  return match;
}

async function finalizeTowerMatch(match, winnerType, input = {}) {
  if (match.finalized) return;
  match.finalized = true;
  if (match.disconnectTimer) clearTimeout(match.disconnectTimer);
  const winner = winnerType === "PLAYER" ? match.player : match.bot;
  const stats = sanitizedTowerStats(input.stats);
  const durationMs = Math.max(10_000, Math.min(3_600_000, Number(input.durationMs) || Date.now() - match.startAt));
  try {
    const persisted = await persistTower({
      phase: "RESULT", matchId: match.id, winnerId: winner.id, durationMs, stats,
      players: [
        { id: match.player.id, username: match.player.username, isBot: false },
        { id: match.bot.id, username: match.bot.username, isBot: true },
      ],
    });
    match.player.socket.emit("tower:result", {
      winnerId: winner.id, winnerName: winner.username,
      xpAwarded: winnerType === "PLAYER" ? 650 : 250,
      creditsAwarded: winnerType === "PLAYER" ? match.tier.reward : 0,
      rankDelta: winnerType === "PLAYER" ? 22 : -10,
      durationMs, profile: persisted.profile,
    });
    setTimeout(() => {
      if (activeTowerByPlayer.get(match.player.id) === match.id) activeTowerByPlayer.delete(match.player.id);
      towerMatches.delete(match.id);
    }, 120_000).unref();
  } catch (error) {
    match.finalized = false;
    match.player.socket.emit("tower:rejected", { message: error instanceof Error ? error.message : "The final siege could not be verified." });
  }
}

function archeryOpponent(player) {
  return { id: player.id, username: player.username, title: player.title, level: player.level, rank: player.rank, isBot: true };
}

async function createArcheryMatch(player, tierId, cosmetics = {}) {
  const bot = createArcheryBot(player, tierId);
  const tier = archeryTiers[tierId];
  const bowId = allowedArcheryBows.has(cosmetics.bowId) ? cosmetics.bowId : "field-recurve";
  const arrowId = allowedArcheryArrows.has(cosmetics.arrowId) ? cosmetics.arrowId : "cedar";
  const targetId = allowedArcheryTargets.has(cosmetics.targetId) ? cosmetics.targetId : "classic";
  const cosmeticId = allowedArcheryCosmetics.has(cosmetics.cosmeticId) ? cosmetics.cosmeticId : "valley-scout";
  const tierEnvironment = tierId === "legend" ? "neon-rooftop" : tierId === "temple" ? "japanese-temple" : "mountain-valley";
  const environmentId = allowedArcheryEnvironments.has(cosmetics.environmentId) ? cosmetics.environmentId : tierEnvironment;
  const match = {
    id: randomUUID(), tierId, tier, environmentSeed: randomInt(1, 2_147_483_647), startAt: Date.now() + 2_700,
    player, bot, aiFavored: bot.aiFavored, bowId, arrowId, targetId, cosmeticId, environmentId, finalized: false, disconnectTimer: null,
  };
  await persistArchery({
    phase: "START", matchId: match.id, tierId, environmentSeed: match.environmentSeed, startAt: match.startAt, aiFavored: match.aiFavored,
    bowId, arrowId, targetId, cosmeticId, environmentId,
    players: [{ id: player.id, username: player.username, isBot: false }, { id: bot.id, username: bot.username, isBot: true }],
  });
  archeryMatches.set(match.id, match);
  activeArcheryByPlayer.set(player.id, match.id);
  player.socket.emit("archery:match-found", { matchId: match.id, tierId, startAt: match.startAt, environmentSeed: match.environmentSeed, opponent: archeryOpponent(bot), aiFavored: match.aiFavored });
  return match;
}

async function finalizeArcheryMatch(match, winnerType, input = {}) {
  if (match.finalized) return;
  match.finalized = true;
  if (match.disconnectTimer) clearTimeout(match.disconnectTimer);
  const winner = winnerType === "PLAYER" ? match.player : match.bot;
  const stats = sanitizedArcheryStats(input.stats);
  const durationMs = Math.max(8_000, Math.min(600_000, Number(input.durationMs) || Date.now() - match.startAt));
  const scores = input.scores && typeof input.scores === "object" ? input.scores : {};
  try {
    const persisted = await persistArchery({
      phase: "RESULT", matchId: match.id, winnerId: winner.id, durationMs, stats, scores,
      players: [{ id: match.player.id, username: match.player.username, isBot: false }, { id: match.bot.id, username: match.bot.username, isBot: true }],
    });
    match.player.socket.emit("archery:result", {
      winnerId: winner.id, winnerName: winner.username, xpAwarded: winnerType === "PLAYER" ? 600 : 240,
      creditsAwarded: winnerType === "PLAYER" ? match.tier.reward : 0, rankDelta: winnerType === "PLAYER" ? 20 : -9,
      durationMs, profile: persisted.profile,
    });
    setTimeout(() => {
      if (activeArcheryByPlayer.get(match.player.id) === match.id) activeArcheryByPlayer.delete(match.player.id);
      archeryMatches.delete(match.id);
    }, 120_000).unref();
  } catch (error) {
    match.finalized = false;
    match.player.socket.emit("archery:rejected", { message: error instanceof Error ? error.message : "The final archery score could not be verified." });
  }
}

function flagViolation(io, match, player, rule, telemetry) {
  player.violations += 1;
  player.socket.emit("race:warning", { rule, count: player.violations });
  void persist({ phase: "CHEAT", matchId: match.id, userId: player.id, rule, severity: player.violations > 2 ? "HIGH" : "MEDIUM", telemetry }).catch(() => undefined);
  if (player.violations >= 5) {
    player.disconnectedAt = Date.now();
    player.socket.emit("race:rejected", { message: "Race telemetry failed server validation." });
    finalizeMatch(io, match);
  }
}

await app.prepare();
const httpServer = createServer((request, response) => handle(request, response));
const io = createGameSocket(httpServer);

installPoolLive(io, `http://127.0.0.1:${port}`);

io.on("connection", (socket) => {
  const identity = socket.data.driver;
  socket.use(([event], nextPacket) => {
    if (event.startsWith("pool:")) return nextPacket(new Error("Use the authoritative pool-live protocol."));
    nextPacket();
  });
  socket.on("match:join", async (input = {}) => {
    const tierId = typeof input.tierId === "string" ? input.tierId : "";
    const vehicleId = typeof input.vehicleId === "string" ? input.vehicleId : "";
    if (!tiers[tierId] || !allowedVehicles.has(vehicleId)) return socket.emit("race:rejected", { message: "Select a valid competition tier and vehicle." });
    const activeId = activeMatchByPlayer.get(identity.id);
    if (activeId && matches.has(activeId)) {
      const match = matches.get(activeId);
      const player = match.players.get(identity.id);
      const rival = [...match.players.values()].find((item) => item.id !== identity.id);
      player.socket = socket;
      player.socketId = socket.id;
      player.disconnectedAt = null;
      socket.join(match.id);
      socket.emit("match:found", { matchId: match.id, startAt: match.startAt, environmentSeed: match.environmentSeed, opponent: publicOpponent(rival) });
      return;
    }
    const player = { ...identity, vehicleId, socket, socketId: socket.id, state: { x: -2.6, z: 0, speed: 0, heading: 0, checkpoint: 0, nitro: 42, drifting: false }, lastUpdate: Date.now(), finishTimeMs: null, stats: null, checkpoints: [], violations: 0, disconnectedAt: null };
    try {
      await createRaceMatch(io, player, tierId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Entry credits could not be reserved.";
      socket.emit("race:rejected", { message });
    }
  });

  socket.on("match:leave", () => undefined);

  socket.on("penalty:join", async (input = {}) => {
    const tierId = typeof input.tierId === "string" ? input.tierId : "";
    if (!penaltyTiers[tierId]) return socket.emit("penalty:rejected", { message: "Select a valid Penalty Kings competition tier." });
    const activeId = activePenaltyByPlayer.get(identity.id);
    if (activeId && penaltyMatches.has(activeId)) {
      const active = penaltyMatches.get(activeId);
      if (!active.finalized) {
        const player = active.players.get(identity.id);
        const rival = [...active.players.values()].find((item) => item.id !== identity.id);
        player.socket = socket;
        player.socketId = socket.id;
        player.disconnectedAt = null;
        socket.join(active.id);
        socket.emit("penalty:match-found", { matchId: active.id, startAt: active.startAt, environmentSeed: active.environmentSeed, opponent: penaltyOpponent(rival), firstStrikerId: active.order[0], tierId: active.tierId });
        if (active.pending && !active.pending.settled) {
          socket.emit("penalty:turn", {
            turn: active.turn,
            strikerId: active.pending.strikerId,
            keeperId: active.pending.keeperId,
            shotNumber: Math.floor(active.turn / 2) + 1,
            suddenDeath: active.suddenDeath,
            deadlineAt: active.pending.deadlineAt,
            pressureText: pressureText(active, identity.id, active.pending.strikerId),
            ...plainPenaltyState(active),
          });
        }
        return;
      }
      activePenaltyByPlayer.delete(identity.id);
    }
    const player = { ...identity, socket, socketId: socket.id, disconnectedAt: null };
    const rival = createPenaltyBot(identity, tierId);
    try {
      await createPenaltyMatch(io, player, rival, tierId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The match entry could not be reserved.";
      socket.emit("penalty:rejected", { message });
    }
  });

  socket.on("penalty:shoot", (input = {}) => {
    const matchId = activePenaltyByPlayer.get(identity.id);
    const match = matchId ? penaltyMatches.get(matchId) : null;
    if (!match || match.finalized || !match.pending || match.pending.settled || match.pending.strikerId !== identity.id || Number(input.turn) !== match.turn || match.pending.shot) return;
    if (!validShot(input)) return socket.emit("penalty:rejected", { message: "The shot gesture did not pass input validation." });
    match.pending.shot = {
      directionX: clamp(input.directionX, -1.2, 1.2),
      height: clamp(input.height, 0, 1.15),
      power: clamp(input.power, .18, 1),
      curve: clamp(input.curve, -1, 1),
      timing: clamp(input.timing, 0, 1),
      submittedAt: Date.now(),
    };
    if (match.players.get(match.pending.keeperId)?.isBot) match.pending.save = aiKeeperSave(match, match.pending.shot);
    if (match.pending.save) settlePenaltyTurn(io, match);
  });

  socket.on("penalty:save", (input = {}) => {
    const matchId = activePenaltyByPlayer.get(identity.id);
    const match = matchId ? penaltyMatches.get(matchId) : null;
    if (!match || match.finalized || !match.pending || match.pending.settled || match.pending.keeperId !== identity.id || Number(input.turn) !== match.turn || match.pending.save) return;
    if (!validKeeperZones.has(input.zone)) return socket.emit("penalty:rejected", { message: "Choose a valid goalkeeper dive." });
    match.pending.save = { zone: input.zone, submittedAt: Date.now() };
    if (match.pending.shot) settlePenaltyTurn(io, match);
  });

  socket.on("penalty:rematch", async () => {
    const matchId = activePenaltyByPlayer.get(identity.id);
    const match = matchId ? penaltyMatches.get(matchId) : null;
    if (!match?.finalized || !match.players.has(identity.id)) return;
    socket.emit("penalty:rematch-waiting");
    const player = match.players.get(identity.id);
    activePenaltyByPlayer.delete(identity.id);
    try {
      await createPenaltyMatch(io, player, createPenaltyBot(player, match.tierId), match.tierId);
      penaltyMatches.delete(match.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The rematch entry could not be reserved.";
      player.socket.emit("penalty:rejected", { message });
    }
  });

  socket.on("penalty:leave", () => {
    const matchId = activePenaltyByPlayer.get(identity.id);
    const match = matchId ? penaltyMatches.get(matchId) : null;
    if (match?.finalized) activePenaltyByPlayer.delete(identity.id);
  });

  socket.on("pool:join", async (input = {}) => {
    const tierId = typeof input.tierId === "string" ? input.tierId : "";
    if (!poolTiers[tierId]) return socket.emit("pool:rejected", { message: "Select a valid 8 Ball Cash Arena table." });
    const activeId = activePoolByPlayer.get(identity.id);
    if (activeId && poolMatches.has(activeId)) {
      const active = poolMatches.get(activeId);
      if (!active.finalized) {
        active.player.socket = socket;
        active.player.socketId = socket.id;
        if (active.disconnectTimer) clearTimeout(active.disconnectTimer);
        active.disconnectTimer = null;
        socket.emit("pool:match-found", { matchId: active.id, tierId: active.tierId, startAt: active.startAt, environmentSeed: active.environmentSeed, opponent: poolOpponent(active.bot), aiFavored: active.aiFavored });
        return;
      }
      activePoolByPlayer.delete(identity.id);
    }
    const player = { ...identity, socket, socketId: socket.id };
    try {
      await createPoolMatch(player, tierId, input);
    } catch (error) {
      socket.emit("pool:rejected", { message: error instanceof Error ? error.message : "The table entry could not be reserved." });
    }
  });

  socket.on("pool:finish", async (input = {}) => {
    const matchId = activePoolByPlayer.get(identity.id);
    const match = matchId ? poolMatches.get(matchId) : null;
    if (!match || match.finalized || Date.now() < match.startAt + 20_000) return socket.emit("pool:rejected", { message: "The rack ended before a valid 8-ball game could be completed." });
    const winnerType = input.winner === "PLAYER" ? "PLAYER" : input.winner === "AI" ? "AI" : null;
    if (!winnerType) return socket.emit("pool:rejected", { message: "The final rack result is invalid." });
    await finalizePoolMatch(match, winnerType, input);
  });

  socket.on("pool:rematch", async (input = {}) => {
    const matchId = activePoolByPlayer.get(identity.id);
    const match = matchId ? poolMatches.get(matchId) : null;
    if (!match?.finalized) return;
    const player = { ...match.player, socket, socketId: socket.id };
    activePoolByPlayer.delete(identity.id);
    try {
      await createPoolMatch(player, match.tierId, input);
      poolMatches.delete(match.id);
    } catch (error) {
      socket.emit("pool:rejected", { message: error instanceof Error ? error.message : "The next rack could not be started." });
    }
  });

  socket.on("pool:leave", () => {
    const matchId = activePoolByPlayer.get(identity.id);
    const match = matchId ? poolMatches.get(matchId) : null;
    if (match?.finalized) activePoolByPlayer.delete(identity.id);
  });

  socket.on("tower:join", async (input = {}) => {
    const tierId = typeof input.tierId === "string" ? input.tierId : "";
    if (!towerTiers[tierId]) return socket.emit("tower:rejected", { message: "Select a valid Tower Clash battlefield." });
    const activeId = activeTowerByPlayer.get(identity.id);
    if (activeId && towerMatches.has(activeId)) {
      const active = towerMatches.get(activeId);
      if (!active.finalized) {
        active.player.socket = socket;
        active.player.socketId = socket.id;
        if (active.disconnectTimer) clearTimeout(active.disconnectTimer);
        active.disconnectTimer = null;
        socket.emit("tower:match-found", { matchId: active.id, tierId: active.tierId, startAt: active.startAt, environmentSeed: active.environmentSeed, opponent: towerOpponent(active.bot), aiFavored: active.aiFavored });
        return;
      }
      activeTowerByPlayer.delete(identity.id);
    }
    const player = { ...identity, socket, socketId: socket.id };
    try {
      await createTowerMatch(player, tierId, input);
    } catch (error) {
      socket.emit("tower:rejected", { message: error instanceof Error ? error.message : "The battlefield entry could not be reserved." });
    }
  });

  socket.on("tower:finish", async (input = {}) => {
    const matchId = activeTowerByPlayer.get(identity.id);
    const match = matchId ? towerMatches.get(matchId) : null;
    if (!match || match.finalized || Date.now() < match.startAt + 10_000) return socket.emit("tower:rejected", { message: "The battle ended before a valid siege could be completed." });
    const winnerType = input.winner === "PLAYER" ? "PLAYER" : input.winner === "AI" ? "AI" : null;
    if (!winnerType) return socket.emit("tower:rejected", { message: "The final battle result is invalid." });
    await finalizeTowerMatch(match, winnerType, input);
  });

  socket.on("tower:rematch", async (input = {}) => {
    const matchId = activeTowerByPlayer.get(identity.id);
    const match = matchId ? towerMatches.get(matchId) : null;
    if (!match?.finalized) return;
    const player = { ...match.player, socket, socketId: socket.id };
    activeTowerByPlayer.delete(identity.id);
    try {
      await createTowerMatch(player, match.tierId, input);
      towerMatches.delete(match.id);
    } catch (error) {
      socket.emit("tower:rejected", { message: error instanceof Error ? error.message : "The next siege could not be started." });
    }
  });

  socket.on("tower:leave", () => {
    const matchId = activeTowerByPlayer.get(identity.id);
    const match = matchId ? towerMatches.get(matchId) : null;
    if (match?.finalized) activeTowerByPlayer.delete(identity.id);
  });

  socket.on("archery:join", async (input = {}) => {
    const tierId = typeof input.tierId === "string" ? input.tierId : "";
    if (!archeryTiers[tierId]) return socket.emit("archery:rejected", { message: "Select a valid Precision Arena competition." });
    const activeId = activeArcheryByPlayer.get(identity.id);
    if (activeId && archeryMatches.has(activeId)) {
      const active = archeryMatches.get(activeId);
      if (!active.finalized) {
        active.player.socket = socket;
        active.player.socketId = socket.id;
        if (active.disconnectTimer) clearTimeout(active.disconnectTimer);
        active.disconnectTimer = null;
        socket.emit("archery:match-found", { matchId: active.id, tierId: active.tierId, startAt: active.startAt, environmentSeed: active.environmentSeed, opponent: archeryOpponent(active.bot), aiFavored: active.aiFavored });
        return;
      }
      activeArcheryByPlayer.delete(identity.id);
    }
    const player = { ...identity, socket, socketId: socket.id };
    try {
      await createArcheryMatch(player, tierId, input);
    } catch (error) {
      socket.emit("archery:rejected", { message: error instanceof Error ? error.message : "The arena entry could not be reserved." });
    }
  });

  socket.on("archery:finish", async (input = {}) => {
    const matchId = activeArcheryByPlayer.get(identity.id);
    const match = matchId ? archeryMatches.get(matchId) : null;
    if (!match || match.finalized || Date.now() < match.startAt + 8_000) return socket.emit("archery:rejected", { message: "The duel ended before five valid rounds could be completed." });
    const winnerType = input.winner === "PLAYER" ? "PLAYER" : input.winner === "AI" ? "AI" : null;
    if (!winnerType) return socket.emit("archery:rejected", { message: "The final duel result is invalid." });
    await finalizeArcheryMatch(match, winnerType, input);
  });

  socket.on("archery:rematch", async (input = {}) => {
    const matchId = activeArcheryByPlayer.get(identity.id);
    const match = matchId ? archeryMatches.get(matchId) : null;
    if (!match?.finalized) return;
    const player = { ...match.player, socket, socketId: socket.id };
    activeArcheryByPlayer.delete(identity.id);
    try {
      await createArcheryMatch(player, match.tierId, input);
      archeryMatches.delete(match.id);
    } catch (error) {
      socket.emit("archery:rejected", { message: error instanceof Error ? error.message : "The next duel could not be started." });
    }
  });

  socket.on("archery:leave", () => {
    const matchId = activeArcheryByPlayer.get(identity.id);
    const match = matchId ? archeryMatches.get(matchId) : null;
    if (match?.finalized) activeArcheryByPlayer.delete(identity.id);
  });

  socket.on("race:state", (state = {}) => {
    const matchId = activeMatchByPlayer.get(identity.id);
    const match = matchId ? matches.get(matchId) : null;
    const player = match?.players.get(identity.id);
    if (!match || !player || match.finalized || Date.now() < match.startAt - 250) return;
    const fields = [state.x, state.z, state.speed, state.heading, state.checkpoint, state.nitro];
    if (fields.some((value) => typeof value !== "number" || !Number.isFinite(value))) return flagViolation(io, match, player, "MANIPULATED_VALUES", state);
    if (Math.abs(state.x) > 13 || state.speed < 0 || state.speed > 100 || state.z < -5 || state.z > 4225) return flagViolation(io, match, player, "IMPOSSIBLE_POSITION_OR_SPEED", state);
    const now = Date.now();
    const elapsed = Math.max(.01, (now - player.lastUpdate) / 1000);
    if (state.z - player.state.z > Math.max(12, elapsed * 110) || state.z < player.state.z - 28) return flagViolation(io, match, player, "TELEPORTATION", state);
    if (!Number.isInteger(state.checkpoint) || state.checkpoint < player.state.checkpoint || state.checkpoint > player.state.checkpoint + 1 || state.checkpoint > checkpoints.length) return flagViolation(io, match, player, "CHECKPOINT_SEQUENCE", state);
    if (state.checkpoint > player.state.checkpoint) {
      const requiredZ = checkpoints[state.checkpoint - 1];
      if (state.z < requiredZ - 18) return flagViolation(io, match, player, "CHECKPOINT_SKIP", state);
      player.checkpoints.push({ checkpoint: state.checkpoint, raceTimeMs: now - match.startAt, x: state.x, z: state.z });
    }
    player.state = { x: state.x, z: state.z, speed: state.speed, heading: state.heading, checkpoint: state.checkpoint, nitro: Math.max(0, Math.min(100, state.nitro)), drifting: Boolean(state.drifting) };
    player.lastUpdate = now;
    socket.to(match.id).emit("race:state", { playerId: identity.id, state: player.state });
  });

  socket.on("race:finish", (payload = {}) => {
    const matchId = activeMatchByPlayer.get(identity.id);
    const match = matchId ? matches.get(matchId) : null;
    const player = match?.players.get(identity.id);
    if (!match || !player || match.finalized || player.finishTimeMs !== null) return;
    const serverTime = Date.now() - match.startAt;
    if (serverTime < 42_000 || Number(payload.checkpoint) !== 7 || Number(payload.z) < 4190 || player.state.z < 4070 || player.state.checkpoint < 6) return flagViolation(io, match, player, "IMPOSSIBLE_FINISH", payload);
    player.finishTimeMs = serverTime;
    player.stats = sanitizedStats(payload.stats);
    if (!player.checkpoints.some((checkpoint) => checkpoint.checkpoint === 7)) player.checkpoints.push({ checkpoint: 7, raceTimeMs: serverTime, x: player.state.x, z: 4200 });
    const players = [...match.players.values()];
    if (players.every((item) => item.finishTimeMs !== null)) finalizeMatch(io, match);
    else if (!match.finishTimer) match.finishTimer = setTimeout(() => finalizeMatch(io, match), 12_000);
  });

  socket.on("disconnect", () => {
    const matchId = activeMatchByPlayer.get(identity.id);
    const match = matchId ? matches.get(matchId) : null;
    const player = match?.players.get(identity.id);
    if (!match || !player || match.finalized) return;
    player.disconnectedAt = Date.now();
    socket.to(match.id).emit("race:opponent-disconnected");
    setTimeout(() => {
      if (!match.finalized && player.disconnectedAt && Date.now() - player.disconnectedAt >= 14_500) finalizeMatch(io, match);
    }, 15_000).unref();
  });

  socket.on("disconnect", () => {
    const matchId = activePenaltyByPlayer.get(identity.id);
    const match = matchId ? penaltyMatches.get(matchId) : null;
    const player = match?.players.get(identity.id);
    if (!match || !player || match.finalized) return;
    player.disconnectedAt = Date.now();
    socket.to(match.id).emit("penalty:opponent-disconnected");
    setTimeout(() => {
      if (match.finalized || !player.disconnectedAt || Date.now() - player.disconnectedAt < 14_500) return;
      const rival = [...match.players.values()].find((item) => item.id !== identity.id);
      match.scores.set(rival.id, Math.max(match.scores.get(rival.id) || 0, (match.scores.get(identity.id) || 0) + 1));
      finalizePenaltyMatch(io, match);
    }, 15_000).unref();
  });

  socket.on("disconnect", () => {
    const matchId = activePoolByPlayer.get(identity.id);
    const match = matchId ? poolMatches.get(matchId) : null;
    if (!match || match.finalized || match.disconnectTimer) return;
    match.disconnectTimer = setTimeout(() => {
      if (!match.finalized) void finalizePoolMatch(match, "AI", { stats: {}, durationMs: Date.now() - match.startAt });
    }, 20_000);
    match.disconnectTimer.unref();
  });

  socket.on("disconnect", () => {
    const matchId = activeTowerByPlayer.get(identity.id);
    const match = matchId ? towerMatches.get(matchId) : null;
    if (!match || match.finalized || match.disconnectTimer) return;
    match.disconnectTimer = setTimeout(() => {
      if (!match.finalized) void finalizeTowerMatch(match, "AI", { stats: {}, durationMs: Date.now() - match.startAt });
    }, 15_000);
    match.disconnectTimer.unref();
  });

  socket.on("disconnect", () => {
    const matchId = activeArcheryByPlayer.get(identity.id);
    const match = matchId ? archeryMatches.get(matchId) : null;
    if (!match || match.finalized || match.disconnectTimer) return;
    match.disconnectTimer = setTimeout(() => {
      if (!match.finalized) void finalizeArcheryMatch(match, "AI", { stats: {}, durationMs: Date.now() - match.startAt });
    }, 15_000);
    match.disconnectTimer.unref();
  });
});

httpServer.once("error", (error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exit(1); });
httpServer.listen(port, hostname, () => process.stdout.write(`Neon Drift ${dev ? "development" : "production"} server ready at http://${hostname}:${port}\n`));
