import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PremiumGameId } from "@/lib/premium-games/definitions";

export const PREMIUM_RNG_VERSION = "sha256-stream-v1";

export interface RoundSeed {
  roundId: string;
  seed: string;
  commitment: string;
}

export class RNGService {
  private counter = 0;
  private pool = Buffer.alloc(0);

  constructor(private readonly seed: string) {}

  private bytes(length: number) {
    while (this.pool.length < length) {
      const block = createHash("sha256").update(`${this.seed}:${this.counter++}`).digest();
      this.pool = Buffer.concat([this.pool, block]);
    }
    const value = this.pool.subarray(0, length);
    this.pool = this.pool.subarray(length);
    return value;
  }

  float() {
    return this.bytes(4).readUInt32BE(0) / 0x100000000;
  }

  int(maxExclusive: number) {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) throw new Error("A positive RNG range is required.");
    return Math.floor(this.float() * maxExclusive);
  }

  pick<T>(items: readonly T[]) {
    if (!items.length) throw new Error("Cannot select from an empty collection.");
    return items[this.int(items.length)];
  }

  shuffle<T>(items: readonly T[]) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = this.int(index + 1);
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }
}

export function createRoundSeed(gameId: PremiumGameId): RoundSeed {
  const roundId = `${gameId}_${randomUUID()}`;
  const seed = randomBytes(32).toString("hex");
  const commitment = createHash("sha256").update(`${roundId}:${seed}:${PREMIUM_RNG_VERSION}`).digest("hex");
  return { roundId, seed, commitment };
}

export function verifyRoundSeed(value: RoundSeed) {
  return createHash("sha256").update(`${value.roundId}:${value.seed}:${PREMIUM_RNG_VERSION}`).digest("hex") === value.commitment;
}

