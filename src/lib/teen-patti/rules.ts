export const SUITS = ["H", "D", "C", "S"] as const;
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export type Suit = (typeof SUITS)[number];
export type CardRank = (typeof RANKS)[number];

export interface TeenPattiCard {
  rank: CardRank;
  suit: Suit;
}

export type TeenPattiHandName =
  | "Trail / Trio"
  | "Pure Sequence"
  | "Sequence"
  | "Color"
  | "Pair"
  | "High Card";

export interface TeenPattiHandRank {
  category: 1 | 2 | 3 | 4 | 5 | 6;
  name: TeenPattiHandName;
  tiebreak: number[];
}

export function createDeck(): TeenPattiCard[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

function sequenceValue(sortedRanks: number[]) {
  if (sortedRanks[0] === 14 && sortedRanks[1] === 13 && sortedRanks[2] === 12) return 15;
  if (sortedRanks[0] === 14 && sortedRanks[1] === 3 && sortedRanks[2] === 2) return 14;
  return sortedRanks[0] - sortedRanks[1] === 1 && sortedRanks[1] - sortedRanks[2] === 1
    ? sortedRanks[0]
    : null;
}

/**
 * Standard three-card Teen Patti ranking. Sequence order follows the common
 * A-K-Q, A-2-3, K-Q-J ... 4-3-2 house rule.
 */
export function evaluateTeenPattiHand(cards: readonly TeenPattiCard[]): TeenPattiHandRank {
  if (cards.length !== 3) throw new Error("A Teen Patti hand must contain exactly three cards.");
  const uniqueCards = new Set(cards.map((card) => `${card.rank}${card.suit}`));
  if (uniqueCards.size !== 3) throw new Error("A Teen Patti hand cannot contain duplicate cards.");

  const ranks = cards.map((card) => card.rank).sort((left, right) => right - left);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straight = sequenceValue(ranks);

  if (counts.size === 1) return { category: 6, name: "Trail / Trio", tiebreak: [ranks[0]] };
  if (flush && straight !== null) return { category: 5, name: "Pure Sequence", tiebreak: [straight] };
  if (straight !== null) return { category: 4, name: "Sequence", tiebreak: [straight] };
  if (flush) return { category: 3, name: "Color", tiebreak: ranks };

  const pair = [...counts.entries()].find(([, count]) => count === 2);
  if (pair) {
    const kicker = ranks.find((rank) => rank !== pair[0]);
    return { category: 2, name: "Pair", tiebreak: [pair[0], kicker ?? 0] };
  }
  return { category: 1, name: "High Card", tiebreak: ranks };
}

export function compareTeenPattiHands(left: readonly TeenPattiCard[], right: readonly TeenPattiCard[]) {
  const a = evaluateTeenPattiHand(left);
  const b = evaluateTeenPattiHand(right);
  if (a.category !== b.category) return Math.sign(a.category - b.category);
  const length = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a.tiebreak[index] ?? 0) - (b.tiebreak[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function rankLabel(rank: number) {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return String(rank);
}

export function suitSymbol(suit: Suit) {
  return ({ H: "♥", D: "♦", C: "♣", S: "♠" } as const)[suit];
}

export function isRedSuit(suit: Suit) {
  return suit === "H" || suit === "D";
}
