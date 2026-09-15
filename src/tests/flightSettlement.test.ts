import { beforeEach, describe, expect, it, vi } from "vitest";
import { flightElapsedFor, flightSnapshot } from "@/lib/premium-games/flightState";
import { createFlightCrash } from "@/lib/premium-games/engine";

interface StoredBet { id: string; amount: number; state: string; cashOutMultiplier: number | null; payout: number }
interface StoredRound { [key: string]: unknown; status: string; flightBets: StoredBet[]; outcome: { multiplier: number; payload: { crashMultiplier: number } } }
const memory = vi.hoisted(() => ({ row: {} as StoredRound, balance: 800, rewards: 0, history: [] as { multiplier: number }[] }));
vi.mock("@/lib/db", () => ({ connectDB: async () => ({ connection: { transaction: async (fn: (session: object) => Promise<void>) => fn({}) } }) }));
vi.mock("@/services/walletService", () => ({ applyWalletChange: async ({ amount }: { amount: number }) => {
  memory.balance += amount; memory.rewards++;
  return { wallet: { balance: memory.balance } };
} }));
vi.mock("@/models", () => {
  const query = (value: () => unknown) => ({ select() { return this; }, session() { return this; }, lean: async () => value() });
  const model = { updateOne: async () => ({}), create: async () => ({}) };
  return {
    GameRound: { findOne: (filter: Record<string, unknown>) => query(() => filter.status && filter.status !== memory.row.status ? null : structuredClone(memory.row)),
      updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
        const match = filter.flightBets as { $elemMatch?: { id?: string; state?: string } } | undefined;
        if (match?.$elemMatch) {
          const bet = memory.row.flightBets.find(item => item.id === match.$elemMatch?.id && item.state === match.$elemMatch?.state);
          if (!bet) return { modifiedCount: 0 };
          bet.state = String(update.$set["flightBets.$[cashoutBet].state"]);
          bet.cashOutMultiplier = Number(update.$set["flightBets.$[cashoutBet].cashOutMultiplier"]);
          bet.payout = Number(update.$set["flightBets.$[cashoutBet].payout"]);
          return { modifiedCount: 1 };
        }
        Object.assign(memory.row, structuredClone(update.$set));
        return { modifiedCount: 1 };
      } },
    GameBet: { ...model, findOne: () => query(() => ({ betId: "bet" })) },
    GameHistory: { create: async (rows: { multiplier: number }[]) => memory.history.push(...rows) },
    GameResult: model, PlayerGameStat: model, RngRound: model, GameSession: model,
    BetSelection: model, GameSetting: model, Wallet: model,
  };
});
import { settleFlightRound } from "@/services/serverResultService";

function setup(crash = 30.47) {
  memory.balance = 800; memory.rewards = 0; memory.history = [];
  memory.row = { roundId: "round", userId: "user", gameId: "flight-x", status: "PLAYING", startedAt: new Date(0),
    crashMultiplier: crash, totalStake: 200, balanceAfter: 800, rngSeed: "seed", sessionId: "session",
    outcome: { multiplier: 0, payload: { crashMultiplier: 0 } },
    flightBets: ["FLIGHT_1", "FLIGHT_2"].map(id => ({ id, amount: 100, state: "active", cashOutMultiplier: null, payout: 0 })) };
}
beforeEach(() => setup());
describe("Aviator settlement event ordering", () => {
  it("pays once immediately and keeps the round and other bet active", async () => {
    const first = await settleFlightRound("user", "round", true, "FLIGHT_1", 2000, 1.43);
    expect(first.status).toBe("PLAYING");
    expect(memory.balance).toBe(943);
    expect(memory.row.flightBets.map((bet) => bet.state)).toEqual(["cashed_out", "active"]);
    await settleFlightRound("user", "round", true, "FLIGHT_1", 2100, 1.45);
    expect(memory.rewards).toBe(1);
    await settleFlightRound("user", "round", false);
    expect(memory.row.flightBets.map((bet) => bet.state)).toEqual(["cashed_out", "lost"]);
    expect(memory.balance).toBe(943);
    expect(memory.row.outcome.multiplier).toBe(30.47);
    expect(memory.history[0].multiplier).toBe(30.47);
  });
  it("settles both panels independently under concurrent duplicate requests", async () => {
    await Promise.all(["FLIGHT_1", "FLIGHT_2", "FLIGHT_1", "FLIGHT_2"].map(id =>
      settleFlightRound("user", "round", true, id as "FLIGHT_1" | "FLIGHT_2", 2000, 1.43)));
    expect(memory.rewards).toBe(2);
    expect(memory.balance).toBe(1086);
    expect(memory.row.status).toBe("PLAYING");
    await settleFlightRound("user", "round", false);
    expect(memory.row.flightBets.map(bet => bet.state)).toEqual(["cashed_out", "cashed_out"]);
  });
  it("rejects cash-out at or after the crash", async () => {
    await settleFlightRound("user", "round", true, "FLIGHT_1", flightElapsedFor(30.47));
    await settleFlightRound("user", "round", true, "FLIGHT_1", flightElapsedFor(30.47) + 1);
    expect(memory.rewards).toBe(0);
    expect(memory.row.flightBets[0].state).toBe("lost");
    expect(memory.history).toHaveLength(1);
  });
  it.each([1.01, 1.5, 2, 5.25])("locks and pays an accepted %sx cash-out", async (captured) => {
    const requestedAt = flightElapsedFor(captured);
    await settleFlightRound("user", "round", true, "FLIGHT_1", requestedAt, captured);
    expect(memory.row.flightBets[0]).toMatchObject({ state: "cashed_out", cashOutMultiplier: captured, payout: captured * 100 });
    expect(memory.balance).toBe(800 + captured * 100);
  });
  it("matches render, settlement and history over 1000 rounds with skipped frames and duplicate cash-outs", async () => {
    for (let index = 0; index < 1000; index++) {
      const crash = createFlightCrash(`settlement-${index}`);
      setup(crash);
      if (crash > 1.01) {
        const elapsed = flightElapsedFor(crash) / 2;
        const captured = flightSnapshot(elapsed, crash).multiplier;
        await settleFlightRound("user", "round", true, "FLIGHT_1", elapsed, captured);
        await settleFlightRound("user", "round", true, "FLIGHT_1", elapsed, captured);
        expect(memory.rewards).toBe(1);
      }
      await settleFlightRound("user", "round", false);
      const displayed = flightSnapshot(flightElapsedFor(crash) + 350, crash);
      expect(displayed).toEqual({ crashed: true, multiplier: crash });
      expect(memory.row.outcome.payload.crashMultiplier).toBe(displayed.multiplier);
      expect(memory.history[0].multiplier).toBe(displayed.multiplier);
      if (memory.rewards) expect(memory.row.flightBets[0].state).toBe("cashed_out");
    }
  });
});
