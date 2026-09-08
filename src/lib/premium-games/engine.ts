import { premiumGame, type PremiumGameId } from "@/lib/premium-games/definitions";
import { VERY_HARD_DIFFICULTY_VERSION, VERY_HARD_PLAYER_TARGET_WIN_PERCENT } from "@/lib/gameDifficulty";
import { RNGService } from "@/lib/premium-games/rngService";

export interface RoundSelection {
  id: string;
  amount: number;
}

export interface PremiumRoundOutcome {
  result: "WIN" | "LOSS" | "PUSH";
  label: string;
  payout: number;
  multiplier: number;
  winningOptions: string[];
  payload: Record<string, unknown>;
}

const rouletteReds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const moneySymbols = ["CASH", "DIAMOND", "CROWN", "SEVEN", "GOLD", "COIN", "VAULT", "WILD", "BONUS"] as const;
const thunderSymbols = ["CROWN", "CRYSTAL", "GOBLET", "RING", "RUNE", "PHOENIX", "SHIELD", "DIAMOND", "COIN"] as const;
const suits = ["♠", "♥", "♦", "♣"] as const;
const rankLabels = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const PREMIUM_OUTCOME_SEARCH_LIMIT = 512;
export const PREMIUM_TARGET_WIN_PERCENT = VERY_HARD_PLAYER_TARGET_WIN_PERCENT;

function credits(value: number) {
  return Math.max(0, Math.round((value + Number.EPSILON) * 100) / 100);
}

function totalStake(selections: readonly RoundSelection[]) {
  return credits(selections.reduce((sum, item) => sum + item.amount, 0));
}

function settle(selections: readonly RoundSelection[], winning: ReadonlyMap<string, number>, label: string, payload: Record<string, unknown>): PremiumRoundOutcome {
  const stake = totalStake(selections);
  const payout = credits(selections.reduce((sum, item) => sum + (winning.get(item.id) ?? 0) * item.amount, 0));
  return {
    result: payout > stake ? "WIN" : payout === stake && payout > 0 ? "PUSH" : "LOSS",
    label,
    payout,
    multiplier: stake ? credits(payout / stake) : 0,
    winningOptions: [...winning.keys()],
    payload,
  };
}

function roulette(rng: RNGService, selections: readonly RoundSelection[]) {
  const number = rng.int(37);
  const red = rouletteReds.has(number);
  const winning = new Map<string, number>([[`N_${number}`, 36]]);
  if (number > 0) {
    winning.set(red ? "RED" : "BLACK", 2);
    winning.set(number % 2 ? "ODD" : "EVEN", 2);
    winning.set(number <= 18 ? "LOW" : "HIGH", 2);
    winning.set(`DOZEN_${Math.ceil(number / 12)}`, 3);
    winning.set(`COLUMN_${((number - 1) % 3) + 1}`, 3);
  }
  return settle(selections, winning, number === 0 ? "0 · GREEN" : `${number} · ${red ? "RED" : "BLACK"}`, { number, color: number === 0 ? "GREEN" : red ? "RED" : "BLACK" });
}

function weightedCar(rng: RNGService, selections: readonly RoundSelection[]) {
  const cars = [
    ["FALCON_X", "FALCON X", 32, 2],
    ["VORTEX_R", "VORTEX R", 24, 3],
    ["PHANTOM_GT", "PHANTOM GT", 18, 4],
    ["RAZOR_X", "RAZOR X", 12, 6],
    ["NEBULA_RS", "NEBULA RS", 8, 9],
    ["HYPERION", "HYPERION", 6, 12],
  ] as const;
  let cursor = rng.int(100);
  const winner = cars.find((car) => (cursor -= car[2]) < 0) ?? cars[0];
  return settle(selections, new Map([[winner[0], winner[3]]]), `${winner[1]} WINS`, { car: winner[0], multiplier: winner[3] });
}

interface Card {
  rank: number;
  label: string;
  suit: (typeof suits)[number];
  color: "RED" | "BLACK";
}

function deck(rng: RNGService) {
  const cards: Card[] = suits.flatMap((suit) => rankLabels.map((label, rank) => ({ rank: rank + 1, label, suit, color: suit === "♥" || suit === "♦" ? "RED" as const : "BLACK" as const })));
  return rng.shuffle(cards);
}

function cardView(card: Card) {
  return { rank: card.rank, label: card.label, suit: card.suit, color: card.color };
}

function handScore(cards: readonly Card[]) {
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const groups = [...new Set(ranks)].map((rank) => ({ rank, count: ranks.filter((value) => value === rank).length })).sort((a, b) => b.count - a.count || b.rank - a.rank);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const normalized = ranks.includes(13) && ranks.includes(1) && ranks.includes(2) ? [3, 2, 1] : ranks;
  const straight = new Set(normalized).size === 3 && normalized[0] - normalized[2] === 2;
  const category = straight && flush ? 5 : groups[0].count === 3 ? 4 : straight ? 3 : flush ? 2 : groups[0].count === 2 ? 1 : 0;
  const label = ["HIGH CARD", "PAIR", "FLUSH", "STRAIGHT", "TRIPLE", "STRAIGHT FLUSH"][category];
  return { category, label, key: [category, ...groups.flatMap((group) => [group.count, group.rank])] };
}

function compareKeys(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) - (right[index] ?? 0);
  }
  return 0;
}

function cardDuel(rng: RNGService, selections: readonly RoundSelection[]) {
  const cards = deck(rng);
  const red = cards.slice(0, 3);
  const black = cards.slice(3, 6);
  const redScore = handScore(red);
  const blackScore = handScore(black);
  const comparison = compareKeys(redScore.key, blackScore.key);
  const winner = comparison > 0 ? "RED" : comparison < 0 ? "BLACK" : "TIE";
  const winning = new Map<string, number>();
  if (winner !== "TIE") winning.set(winner, 1.95);
  else {
    winning.set("RED", 1);
    winning.set("BLACK", 1);
  }
  const types = new Set([redScore.label, blackScore.label]);
  if (types.has("PAIR")) winning.set("PAIR", 4);
  if (types.has("HIGH CARD")) winning.set("HIGH_CARD", 1.4);
  if (types.has("STRAIGHT") || types.has("STRAIGHT FLUSH")) winning.set("STRAIGHT", 8);
  if (types.has("FLUSH") || types.has("STRAIGHT FLUSH")) winning.set("FLUSH", 6);
  return settle(selections, winning, winner === "TIE" ? "ROYAL DRAW" : `${winner} KINGDOM WINS`, {
    red: red.map(cardView), black: black.map(cardView), redHand: redScore.label, blackHand: blackScore.label, winner,
  });
}

function sicBo(rng: RNGService, selections: readonly RoundSelection[]) {
  const dice = [rng.int(6) + 1, rng.int(6) + 1, rng.int(6) + 1];
  const total = dice.reduce((sum, die) => sum + die, 0);
  const triple = dice.every((die) => die === dice[0]);
  const winning = new Map<string, number>();
  if (!triple) {
    winning.set(total >= 11 ? "BIG" : "SMALL", 2);
    winning.set(total % 2 ? "ODD" : "EVEN", 2);
  }
  winning.set(`TOTAL_${total}`, total === 10 || total === 11 ? 7 : 12);
  for (let value = 1; value <= 6; value += 1) if (dice.filter((die) => die === value).length >= 2) winning.set(`DOUBLE_${value}`, 11);
  if (triple) winning.set("ANY_TRIPLE", 31);
  return settle(selections, winning, `${total} · ${triple ? "TRIPLE" : total >= 11 ? "BIG" : "SMALL"}`, { dice, total, triple });
}

function dragonTiger(rng: RNGService, selections: readonly RoundSelection[]) {
  const cards = deck(rng);
  const dragon = cards[0];
  const tiger = cards[1];
  const winner = dragon.rank > tiger.rank ? "DRAGON" : dragon.rank < tiger.rank ? "TIGER" : "TIE";
  const winning = new Map<string, number>();
  if (winner === "TIE") {
    winning.set("TIE", 9);
    winning.set("DRAGON", 1);
    winning.set("TIGER", 1);
  } else winning.set(winner, 1.95);
  return settle(selections, winning, `${winner} ${winner === "TIE" ? "ROUND" : "WINS"}`, { dragon: cardView(dragon), tiger: cardView(tiger), winner });
}

function thunder(rng: RNGService, selections: readonly RoundSelection[]) {
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 6 }, () => rng.pick(thunderSymbols)));
  const counts = new Map<string, number>();
  grid.flat().forEach((symbol) => counts.set(symbol, (counts.get(symbol) ?? 0) + 1));
  const clusters = [...counts].filter(([, count]) => count >= 8).map(([symbol, count]) => ({ symbol, count }));
  const rune = rng.float() < 0.16 ? rng.pick([2, 3, 5, 10, 25] as const) : 1;
  const baseMultiplier = clusters.reduce((sum, cluster) => sum + (cluster.count - 7) * 0.45, 0);
  const multiplier = Math.min(100, credits(baseMultiplier * rune));
  const stake = totalStake(selections);
  const payout = credits(stake * multiplier);
  return {
    result: payout > stake ? "WIN" as const : "LOSS" as const,
    label: payout ? rune > 1 ? `STORM MULTIPLIER ${rune}×` : `${clusters.length} TUMBLE WIN` : "STORM PASSES",
    payout,
    multiplier,
    winningOptions: payout ? ["SPIN"] : [],
    payload: { grid, clusters, rune },
  };
}

const moneyLines = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1],
  [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 2, 2, 2, 0], [2, 0, 0, 0, 2], [1, 1, 0, 1, 1],
] as const;

function moneyMachine(rng: RNGService, selections: readonly RoundSelection[]) {
  const grid = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => rng.pick(moneySymbols)));
  let lineMultiplier = 0;
  const wins: Array<{ line: number; symbol: string; count: number }> = [];
  moneyLines.forEach((line, lineIndex) => {
    const values = line.map((row, column) => grid[row][column]);
    const symbol = values.find((value) => value !== "WILD") ?? "WILD";
    let count = 0;
    for (const value of values) {
      if (value === symbol || value === "WILD") count += 1;
      else break;
    }
    if (count >= 3 && symbol !== "BONUS") {
      const weight = symbol === "VAULT" ? 1.6 : symbol === "DIAMOND" ? 1.25 : symbol === "SEVEN" ? 1.1 : 0.75;
      lineMultiplier += (count - 2) * weight;
      wins.push({ line: lineIndex + 1, symbol, count });
    }
  });
  const bonusCount = grid.flat().filter((symbol) => symbol === "BONUS").length;
  const bonus = bonusCount >= 3 ? rng.pick([3, 5, 8, 10, 15, 25] as const) : 0;
  const multiplier = Math.min(100, credits((lineMultiplier / moneyLines.length) * 4 + bonus));
  const stake = totalStake(selections);
  const payout = credits(stake * multiplier);
  return {
    result: payout > stake ? "WIN" as const : "LOSS" as const,
    label: bonus ? `MONEY WHEEL ${bonus}×` : payout ? `${wins.length} LINE WIN` : "VAULT LOCKED",
    payout,
    multiplier,
    winningOptions: payout ? ["SPIN"] : [],
    payload: { grid, wins, bonusCount, bonus },
  };
}

function createNaturalPremiumOutcome(gameId: PremiumGameId, seed: string, selections: readonly RoundSelection[]) {
  const rng = new RNGService(seed);
  switch (gameId) {
    case "royal-roulette": return roulette(rng, selections);
    case "thunder-gods": return thunder(rng, selections);
    case "car-roulette": return weightedCar(rng, selections);
    case "red-vs-black": return cardDuel(rng, selections);
    case "sic-bo": return sicBo(rng, selections);
    case "dragon-tiger": return dragonTiger(rng, selections);
    case "money-machine": return moneyMachine(rng, selections);
    case "flight-x": throw new Error("Flight X uses its committed live-round flow.");
  }
}

function withVeryHardMetadata(outcome: PremiumRoundOutcome, requestedResult: "WIN" | "LOSS") {
  return {
    ...outcome,
    payload: {
      ...outcome.payload,
      difficulty: {
        version: VERY_HARD_DIFFICULTY_VERSION,
        targetWinPercent: PREMIUM_TARGET_WIN_PERCENT,
        requestedResult,
      },
    },
  };
}

/**
 * Resolves a deterministic Very Hard round. A committed difficulty roll asks
 * for a winning result 10% of the time and a losing result 90% of the time.
 * Candidate outcomes are still produced by each game's normal rules; selecting
 * every possible outcome can therefore fall back to the closest valid result.
 */
export function createPremiumOutcome(gameId: PremiumGameId, seed: string, selections: readonly RoundSelection[]) {
  if (gameId === "flight-x") throw new Error("Flight X uses its committed live-round flow.");
  const targetWin = new RNGService(`${seed}:${VERY_HARD_DIFFICULTY_VERSION}:target`).int(100) < PREMIUM_TARGET_WIN_PERCENT;
  const requestedResult = targetWin ? "WIN" as const : "LOSS" as const;
  let closest: PremiumRoundOutcome | null = null;

  for (let index = 0; index < PREMIUM_OUTCOME_SEARCH_LIMIT; index += 1) {
    const candidate = createNaturalPremiumOutcome(gameId, `${seed}:${VERY_HARD_DIFFICULTY_VERSION}:candidate:${index}`, selections);
    if (candidate.result === requestedResult) return withVeryHardMetadata(candidate, requestedResult);
    if (!closest || (targetWin ? candidate.payout > closest.payout : candidate.payout < closest.payout)) closest = candidate;
  }

  if (!closest) throw new Error("A premium game outcome could not be generated.");
  return withVeryHardMetadata(closest, requestedResult);
}

export function createFlightCrash(seed: string) {
  const rng = new RNGService(seed);
  // A crash curve uses a house factor near one, not the target win-rate used
  // by the fixed-outcome games. The old 0.10 numerator made ~90% of flights
  // end at exactly 1.00x. A 0.90 factor keeps the game difficult (10% instant
  // crashes and 55% below 2x) while still producing playable flights.
  const houseFactor = 0.9;
  const multiplier = Math.max(1, Math.floor((houseFactor / (1 - rng.float())) * 100) / 100);
  return credits(multiplier);
}

export function flightMultiplierAt(elapsedMs: number) {
  return credits(Math.exp(Math.max(0, elapsedMs) / 5500));
}

export function flightElapsedFor(multiplier: number) {
  return Math.max(0, Math.log(Math.max(1, multiplier)) * 5500);
}

export function validateSelections(gameId: PremiumGameId, selections: readonly RoundSelection[]) {
  const game = premiumGame(gameId);
  const allowed = new Set(game.options.map((option) => option.id));
  if (!selections.length || selections.some((item) => !allowed.has(item.id) || !Number.isInteger(item.amount) || !game.chips.includes(item.amount))) return false;
  const stake = totalStake(selections);
  return stake >= game.minStake && stake <= game.maxStake;
}
