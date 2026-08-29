import { compareTeenPattiHands, createDeck, evaluateTeenPattiHand, type TeenPattiCard } from "@/lib/teen-patti/rules";
import { VERY_HARD_PLAYER_TARGET_WIN_PERCENT, isVeryHardOpponentFavoredRoll } from "@/lib/gameDifficulty";

export const TEEN_PATTI_STAKES = [50, 100, 250, 500] as const;
export const HUMAN_PLAYER_ID = "PLAYER";
export const TEEN_PATTI_TARGET_WIN_PERCENT = VERY_HARD_PLAYER_TARGET_WIN_PERCENT;

export type TeenPattiStake = (typeof TEEN_PATTI_STAKES)[number];
export type TeenPattiAction = "SEEN" | "CHAAL" | "RAISE" | "PACK" | "SHOW";
export type RandomIndex = (maxExclusive: number) => number;

export interface TeenPattiPlayerState {
  id: string;
  name: string;
  isHuman: boolean;
  cards: TeenPattiCard[];
  seen: boolean;
  folded: boolean;
  contribution: number;
  lastAction: string;
}

export interface TeenPattiActionEvent {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  amount: number;
  potAfter: number;
  at: string;
}

export interface TeenPattiWinner {
  id: string;
  name: string;
  cards: TeenPattiCard[];
  handName: string;
  reason: "PACK" | "SHOW" | "FORCED_SHOW" | "LAST_PLAYER";
}

export interface TeenPattiRoundState {
  roundId: string;
  stakePreset: TeenPattiStake;
  pot: number;
  currentBet: number;
  playerPaid: number;
  payout: number;
  status: "PLAYING" | "COMPLETED";
  turnPlayerId: string;
  actionCount: number;
  playerBetTurns: number;
  aiFavored: boolean;
  players: TeenPattiPlayerState[];
  actionHistory: TeenPattiActionEvent[];
  lastActionBatch: TeenPattiActionEvent[];
  winner: TeenPattiWinner | null;
  startedAt: Date;
  completedAt: Date | null;
}

export const TEEN_PATTI_AI_NAMES = [
  "RANI", "SULTAN", "NAWAB", "MEHR", "ZAYN", "NOOR", "SAHIL", "AYLA",
  "RAZA", "INAYA", "KABIR", "MAHNOOR", "ARYAN", "ZARA", "FARIS", "HIBA",
  "REYAN", "ALINA", "DANIYAL", "MIRA", "AZLAN", "SANA", "HAMZA", "ESHA",
] as const;

function shuffledDeck(randomIndex: RandomIndex) {
  const deck = createDeck();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

/** Deals four natural hands from one freshly shuffled 52-card deck. */
export function dealTeenPattiHands(randomIndex: RandomIndex) {
  const deck = shuffledDeck(randomIndex);
  return [0, 1, 2, 3].map((playerIndex) => deck.slice(playerIndex * 3, playerIndex * 3 + 3));
}

export function arrangeTeenPattiHandsForDifficulty(hands: TeenPattiCard[][], aiFavored: boolean) {
  if (hands.length !== 4 || hands.some((hand) => hand.length !== 3)) throw new Error("Teen Patti difficulty requires four complete hands.");
  const ranked = [...hands].sort((left, right) => compareTeenPattiHands(left, right));
  const humanHand = aiFavored ? ranked.shift() : ranked.pop();
  if (!humanHand) throw new Error("Teen Patti could not assign the human hand.");
  return [humanHand, ...ranked];
}

export function selectTeenPattiAiNames(randomIndex: RandomIndex, previousNames: readonly string[] = []) {
  const previous = new Set(previousNames.map((name) => name.toLocaleUpperCase()));
  const fresh = TEEN_PATTI_AI_NAMES.filter((name) => !previous.has(name));
  const pool = fresh.length >= 3 ? fresh : [...TEEN_PATTI_AI_NAMES];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, 3);
}

export function createTeenPattiRound(input: {
  roundId: string;
  username: string;
  stake: TeenPattiStake;
  randomIndex: RandomIndex;
  previousAiNames?: readonly string[];
  now?: Date;
}): TeenPattiRoundState {
  const dealtHands = dealTeenPattiHands(input.randomIndex);
  const aiFavored = isVeryHardOpponentFavoredRoll(input.randomIndex(100));
  const hands = arrangeTeenPattiHandsForDifficulty(dealtHands, aiFavored);
  const aiNames = selectTeenPattiAiNames(input.randomIndex, input.previousAiNames);
  const players: TeenPattiPlayerState[] = [
    { id: HUMAN_PLAYER_ID, name: input.username, isHuman: true, cards: hands[0], seen: false, folded: false, contribution: input.stake, lastAction: "Boot" },
    ...aiNames.map((name, index) => ({ id: `AI_${index + 1}`, name, isHuman: false, cards: hands[index + 1], seen: false, folded: false, contribution: input.stake, lastAction: "Boot" })),
  ];
  const now = input.now ?? new Date();
  return {
    roundId: input.roundId,
    stakePreset: input.stake,
    pot: input.stake * players.length,
    currentBet: input.stake,
    playerPaid: input.stake,
    payout: 0,
    status: "PLAYING",
    turnPlayerId: HUMAN_PLAYER_ID,
    actionCount: 0,
    playerBetTurns: 0,
    aiFavored,
    players,
    actionHistory: [],
    lastActionBatch: [],
    winner: null,
    startedAt: now,
    completedAt: null,
  };
}

export function activeTeenPattiPlayers(round: TeenPattiRoundState) {
  return round.players.filter((player) => !player.folded);
}

export function humanTeenPattiPlayer(round: TeenPattiRoundState) {
  const human = round.players.find((player) => player.isHuman);
  if (!human) throw new Error("Teen Patti round has no human player.");
  return human;
}

export function callAmount(round: TeenPattiRoundState, player = humanTeenPattiPlayer(round)) {
  return round.currentBet * (player.seen ? 2 : 1);
}

export function raiseAmount(round: TeenPattiRoundState, player = humanTeenPattiPlayer(round)) {
  return callAmount(round, player) * 2;
}

function appendEvent(round: TeenPattiRoundState, player: TeenPattiPlayerState, action: string, amount = 0) {
  player.lastAction = action;
  const event: TeenPattiActionEvent = {
    id: `${round.roundId}:${round.actionHistory.length + 1}`,
    actorId: player.id,
    actorName: player.name,
    action,
    amount,
    potAfter: round.pot,
    at: new Date().toISOString(),
  };
  round.actionHistory.push(event);
  round.lastActionBatch.push(event);
  round.actionCount += 1;
}

function finishRound(round: TeenPattiRoundState, winner: TeenPattiPlayerState, reason: TeenPattiWinner["reason"]) {
  round.status = "COMPLETED";
  round.turnPlayerId = "";
  round.completedAt = new Date();
  round.winner = {
    id: winner.id,
    name: winner.name,
    cards: winner.cards,
    handName: evaluateTeenPattiHand(winner.cards).name,
    reason,
  };
}

function strongestActive(round: TeenPattiRoundState) {
  const active = activeTeenPattiPlayers(round);
  return active.reduce((best, candidate) => compareTeenPattiHands(candidate.cards, best.cards) > 0 ? candidate : best);
}

function settleLastPlayer(round: TeenPattiRoundState) {
  const active = activeTeenPattiPlayers(round);
  if (active.length === 1) {
    finishRound(round, active[0], "LAST_PLAYER");
    return true;
  }
  return false;
}

function resolveShow(round: TeenPattiRoundState, requester: TeenPattiPlayerState, opponent: TeenPattiPlayerState, forced = false) {
  const comparison = compareTeenPattiHands(requester.cards, opponent.cards);
  // Standard side-show rule: the requester loses an exactly tied comparison.
  finishRound(round, comparison > 0 ? requester : opponent, forced ? "FORCED_SHOW" : "SHOW");
}

type AiDecision = "NONE" | "CALL" | "FOLD" | "RAISE" | "SHOW";

function aiTurn(
  round: TeenPattiRoundState,
  ai: TeenPattiPlayerState,
  randomIndex: RandomIndex,
  options: { allowFold: boolean; allowRaise: boolean },
): AiDecision {
  if (ai.folded || round.status !== "PLAYING") return "NONE";
  const active = activeTeenPattiPlayers(round);
  if (active.length <= 1) return "NONE";

  const hand = evaluateTeenPattiHand(ai.cards);
  const isStrongest = active.every((other) => other.id === ai.id || compareTeenPattiHands(ai.cards, other.cards) >= 0);
  const confident = hand.category >= 2 || hand.tiebreak[0] >= 13;
  const seeChance = confident ? 82 : 54;
  if (!ai.seen && (round.actionCount >= 3 || randomIndex(100) < seeChance)) {
    ai.seen = true;
    appendEvent(round, ai, "Seen");
  }

  const currentActive = activeTeenPattiPlayers(round);
  const showChance = hand.category >= 3 ? 62 : hand.category === 2 ? 42 : hand.tiebreak[0] >= 13 ? 25 : 10;
  if (round.playerBetTurns >= 4 && currentActive.length === 2 && ai.seen && (round.playerBetTurns >= 5 || randomIndex(100) < showChance)) {
    const showCost = callAmount(round, ai);
    ai.contribution += showCost;
    round.pot += showCost;
    appendEvent(round, ai, "Show", showCost);
    const opponent = currentActive.find((player) => player.id !== ai.id);
    if (opponent) resolveShow(round, ai, opponent);
    return "SHOW";
  }

  const weakFoldChance = hand.category === 1 ? (confident ? 12 : 38) : hand.category === 2 ? 7 : 1;
  const protectedWinner = isStrongest;
  if (options.allowFold && !protectedWinner && randomIndex(100) < weakFoldChance) {
    ai.folded = true;
    appendEvent(round, ai, "Pack");
    settleLastPlayer(round);
    return "FOLD";
  }

  const canRaise = options.allowRaise && round.currentBet < round.stakePreset * 4;
  const raiseChance = hand.category >= 4 ? 48 : hand.category >= 2 ? 31 : confident ? 12 : 4;
  if (canRaise && randomIndex(100) < raiseChance) {
    const amount = raiseAmount(round, ai);
    ai.contribution += amount;
    round.pot += amount;
    round.currentBet *= 2;
    appendEvent(round, ai, "Raise", amount);
    return "RAISE";
  }

  const amount = callAmount(round, ai);
  ai.contribution += amount;
  round.pot += amount;
  appendEvent(round, ai, ai.seen ? "Chaal" : "Blind", amount);
  return "CALL";
}

export function runTeenPattiAiCycle(round: TeenPattiRoundState, randomIndex: RandomIndex) {
  let foldedThisCycle = false;
  let raisedThisCycle = false;
  const aiHasRaisedThisRound = round.actionHistory.some((event) => event.actorId.startsWith("AI_") && event.action === "Raise");
  for (const ai of round.players.filter((player) => !player.isHuman)) {
    const decision = aiTurn(round, ai, randomIndex, {
      allowFold: round.playerBetTurns >= 2 && !foldedThisCycle,
      allowRaise: round.playerBetTurns >= 3 && !aiHasRaisedThisRound && !raisedThisCycle,
    });
    if (decision === "FOLD") foldedThisCycle = true;
    if (decision === "RAISE") raisedThisCycle = true;
    if (round.status === "COMPLETED") return;
  }
  if (settleLastPlayer(round)) return;
  if (round.playerBetTurns >= 6) finishRound(round, strongestActive(round), "FORCED_SHOW");
  else round.turnPlayerId = HUMAN_PLAYER_ID;
}

export function applyTeenPattiAction(round: TeenPattiRoundState, action: TeenPattiAction, randomIndex: RandomIndex) {
  if (round.status !== "PLAYING") throw new Error("ROUND_COMPLETE");
  if (round.turnPlayerId !== HUMAN_PLAYER_ID) throw new Error("NOT_PLAYER_TURN");
  const human = humanTeenPattiPlayer(round);
  round.lastActionBatch = [];

  if (action === "SEEN") {
    if (human.seen) throw new Error("ALREADY_SEEN");
    human.seen = true;
    appendEvent(round, human, "Seen");
    return { debit: 0 };
  }

  if (action === "PACK") {
    human.folded = true;
    appendEvent(round, human, "Pack");
    finishRound(round, strongestActive(round), "PACK");
    return { debit: 0 };
  }

  if (action === "SHOW") {
    const active = activeTeenPattiPlayers(round);
    if (!human.seen) throw new Error("SHOW_REQUIRES_SEEN");
    if (active.length !== 2) throw new Error("SHOW_REQUIRES_TWO");
    const amount = callAmount(round, human);
    human.contribution += amount;
    round.playerPaid += amount;
    round.pot += amount;
    round.playerBetTurns += 1;
    appendEvent(round, human, "Show", amount);
    const opponent = active.find((player) => !player.isHuman);
    if (!opponent) throw new Error("SHOW_OPPONENT_MISSING");
    resolveShow(round, human, opponent);
    return { debit: amount };
  }

  const amount = action === "RAISE" ? raiseAmount(round, human) : callAmount(round, human);
  human.contribution += amount;
  round.playerPaid += amount;
  round.pot += amount;
  round.playerBetTurns += 1;
  if (action === "RAISE") round.currentBet *= 2;
  appendEvent(round, human, action === "RAISE" ? "Raise" : human.seen ? "Chaal" : "Blind", amount);
  round.turnPlayerId = "AI";
  runTeenPattiAiCycle(round, randomIndex);
  return { debit: amount };
}
