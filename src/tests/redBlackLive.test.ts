import { describe, expect, it, vi } from "vitest";
import { createRedBlackDemoRound } from "@/lib/premium-games/redBlackLive";

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
});
