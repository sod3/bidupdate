import type { PremiumGameId } from "@/lib/premium-games/definitions";

export interface ClientRoundSelection {
  id: string;
  amount: number;
}

export interface ClientHistoryItem {
  roundId: string;
  result: "WIN" | "LOSS" | "PUSH";
  label: string;
  stake: number;
  payout: number;
  multiplier: number;
  createdAt: string;
}

export interface ActiveFlightRound {
  crashMultiplier: number;
  roundId: string;
  requestId: string;
  gameId: "flight-x";
  status: "PLAYING";
  totalStake: number;
  balance: number;
  commitment: string;
  startedAt: string;
  serverNow: string;
  bets: FlightBetResult[];
  acceptedCashout?: FlightBetResult;
}

export type FlightBetState = "idle" | "placed" | "active" | "cashed_out" | "lost";

export interface FlightBetResult {
  id: "FLIGHT_1" | "FLIGHT_2";
  amount: number;
  state: FlightBetState;
  cashOutMultiplier: number | null;
  payout: number;
}

export interface CompletedPremiumRound {
  roundId: string;
  requestId: string;
  gameId: PremiumGameId;
  status: "COMPLETED";
  result: "WIN" | "LOSS" | "PUSH";
  label: string;
  totalStake: number;
  payout: number;
  net: number;
  balance: number;
  multiplier: number;
  selections: ClientRoundSelection[];
  winningOptions: string[];
  payload: Record<string, unknown>;
  commitment: string;
  seed: string;
  resultHash: string;
  startedAt: string;
  completedAt: string;
}

export interface PremiumGameState {
  balance: number;
  sessionId: string;
  serverNow: string;
  setting: {
    gameId: PremiumGameId;
    enabled: boolean;
    maintenanceMode: boolean;
    minStake: number;
    maxStake: number;
    chipDenominations: number[];
    artwork: string;
  };
  history: ClientHistoryItem[];
  activeRound: ActiveFlightRound | null;
  latestRound: CompletedPremiumRound | null;
  rngVersion: string;
}

export class PremiumGameRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = "PremiumGameRequestError";
  }
}

async function json<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
  if (!response.ok) throw new PremiumGameRequestError(
    payload.error || "The game server could not complete that request.",
    response.status,
    payload.code || "GAME_REQUEST_FAILED",
  );
  return payload as T;
}

function retryDelay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export const ServerResultService = {
  state(gameId: PremiumGameId, signal?: AbortSignal) {
    return fetch(`/api/premium-games/${gameId}`, { cache: "no-store", credentials: "same-origin", signal }).then(json<PremiumGameState>);
  },
  async play(gameId: PremiumGameId, requestId: string, selections: ClientRoundSelection[]) {
    const body = JSON.stringify({ action: "play", requestId, selections });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await fetch(`/api/premium-games/${gameId}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body,
        }).then(json<{ round: CompletedPremiumRound | ActiveFlightRound; duplicate?: boolean }>);
      } catch (error) {
        const recoverable = error instanceof PremiumGameRequestError
          && error.status === 409
          && ["ROUND_IN_PROGRESS", "DUPLICATE_RECORD"].includes(error.code);
        if (!recoverable || attempt === 2) throw error;
        await retryDelay(120 * (attempt + 1));
      }
    }
    throw new Error("The game server could not complete that request.");
  },
  cashout(gameId: "flight-x", roundId: string, betId: "FLIGHT_1" | "FLIGHT_2", multiplier: number) {
    return fetch(`/api/premium-games/${gameId}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cashout", roundId, betId, multiplier }),
    }).then(json<{ round: CompletedPremiumRound | ActiveFlightRound }>);
  },
};

export const TransactionManager = {
  requestId(gameId: PremiumGameId) {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `${gameId}:${crypto.randomUUID()}`
      : `${gameId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  },
  normalizeSelections(bets: ReadonlyMap<string, number>): ClientRoundSelection[] {
    return [...bets.entries()].filter(([, amount]) => amount > 0).map(([id, amount]) => ({ id, amount }));
  },
};

export class GameSessionManager {
  private clockOffset = 0;

  sync(serverNow: string) {
    this.clockOffset = new Date(serverNow).getTime() - Date.now();
  }

  now() {
    return Date.now() + this.clockOffset;
  }
}
