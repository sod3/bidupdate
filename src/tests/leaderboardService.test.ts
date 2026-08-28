import { describe, expect, it } from "vitest";
import { mergeLeaderboardEntries, type LeaderboardEntry } from "@/services/leaderboardService";

function entry(input: Partial<LeaderboardEntry> & Pick<LeaderboardEntry, "userId" | "username" | "rankPoints" | "wins" | "isBot">): LeaderboardEntry {
  return {
    losses: 0,
    winRate: 100,
    bestTimeMs: null,
    rankName: "Gold I",
    xp: 1000,
    winStreak: 0,
    balance: 0,
    ...input,
  };
}

describe("mergeLeaderboardEntries", () => {
  it("combines real and simulated competitors and recalculates rank", () => {
    const leaders = mergeLeaderboardEntries(
      [entry({ userId: "real-1", username: "RealPlayer", rankPoints: 1200, wins: 20, balance: 400, isBot: false })],
      [entry({ userId: "bot:1", username: "SimPlayer", rankPoints: 1400, wins: 30, balance: 9000, isBot: true })],
    );

    expect(leaders.map((leader) => leader.username)).toEqual(["SimPlayer", "RealPlayer"]);
    expect(leaders.map((leader) => leader.rank)).toEqual([1, 2]);
    expect(leaders[0]).toMatchObject({ isBot: true, balance: 9000 });
    expect(leaders[1]).toMatchObject({ isBot: false, balance: 400 });
  });

  it("uses wins and then best time as tie breakers", () => {
    const leaders = mergeLeaderboardEntries([
      entry({ userId: "a", username: "A", rankPoints: 1000, wins: 10, bestTimeMs: 80_000, isBot: false }),
      entry({ userId: "b", username: "B", rankPoints: 1000, wins: 11, bestTimeMs: 90_000, isBot: false }),
      entry({ userId: "c", username: "C", rankPoints: 1000, wins: 10, bestTimeMs: 70_000, isBot: false }),
    ], []);

    expect(leaders.map((leader) => leader.username)).toEqual(["B", "C", "A"]);
  });
});
