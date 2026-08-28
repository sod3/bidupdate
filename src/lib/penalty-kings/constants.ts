export const PENALTY_TIERS = [
  { id: "academy", name: "Academy", entry: 100, pool: 200, players: 324, wait: "~4 sec" },
  { id: "champions", name: "Champions", entry: 500, pool: 1000, players: 188, wait: "~7 sec" },
  { id: "world-class", name: "World Class", entry: 1000, pool: 2000, players: 76, wait: "~12 sec" },
] as const;

export type PenaltyTierId = (typeof PENALTY_TIERS)[number]["id"];

export const KEEPER_ZONES = [
  "upper-left",
  "upper-right",
  "low-left",
  "center",
  "low-right",
] as const;

export type KeeperZone = (typeof KEEPER_ZONES)[number];

export type ShotInput = {
  directionX: number;
  height: number;
  power: number;
  curve: number;
  timing: number;
};

export type ShotResolution = {
  turn: number;
  strikerId: string;
  keeperId: string;
  goal: boolean;
  outcome: "GOAL" | "SAVE" | "MISS";
  shotType: "PANENKA" | "POWER" | "CURVED" | "LOW_DRIVEN" | "PLACED";
  targetX: number;
  targetY: number;
  keeperZone: KeeperZone;
  perfect: boolean;
  scores: Record<string, number>;
  histories: Record<string, Array<"GOAL" | "SAVE" | "MISS">>;
};

export function penaltyTierById(id: string | null | undefined) {
  return PENALTY_TIERS.find((tier) => tier.id === id) ?? PENALTY_TIERS[1];
}
