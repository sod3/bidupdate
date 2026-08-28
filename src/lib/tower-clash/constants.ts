export const TOWER_TIERS = [
  { id: "frontier", name: "Frontier Siege", entry: 100, reward: 200, boss: "Rafi Arden", bossTitle: "Rampart Keeper", bossHealth: 105, accuracy: .8, arena: "moonfall" },
  { id: "warfront", name: "Iron Warfront", entry: 500, reward: 1000, boss: "Nyla Soren", bossTitle: "Breaker of Crowns", bossHealth: 125, accuracy: .89, arena: "ember-field" },
  { id: "royal", name: "Royal Cataclysm", entry: 1000, reward: 2000, boss: "Ayaan Voss", bossTitle: "The Final Bastion", bossHealth: 150, accuracy: .95, arena: "red-dunes" },
] as const;

export type TowerTierId = (typeof TOWER_TIERS)[number]["id"];
export type TowerSide = "PLAYER" | "AI";
export type TowerProjectileId = "iron-shot" | "blast-core" | "fire-orb" | "cluster-shell" | "royal-bomb";

export const TOWER_PROJECTILES = [
  { id: "iron-shot", name: "Iron Shot", level: 1, damage: 19, radius: 1.45, speed: 1, gravity: 1, color: "#d7dee8", glow: "#94a3b8", description: "Reliable stone-breaking cannonball" },
  { id: "blast-core", name: "Blast Core", level: 3, damage: 24, radius: 2.3, speed: .96, gravity: 1.03, color: "#ffb12b", glow: "#fb7185", description: "Wide explosive damage" },
  { id: "fire-orb", name: "Dragonfire", level: 6, damage: 22, radius: 1.85, speed: 1.04, gravity: .96, color: "#ff5a24", glow: "#fbbf24", description: "Fast burning projectile" },
  { id: "cluster-shell", name: "Cluster Shell", level: 10, damage: 28, radius: 3.15, speed: .91, gravity: 1.08, color: "#c084fc", glow: "#a855f7", description: "Cracks multiple structures" },
  { id: "royal-bomb", name: "Royal Bomb", level: 15, damage: 35, radius: 2.65, speed: .88, gravity: 1.12, color: "#111827", glow: "#fde047", description: "Legendary siege payload" },
] as const;

export const TOWER_CANNONS = [
  { id: "oak-breaker", name: "Oak Breaker", level: 1, body: "#352318", metal: "#64748b", accent: "#f59e0b", power: 72, stability: 68 },
  { id: "iron-wolf", name: "Iron Wolf", level: 4, body: "#17202d", metal: "#9ca3af", accent: "#38bdf8", power: 82, stability: 78 },
  { id: "dragon-mouth", name: "Dragon Mouth", level: 9, body: "#3f0b0b", metal: "#7f1d1d", accent: "#fb7185", power: 90, stability: 86 },
  { id: "kings-thunder", name: "King's Thunder", level: 16, body: "#100d19", metal: "#d4af37", accent: "#fde047", power: 98, stability: 94 },
] as const;

export const TOWER_CASTLES = [
  { id: "highland-keep", name: "Highland Keep", level: 1, stone: "#697386", roof: "#26364d", banner: "#22d3ee" },
  { id: "crimson-fort", name: "Crimson Fortress", level: 7, stone: "#57505a", roof: "#54151c", banner: "#fb7185" },
  { id: "sun-king-citadel", name: "Sun King Citadel", level: 13, stone: "#9a805d", roof: "#3f2d22", banner: "#fde047" },
] as const;

export const TOWER_ARENAS = [
  { id: "moonfall", name: "Moonfall Highlands", level: 1, environment: "NIGHT_RAIN", ground: "#14201c", fog: "#172554", sky: "#020617", accent: "#38bdf8" },
  { id: "ember-field", name: "Ember Battlefield", level: 5, environment: "BATTLEFIELD", ground: "#251713", fog: "#3f1d16", sky: "#110807", accent: "#fb7185" },
  { id: "red-dunes", name: "Red Dune Siege", level: 9, environment: "DESERT", ground: "#5f321d", fog: "#9a5535", sky: "#29130d", accent: "#fbbf24" },
  { id: "frost-crown", name: "Frost Crown", level: 14, environment: "MOUNTAINS", ground: "#334155", fog: "#64748b", sky: "#07111f", accent: "#a5f3fc" },
] as const;

export const TOWER_PROJECTILE_SKINS = [
  { id: "forged", name: "Forged Iron", level: 1, tint: "#cbd5e1" },
  { id: "arcane", name: "Arcane Pulse", level: 8, tint: "#c084fc" },
  { id: "solar", name: "Solar Crown", level: 15, tint: "#fde047" },
] as const;

export const TOWER_MISSIONS = [
  { id: "damage-150", title: "Siege Engineer", description: "Deal 150 castle damage", target: 150, reward: 300 },
  { id: "critical-2", title: "Weak Point", description: "Land 2 critical hits", target: 2, reward: 450 },
  { id: "win-1", title: "Raise the Banner", description: "Destroy one enemy castle", target: 1, reward: 650 },
] as const;

export const TOWER_ACHIEVEMENTS = [
  { id: "first-fall", name: "First Fall", description: "Destroy your first castle", icon: "♜" },
  { id: "bullseye", name: "Bullseye", description: "Land 25 critical hits", icon: "◎" },
  { id: "demolition", name: "Demolition", description: "Deal 5,000 total damage", icon: "✹" },
  { id: "untouched", name: "Untouched", description: "Win above 75 health", icon: "♢" },
  { id: "hot-crown", name: "Hot Crown", description: "Reach a 5-win streak", icon: "♛" },
  { id: "legend", name: "Siege Legend", description: "Reach Legend rank", icon: "★" },
] as const;

export const TOWER_RANKS = ["Rookie", "Warrior", "Knight", "Commander", "King", "Legend"] as const;

export function towerTierById(id: string | null | undefined) {
  return TOWER_TIERS.find((tier) => tier.id === id) ?? TOWER_TIERS[0];
}

export function towerProjectileById(id: string | null | undefined) {
  return TOWER_PROJECTILES.find((projectile) => projectile.id === id) ?? TOWER_PROJECTILES[0];
}

export function towerRankFromPoints(points: number) {
  return TOWER_RANKS[Math.min(TOWER_RANKS.length - 1, Math.floor(Math.max(0, points) / 320))];
}
