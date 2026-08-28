export const POOL_TIERS = [
  { id: "club", name: "Club Table", entry: 100, reward: 200, accent: "cyan", room: "Midnight Lounge" },
  { id: "pro", name: "Pro Circuit", entry: 500, reward: 1000, accent: "violet", room: "Velvet Crown" },
  { id: "high-roller", name: "High Roller", entry: 1000, reward: 2000, accent: "amber", room: "Diamond Room" },
] as const;

export type PoolTierId = (typeof POOL_TIERS)[number]["id"];
export type BallGroup = "SOLIDS" | "STRIPES";
export type PoolTurn = "PLAYER" | "AI";

export const POOL_CUES = [
  { id: "house", name: "House Classic", level: 1, color: "#d4a45f", accent: "#f6e2b5", control: 72, power: 76 },
  { id: "neon-viper", name: "Neon Viper", level: 4, color: "#0f172a", accent: "#22d3ee", control: 82, power: 81 },
  { id: "royal-flush", name: "Royal Flush", level: 9, color: "#2e1065", accent: "#c084fc", control: 89, power: 86 },
  { id: "black-diamond", name: "Black Diamond", level: 15, color: "#050505", accent: "#fbbf24", control: 96, power: 94 },
] as const;

export const POOL_TABLES = [
  { id: "emerald", name: "Emerald Pro", level: 1, cloth: "#075c4d", rail: "#2a1710", glow: "#2dd4bf" },
  { id: "electric-blue", name: "Electric Blue", level: 6, cloth: "#083b67", rail: "#101827", glow: "#38bdf8" },
  { id: "royal-purple", name: "Royal Purple", level: 12, cloth: "#35105e", rail: "#160b25", glow: "#c084fc" },
] as const;

export const BALL_SKINS = [
  { id: "tournament", name: "Tournament", level: 1, pearlescent: false },
  { id: "neon", name: "Neon Core", level: 8, pearlescent: true },
  { id: "obsidian", name: "Obsidian Gold", level: 16, pearlescent: true },
] as const;

export const POOL_MISSIONS = [
  { id: "pot-5", title: "Pocket Artist", description: "Pot 5 legal balls", target: 5, reward: 250 },
  { id: "bank-2", title: "Call the Rail", description: "Make 2 bank shots", target: 2, reward: 400 },
  { id: "win-1", title: "Run the Table", description: "Win one Cash Arena match", target: 1, reward: 600 },
] as const;

export const POOL_ACHIEVEMENTS = [
  { id: "first-rack", name: "First Rack", description: "Win your first match", icon: "◆", target: 1 },
  { id: "bank-manager", name: "Bank Manager", description: "Pot 25 bank shots", icon: "◇", target: 25 },
  { id: "eight-clean", name: "Clean Eight", description: "Win without a foul", icon: "⑧", target: 1 },
  { id: "hot-hand", name: "Hot Hand", description: "Reach a 5-win streak", icon: "♨", target: 5 },
  { id: "century", name: "Century Club", description: "Pot 100 object balls", icon: "✦", target: 100 },
  { id: "legend", name: "Pool Legend", description: "Reach Legend rank", icon: "♛", target: 1 },
] as const;

export const POOL_RANKS = [
  "Bronze III", "Bronze II", "Bronze I", "Silver III", "Silver II", "Silver I",
  "Gold III", "Gold II", "Gold I", "Platinum", "Diamond", "Master", "Legend",
] as const;

export function poolTierById(id: string | null | undefined) {
  return POOL_TIERS.find((tier) => tier.id === id) ?? POOL_TIERS[0];
}

export function poolRankFromPoints(points: number) {
  return POOL_RANKS[Math.min(POOL_RANKS.length - 1, Math.floor(Math.max(0, points) / 180))];
}

export function ballGroup(number: number): BallGroup | null {
  if (number >= 1 && number <= 7) return "SOLIDS";
  if (number >= 9 && number <= 15) return "STRIPES";
  return null;
}

export function oppositeGroup(group: BallGroup): BallGroup {
  return group === "SOLIDS" ? "STRIPES" : "SOLIDS";
}

