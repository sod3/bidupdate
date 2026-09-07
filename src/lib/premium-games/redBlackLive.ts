import type { CompletedPremiumRound } from "@/lib/premium-games/client";

export type RedBlackLivePhase =
  | "NEXT_ROUND"
  | "COUNTDOWN"
  | "BETTING"
  | "BETTING_CLOSING"
  | "DEALING"
  | "REVEALING"
  | "RESULT"
  | "PAYOUT"
  | "ROUND_END";

export interface RedBlackCard {
  rank: number;
  label: string;
  suit: "♠" | "♥" | "♦" | "♣";
  color: "RED" | "BLACK";
}

type Winner = "RED" | "BLACK" | "TIE";

const suits = ["♠", "♥", "♦", "♣"] as const;
const labels = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffledDeck(random: () => number) {
  const cards: RedBlackCard[] = suits.flatMap((suit) => labels.map((label, index) => ({
    rank: index + 1,
    label,
    suit,
    color: suit === "♥" || suit === "♦" ? "RED" as const : "BLACK" as const,
  })));
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

function score(cards: readonly RedBlackCard[]) {
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const groups = [...new Set(ranks)].map((rank) => ({ rank, count: ranks.filter((value) => value === rank).length }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const normalized = ranks.includes(13) && ranks.includes(1) && ranks.includes(2) ? [3, 2, 1] : ranks;
  const straight = new Set(normalized).size === 3 && normalized[0] - normalized[2] === 2;
  const category = straight && flush ? 5 : groups[0].count === 3 ? 4 : straight ? 3 : flush ? 2 : groups[0].count === 2 ? 1 : 0;
  return {
    category,
    label: ["HIGH CARD", "PAIR", "FLUSH", "STRAIGHT", "TRIPLE", "STRAIGHT FLUSH"][category],
    key: [category, ...groups.flatMap((group) => [group.count, group.rank])],
  };
}

function compare(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) - (right[index] ?? 0);
  }
  return 0;
}

function deal(seed: number) {
  const cards = shuffledDeck(seededRandom(seed));
  const red = cards.slice(0, 3);
  const black = cards.slice(3, 6);
  const redHand = score(red);
  const blackHand = score(black);
  const comparison = compare(redHand.key, blackHand.key);
  const winner: Winner = comparison > 0 ? "RED" : comparison < 0 ? "BLACK" : "TIE";
  return { red, black, redHand, blackHand, winner };
}

/**
 * Produces a client-only spectator round. It deliberately carries zero stake,
 * zero payout and the caller's unchanged balance so attract-mode activity can
 * never touch the authenticated wallet.
 */
export function createRedBlackDemoRound(input: {
  sequence: number;
  balance: number;
  previousWinner?: Winner;
}): CompletedPremiumRound {
  const baseSeed = ((input.sequence + 1) * 2654435761) ^ Date.now();
  const preferenceRandom = seededRandom(baseSeed ^ 0x9e3779b9);
  const preferred = input.previousWinner && input.previousWinner !== "TIE" && preferenceRandom() < 0.24
    ? input.previousWinner
    : undefined;
  let hand = deal(baseSeed);
  for (let attempt = 1; preferred && hand.winner !== preferred && attempt < 24; attempt += 1) {
    hand = deal(baseSeed + attempt * 7919);
  }
  const winningOptions: string[] = [];
  if (hand.winner !== "TIE") winningOptions.push(hand.winner);
  const types = new Set([hand.redHand.label, hand.blackHand.label]);
  if (types.has("PAIR")) winningOptions.push("PAIR");
  if (types.has("HIGH CARD")) winningOptions.push("HIGH_CARD");
  if (types.has("STRAIGHT") || types.has("STRAIGHT FLUSH")) winningOptions.push("STRAIGHT");
  if (types.has("FLUSH") || types.has("STRAIGHT FLUSH")) winningOptions.push("FLUSH");
  const now = new Date().toISOString();
  const roundId = `red-vs-black-demo-${input.sequence}-${baseSeed >>> 0}`;
  return {
    roundId,
    requestId: roundId,
    gameId: "red-vs-black",
    status: "COMPLETED",
    result: "PUSH",
    label: hand.winner === "TIE" ? "ROYAL DRAW" : `${hand.winner} KINGDOM WINS`,
    totalStake: 0,
    payout: 0,
    net: 0,
    balance: input.balance,
    multiplier: 0,
    winningOptions,
    payload: {
      red: hand.red,
      black: hand.black,
      redHand: hand.redHand.label,
      blackHand: hand.blackHand.label,
      winner: hand.winner,
      demo: true,
    },
    commitment: "spectator-only",
    seed: "spectator-only",
    resultHash: "spectator-only",
    startedAt: now,
    completedAt: now,
  };
}

export function isDemoRedBlackRound(round: CompletedPremiumRound | null) {
  return round?.payload?.demo === true;
}
