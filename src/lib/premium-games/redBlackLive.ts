import type { ClientHistoryItem, CompletedPremiumRound } from "@/lib/premium-games/client";

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
export type RedBlackSide = Exclude<Winner, "TIE">;

export interface RedBlackTablePlayer {
  name: string;
  avatar: number;
  balance: number;
}

export interface RedBlackRecentResult {
  roundId: string;
  result: Winner;
  completedAt: string;
}

export const RED_BLACK_TABLE_PLAYER_NAMES = [
  "Aarav Mehta", "Aisha Khan", "Alejandro Ruiz", "Alina Petrova", "Amara Okafor", "Amelia Brooks",
  "Anaya Kapoor", "Andrei Popov", "Arjun Malhotra", "Ava Bennett", "Bilal Ahmed", "Camila Santos",
  "Carlos Mendes", "Chloe Martin", "Daniel Kim", "Daria Novak", "David Chen", "Diego Morales",
  "Elena Rossi", "Elias Haddad", "Ella Thompson", "Emma Laurent", "Ethan Walker", "Farah Ali",
  "Fatima Zahra", "Felix Wagner", "Gabriel Costa", "Giulia Romano", "Hana Suzuki", "Hassan Raza",
  "Helena Costa", "Hugo Martins", "Ibrahim Saleh", "Imran Qureshi", "Ines Duarte", "Isabella Reed",
  "Ivan Petrov", "Javier Ortega", "Jonas Fischer", "Julia Weber", "Kaito Tanaka", "Karim Mansour",
  "Khadija Noor", "Lara Schmidt", "Layla Rahman", "Leo Anderson", "Leonie Keller", "Liam Murphy",
  "Lina Haddad", "Lucas Moreau", "Mariam Saeed", "Mateo Silva", "Maya Iqbal", "Mei Lin",
  "Mia Jensen", "Mika Sato", "Nadia Hussain", "Naomi Clark", "Nicolas Dubois", "Nina Horvat",
  "Noah Williams", "Noor Siddiqui", "Omar Farooq", "Priya Sharma", "Rafael Pereira", "Rania Khalil",
  "Rayan Aziz", "Rohan Desai", "Sara Ibrahim", "Sofia Alvarez", "Sora Nakamura", "Tariq Mahmood",
  "Theo Bernard", "Valentina Cruz", "Victor Ivanov", "Yara Mansour", "Yasmin Akhtar", "Yuki Mori",
  "Zain Abbas", "Zara Sheikh", "Zoya Mirza", "Adrian Cole", "Amina Diallo", "Claire Wilson",
  "Daan de Vries", "Eva Kowalska", "Finn Olsen", "Grace Taylor", "Henry Scott", "Leila Nasser",
  "Marco Bianchi", "Mina Park", "Nathan Lewis", "Salma Hamid", "Samir Bashir", "Talia Cohen",
] as const;

function shuffle<T>(values: readonly T[], random: () => number) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function createRedBlackTablePlayers(
  random: () => number = Math.random,
  excludedNames: readonly string[] = [],
): RedBlackTablePlayer[] {
  const excluded = new Set(excludedNames.map((name) => name.trim().toLocaleLowerCase()).filter(Boolean));
  const availableNames = RED_BLACK_TABLE_PLAYER_NAMES.filter((name) => !excluded.has(name.toLocaleLowerCase()));
  const names = shuffle(availableNames.length >= 6 ? availableNames : RED_BLACK_TABLE_PLAYER_NAMES, random);
  const avatars = shuffle(Array.from({ length: 8 }, (_, index) => index), random);
  return Array.from({ length: 6 }, (_, index) => ({
    name: names[index],
    avatar: avatars[index],
    balance: 2400 + Math.floor(random() * 24_000),
  }));
}

export function redBlackResultFromRound(round: CompletedPremiumRound): Winner {
  const winner = round.payload.winner;
  if (winner === "RED" || winner === "BLACK" || winner === "TIE") return winner;
  if (round.winningOptions.includes("RED")) return "RED";
  if (round.winningOptions.includes("BLACK")) return "BLACK";
  return "TIE";
}

export function redBlackResultFromHistoryItem(item: ClientHistoryItem): Winner {
  const label = item.label.toLocaleUpperCase();
  if (/\bBLACK\b/.test(label)) return "BLACK";
  if (/\bRED\b/.test(label)) return "RED";
  return "TIE";
}

export function mergeRedBlackRecentResults(
  current: readonly RedBlackRecentResult[],
  incoming: readonly RedBlackRecentResult[],
) {
  const byRound = new Map<string, RedBlackRecentResult>();
  [...incoming, ...current].forEach((item) => {
    if (!byRound.has(item.roundId)) byRound.set(item.roundId, item);
  });
  return [...byRound.values()]
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime())
    .slice(0, 18);
}

export function shouldRevealRedBlackCard(
  side: RedBlackSide,
  index: number,
  phase: RedBlackLivePhase,
  revealStep: number,
) {
  if (phase === "RESULT" || phase === "PAYOUT") return true;
  if (phase !== "REVEALING") return false;
  return revealStep >= (side === "BLACK" ? index + 1 : index + 4);
}

export function updateRedBlackBet(
  current: ReadonlyMap<string, number>,
  side: RedBlackSide,
  chip: number,
  removing = false,
) {
  const existing = current.get(side) ?? 0;
  if (removing) {
    const next = new Map(current);
    const amount = existing - chip;
    if (amount > 0) next.set(side, amount);
    else next.delete(side);
    return next;
  }
  if (!current.has(side)) return new Map<string, number>([[side, chip]]);
  return new Map<string, number>([[side, existing + chip]]);
}

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
  const ranks = cards.map((card) => card.rank === 1 ? 14 : card.rank).sort((a, b) => b - a);
  const groups = [...new Set(ranks)].map((rank) => ({ rank, count: ranks.filter((value) => value === rank).length }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const normalized = ranks.includes(14) && ranks.includes(3) && ranks.includes(2) ? [3, 2, 1] : ranks;
  const straight = new Set(normalized).size === 3 && normalized[0] - normalized[2] === 2;
  const category = straight && flush ? 5 : groups[0].count === 3 ? 4 : straight ? 3 : flush ? 2 : groups[0].count === 2 ? 1 : 0;
  const key = category === 5 || category === 3
    ? [category, normalized[0]]
    : category === 4
      ? [category, groups[0].rank]
      : category === 1
        ? [category, groups[0].rank, ...groups.slice(1).map((group) => group.rank).sort((a, b) => b - a)]
        : [category, ...ranks];
  return {
    category,
    label: ["HIGH CARD", "PAIR", "FLUSH", "STRAIGHT", "TRIPLE", "STRAIGHT FLUSH"][category],
    key,
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
}): CompletedPremiumRound {
  const baseSeed = ((input.sequence + 1) * 2654435761) ^ Date.now();
  const hand = deal(baseSeed);
  const winningOptions: string[] = [];
  if (hand.winner !== "TIE") winningOptions.push(hand.winner);
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
    selections: [],
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
