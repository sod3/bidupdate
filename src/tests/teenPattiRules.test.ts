import { describe, expect, it } from "vitest";
import {
  applyTeenPattiAction,
  arrangeTeenPattiHandsForDifficulty,
  callAmount,
  createTeenPattiRound,
  dealTeenPattiHands,
  raiseAmount,
  selectTeenPattiAiNames,
  TEEN_PATTI_TARGET_WIN_PERCENT,
} from "@/lib/teen-patti/engine";
import {
  compareTeenPattiHands,
  createDeck,
  evaluateTeenPattiHand,
  type Suit,
  type TeenPattiCard,
} from "@/lib/teen-patti/rules";

function card(rank: TeenPattiCard["rank"], suit: Suit): TeenPattiCard {
  return { rank, suit };
}

function seededRandom(seed = 19) {
  let value = seed >>> 0;
  return (maxExclusive: number) => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value % maxExclusive;
  };
}

describe("Teen Patti hand rules", () => {
  it("creates one unique 52-card deck", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((item) => `${item.rank}${item.suit}`)).size).toBe(52);
  });

  it("ranks all six hand classes in the correct order", () => {
    const hands: TeenPattiCard[][] = [
      [card(14, "S"), card(9, "D"), card(4, "C")],
      [card(10, "S"), card(10, "D"), card(3, "C")],
      [card(14, "H"), card(9, "H"), card(4, "H")],
      [card(8, "S"), card(7, "D"), card(6, "C")],
      [card(8, "S"), card(7, "S"), card(6, "S")],
      [card(12, "S"), card(12, "D"), card(12, "C")],
    ];
    expect(hands.map((hand) => evaluateTeenPattiHand(hand).name)).toEqual([
      "High Card", "Pair", "Color", "Sequence", "Pure Sequence", "Trail / Trio",
    ]);
    for (let index = 1; index < hands.length; index += 1) {
      expect(compareTeenPattiHands(hands[index], hands[index - 1])).toBe(1);
    }
  });

  it("uses A-K-Q then A-2-3 as the two highest sequences", () => {
    const akq = [card(14, "S"), card(13, "D"), card(12, "C")];
    const a23 = [card(14, "D"), card(3, "C"), card(2, "H")];
    const kqj = [card(13, "H"), card(12, "C"), card(11, "S")];
    expect(compareTeenPattiHands(akq, a23)).toBe(1);
    expect(compareTeenPattiHands(a23, kqj)).toBe(1);
  });

  it("breaks pairs by pair rank and then the kicker", () => {
    const kings = [card(13, "S"), card(13, "D"), card(2, "H")];
    const queens = [card(12, "S"), card(12, "D"), card(14, "H")];
    const kingsHighKicker = [card(13, "H"), card(13, "C"), card(3, "S")];
    expect(compareTeenPattiHands(kings, queens)).toBe(1);
    expect(compareTeenPattiHands(kingsHighKicker, kings)).toBe(1);
  });

  it("rejects duplicate or incomplete hands", () => {
    expect(() => evaluateTeenPattiHand([card(14, "S"), card(14, "S"), card(2, "H")])).toThrow(/duplicate/i);
    expect(() => evaluateTeenPattiHand([card(14, "S"), card(2, "H")])).toThrow(/exactly three/i);
  });

  it("matches the exhaustive 52-card hand-class distribution", () => {
    const deck = createDeck();
    const counts = new Map<string, number>();
    for (let first = 0; first < deck.length - 2; first += 1) {
      for (let second = first + 1; second < deck.length - 1; second += 1) {
        for (let third = second + 1; third < deck.length; third += 1) {
          const name = evaluateTeenPattiHand([deck[first], deck[second], deck[third]]).name;
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
    }
    expect(Object.fromEntries(counts)).toEqual({
      "Trail / Trio": 52,
      "Pure Sequence": 48,
      Sequence: 720,
      Color: 1096,
      Pair: 3744,
      "High Card": 16440,
    });
  });
});

describe("Teen Patti server game engine", () => {
  it("deals four natural, non-overlapping hands", () => {
    const hands = dealTeenPattiHands(seededRandom(21));
    const allCards = hands.flat();
    expect(allCards).toHaveLength(12);
    expect(new Set(allCards.map((item) => `${item.rank}${item.suit}`)).size).toBe(12);
  });

  it("rotates all three AI opponents between consecutive tables", () => {
    const first = selectTeenPattiAiNames(seededRandom(22));
    const second = selectTeenPattiAiNames(seededRandom(23), first);
    expect(new Set(first).size).toBe(3);
    expect(new Set(second).size).toBe(3);
    expect(second.some((name) => first.includes(name))).toBe(false);
  });

  it("does not condition the human seat to a fixed win or loss", () => {
    let humanWins = 0;
    const samples = 400;
    for (let seed = 1; seed <= samples; seed += 1) {
      const hands = dealTeenPattiHands(seededRandom(seed));
      if (hands.slice(1).every((hand) => compareTeenPattiHands(hands[0], hand) > 0)) humanWins += 1;
    }
    expect(humanWins).toBeGreaterThan(samples * 0.15);
    expect(humanWins).toBeLessThan(samples * 0.35);
  });

  it("uses a 10% strongest-hand path for the human seat in Very Hard rounds", () => {
    expect(TEEN_PATTI_TARGET_WIN_PERCENT).toBe(10);
    let strongestHumanRounds = 0;
    const samples = 1_000;
    for (let seed = 1; seed <= samples; seed += 1) {
      const round = createTeenPattiRound({ roundId: `round-${seed}`, username: "Player", stake: 50, randomIndex: seededRandom(seed) });
      const human = round.players[0];
      if (round.players.slice(1).every((player) => compareTeenPattiHands(human.cards, player.cards) > 0)) strongestHumanRounds += 1;
    }
    expect(strongestHumanRounds / samples).toBeGreaterThan(0.07);
    expect(strongestHumanRounds / samples).toBeLessThan(0.13);
  });

  it("assigns the weakest or strongest hand without changing the cards", () => {
    const dealt = dealTeenPattiHands(seededRandom(29));
    const hard = arrangeTeenPattiHandsForDifficulty(dealt, true);
    const rarePlayerFavored = arrangeTeenPattiHandsForDifficulty(dealt, false);
    expect(hard.slice(1).every((hand) => compareTeenPattiHands(hard[0], hand) < 0)).toBe(true);
    expect(rarePlayerFavored.slice(1).every((hand) => compareTeenPattiHands(rarePlayerFavored[0], hand) > 0)).toBe(true);
    expect(new Set(hard.flat().map((item) => `${item.rank}${item.suit}`))).toEqual(new Set(dealt.flat().map((item) => `${item.rank}${item.suit}`)));
  });

  it("charges blind and seen chaal/raise amounts from server state", () => {
    const round = createTeenPattiRound({ roundId: "round", username: "Player", stake: 100, randomIndex: seededRandom(31) });
    expect(round.pot).toBe(400);
    expect(callAmount(round)).toBe(100);
    expect(raiseAmount(round)).toBe(200);
    expect(applyTeenPattiAction(round, "SEEN", seededRandom(32))).toEqual({ debit: 0 });
    expect(callAmount(round)).toBe(200);
    expect(raiseAmount(round)).toBe(400);
  });

  it("keeps the round alive after the first bet without AI folds, raises, or show", () => {
    const round = createTeenPattiRound({ roundId: "round", username: "Player", stake: 50, randomIndex: seededRandom(35) });
    expect(applyTeenPattiAction(round, "CHAAL", seededRandom(36))).toEqual({ debit: 50 });
    expect(round.status).toBe("PLAYING");
    expect(round.playerBetTurns).toBe(1);
    expect(round.currentBet).toBe(50);
    expect(round.players.filter((player) => player.folded)).toHaveLength(0);
    expect(round.lastActionBatch.some((event) => ["Pack", "Raise", "Show"].includes(event.action))).toBe(false);
  });

  it("allows at most one early AI fold and does not raise before the third bet", () => {
    const round = createTeenPattiRound({ roundId: "round", username: "Player", stake: 50, randomIndex: seededRandom(37) });
    applyTeenPattiAction(round, "CHAAL", seededRandom(38));
    applyTeenPattiAction(round, "CHAAL", seededRandom(39));
    expect(round.status).toBe("PLAYING");
    expect(round.players.filter((player) => player.folded).length).toBeLessThanOrEqual(1);
    expect(round.lastActionBatch.filter((event) => event.action === "Raise")).toHaveLength(0);
    expect(round.lastActionBatch.some((event) => event.action === "Show")).toBe(false);
  });

  it("reaches a showdown only after several normal player bets", () => {
    const round = createTeenPattiRound({ roundId: "round", username: "Player", stake: 50, randomIndex: seededRandom(43) });
    let safety = 0;
    while (round.status === "PLAYING" && safety < 6) {
      applyTeenPattiAction(round, "CHAAL", seededRandom(44 + safety));
      safety += 1;
    }
    expect(round.status).toBe("COMPLETED");
    expect(round.playerBetTurns).toBeGreaterThanOrEqual(4);
    expect(round.playerBetTurns).toBeLessThanOrEqual(6);
  });

  it("packs without another debit and completes against the strongest active AI", () => {
    const round = createTeenPattiRound({ roundId: "round", username: "Player", stake: 50, randomIndex: seededRandom(41) });
    expect(applyTeenPattiAction(round, "PACK", seededRandom(42))).toEqual({ debit: 0 });
    expect(round.status).toBe("COMPLETED");
    expect(round.winner?.id).toMatch(/^AI_/);
    expect(round.playerPaid).toBe(50);
  });

  it("allows a seen player to request a two-player show with exact server cost", () => {
    const round = createTeenPattiRound({ roundId: "round", username: "Player", stake: 50, randomIndex: seededRandom(51) });
    round.players[0].seen = true;
    round.players[0].cards = [card(9, "H"), card(9, "D"), card(9, "S")];
    round.players[1].folded = true;
    round.players[2].folded = true;
    round.players[3].cards = [card(14, "C"), card(8, "D"), card(4, "S")];
    expect(applyTeenPattiAction(round, "SHOW", seededRandom(52))).toEqual({ debit: 100 });
    expect(round.status).toBe("COMPLETED");
    expect(round.winner?.id).toBe("PLAYER");
    expect(round.winner?.handName).toBe("Trail / Trio");
  });
});
