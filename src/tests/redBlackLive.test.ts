import { describe, expect, it, vi } from "vitest";
import { createRedBlackDemoRound, createRedBlackTablePlayers, mergeRedBlackRecentResults, RED_BLACK_TABLE_PLAYER_NAMES, redBlackResultFromHistoryItem, redBlackResultFromRound, shouldRevealRedBlackCard, updateRedBlackBet } from "@/lib/premium-games/redBlackLive";

describe("Red vs Black spectator rounds", () => {
  it("creates a complete varied card duel without mutating the supplied balance", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_777);
    const round = createRedBlackDemoRound({ sequence: 7, balance: 12_345 });
    const cards = [...round.payload.red as Array<{ label: string; suit: string }>, ...round.payload.black as Array<{ label: string; suit: string }>];

    expect(round.status).toBe("COMPLETED");
    expect(round.totalStake).toBe(0);
    expect(round.payout).toBe(0);
    expect(round.net).toBe(0);
    expect(round.balance).toBe(12_345);
    expect(round.payload.demo).toBe(true);
    expect(new Set(cards.map((card) => `${card.label}${card.suit}`))).toHaveLength(6);
    expect(["RED", "BLACK", "TIE"]).toContain(round.payload.winner);
    vi.restoreAllMocks();
  });

  it("keeps demo results visually varied across round sequences", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_777);
    const signatures = Array.from({ length: 8 }, (_, sequence) => {
      const round = createRedBlackDemoRound({ sequence, balance: 5000 });
      return JSON.stringify([round.payload.red, round.payload.black]);
    });

    expect(new Set(signatures).size).toBeGreaterThan(5);
    vi.restoreAllMocks();
  });

  it("keeps exactly one active kingdom while updating the displayed stake", () => {
    let bets = updateRedBlackBet(new Map(), "RED", 20);
    bets = updateRedBlackBet(bets, "RED", 100);
    expect([...bets]).toEqual([["RED", 120]]);

    bets = updateRedBlackBet(bets, "BLACK", 200);
    expect([...bets]).toEqual([["BLACK", 200]]);

    bets = updateRedBlackBet(bets, "BLACK", 100, true);
    expect([...bets]).toEqual([["BLACK", 100]]);
    bets = updateRedBlackBet(bets, "BLACK", 100, true);
    expect(bets.size).toBe(0);
  });

  it("reveals all Black cards first, then all Red cards, and flips them back at round end", () => {
    expect([0, 1, 2].map((index) => shouldRevealRedBlackCard("BLACK", index, "REVEALING", 2))).toEqual([true, true, false]);
    expect([0, 1, 2].map((index) => shouldRevealRedBlackCard("RED", index, "REVEALING", 3))).toEqual([false, false, false]);
    expect([0, 1, 2].map((index) => shouldRevealRedBlackCard("RED", index, "REVEALING", 5))).toEqual([true, true, false]);
    expect(shouldRevealRedBlackCard("RED", 2, "RESULT", 0)).toBe(true);
    expect(shouldRevealRedBlackCard("BLACK", 0, "ROUND_END", 6)).toBe(false);
  });

  it("creates six unique players and a fresh roster for a new table entry", () => {
    const first = createRedBlackTablePlayers(() => .1);
    const second = createRedBlackTablePlayers(() => .9, first.map((player) => player.name));
    expect(RED_BLACK_TABLE_PLAYER_NAMES.length).toBeGreaterThanOrEqual(80);
    expect(first).toHaveLength(6);
    expect(new Set(first.map((player) => player.name)).size).toBe(6);
    expect(new Set(first.map((player) => player.avatar)).size).toBe(6);
    expect(second.map((player) => player.name).some((name) => first.some((player) => player.name === name))).toBe(false);
  });

  it("derives recent-result colors from actual round state and historical outcomes", () => {
    const redRound = createRedBlackDemoRound({ sequence: 1, balance: 1000 });
    redRound.payload.winner = "RED";
    redRound.winningOptions = ["RED"];
    redRound.label = "Unrelated display copy";
    expect(redBlackResultFromRound(redRound)).toBe("RED");

    const blackRound = createRedBlackDemoRound({ sequence: 2, balance: 1000 });
    blackRound.payload.winner = "BLACK";
    blackRound.winningOptions = ["BLACK"];
    blackRound.label = "Unrelated display copy";
    expect(redBlackResultFromRound(blackRound)).toBe("BLACK");

    expect(redBlackResultFromHistoryItem({
      roundId: "old-black", result: "LOSS", label: "Black Kingdom Wins", stake: 20,
      payout: 0, multiplier: 0, createdAt: new Date().toISOString(),
    })).toBe("BLACK");
  });

  it("keeps multiple completed rounds in newest-first order without duplicates", () => {
    const older = { roundId: "round-1", result: "RED" as const, completedAt: "2026-09-15T10:00:00.000Z" };
    const newer = { roundId: "round-2", result: "BLACK" as const, completedAt: "2026-09-15T10:01:00.000Z" };
    const latest = { roundId: "round-3", result: "RED" as const, completedAt: "2026-09-15T10:02:00.000Z" };
    const afterTwoRounds = mergeRedBlackRecentResults([older], [newer]);
    const afterReloadSync = mergeRedBlackRecentResults(afterTwoRounds, [newer, older]);
    expect(mergeRedBlackRecentResults(afterReloadSync, [latest])).toEqual([latest, newer, older]);
  });
});
