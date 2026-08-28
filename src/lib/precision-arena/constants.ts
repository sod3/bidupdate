export type ArcherySide = "PLAYER" | "AI";

export const ARCHERY_TIERS = [
  { id: "valley", name: "Valley Open", entry: 100, reward: 200, opponent: "Mira Vale", title: "Wind Reader", accuracy: .86, distance: [58, 78] as const },
  { id: "temple", name: "Temple Masters", entry: 500, reward: 1000, opponent: "Kian Rook", title: "Silent Arrow", accuracy: .91, distance: [72, 94] as const },
  { id: "legend", name: "Legend Arena", entry: 1000, reward: 2000, opponent: "Zoya Flint", title: "Perfect Hunter", accuracy: .95, distance: [88, 112] as const },
] as const;

export const ARCHERY_ENVIRONMENTS = [
  { id: "mountain-valley", name: "Mountain Valley", level: 1, sky: 0x8cd7ec, horizon: 0xc7e9df, ground: 0x173f35, far: 0x769da0, near: 0x2c6b56, accent: 0xffd36b, weather: "leaves" },
  { id: "japanese-temple", name: "Japanese Temple", level: 3, sky: 0xeab8c7, horizon: 0xffdcc2, ground: 0x291d2d, far: 0x8b5067, near: 0x3a2436, accent: 0xff657f, weather: "petals" },
  { id: "moonlit-forest", name: "Moonlit Forest", level: 5, sky: 0x07132e, horizon: 0x263a68, ground: 0x071811, far: 0x1e3650, near: 0x102d29, accent: 0x7de7ff, weather: "fireflies" },
  { id: "desert-kingdom", name: "Desert Kingdom", level: 7, sky: 0xf59d62, horizon: 0xffd18a, ground: 0x6c331f, far: 0xad5b39, near: 0x7b3f27, accent: 0xffe074, weather: "sand" },
  { id: "castle-battlefield", name: "Castle Battlefield", level: 10, sky: 0x46526b, horizon: 0x8b8792, ground: 0x1f2922, far: 0x4e5962, near: 0x29352f, accent: 0xff9f5e, weather: "rain" },
  { id: "neon-rooftop", name: "Neon City Rooftop", level: 13, sky: 0x09051c, horizon: 0x231554, ground: 0x080b17, far: 0x181841, near: 0x11132c, accent: 0x41f5ff, weather: "neon-rain" },
  { id: "snowy-mountains", name: "Snowy Mountains", level: 16, sky: 0xa5c9db, horizon: 0xe2f2f4, ground: 0x718996, far: 0x92aab7, near: 0x536b79, accent: 0xe9feff, weather: "snow" },
] as const;

export const ARCHERY_BOWS = [
  { id: "field-recurve", name: "Field Recurve", level: 1, body: 0x8f5e39, string: 0xf2e7d4, accent: 0x64e7c6, stability: 68, power: 72 },
  { id: "sakura-yumi", name: "Sakura Yumi", level: 4, body: 0x512d42, string: 0xffd4e4, accent: 0xff799b, stability: 76, power: 78 },
  { id: "moon-hunter", name: "Moon Hunter", level: 8, body: 0x17243f, string: 0xcaf5ff, accent: 0x6ee7ff, stability: 84, power: 86 },
  { id: "solar-legend", name: "Solar Legend", level: 14, body: 0x2b1821, string: 0xfff2aa, accent: 0xffc84a, stability: 94, power: 96 },
] as const;

export const ARCHERY_ARROWS = [
  { id: "cedar", name: "Cedar Flight", level: 1, shaft: 0xe8c58c, trail: 0xffffff, feathers: 0x5de4c7 },
  { id: "sakura", name: "Sakura Whisper", level: 5, shaft: 0xffbfcd, trail: 0xff7fa7, feathers: 0xffe0e8 },
  { id: "frost", name: "Frost Vector", level: 9, shaft: 0xbcecff, trail: 0x4de7ff, feathers: 0xecfeff },
  { id: "voltage", name: "Voltage", level: 13, shaft: 0xf3e8ff, trail: 0xb74dff, feathers: 0x47f6ff },
] as const;

export const ARCHERY_TARGETS = [
  { id: "classic", name: "Tournament Rings", level: 1, center: 0xffd335, middle: 0xeb334d, outer: 0x3a8bda },
  { id: "sakura", name: "Sakura Crest", level: 6, center: 0xffe0e8, middle: 0xff759b, outer: 0x5a2746 },
  { id: "neon", name: "Neon Pulse", level: 12, center: 0xf8ff65, middle: 0x25e4ff, outer: 0xa43cff },
] as const;

export const ARCHERY_COSMETICS = [
  { id: "valley-scout", name: "Valley Scout", level: 1, cloth: 0x174e45, accent: 0x63ead0 },
  { id: "temple-guard", name: "Temple Guard", level: 6, cloth: 0x4a1d32, accent: 0xff789a },
  { id: "neon-ranger", name: "Neon Ranger", level: 13, cloth: 0x14162b, accent: 0x49ebff },
] as const;

export const ARCHERY_MISSIONS = [
  { id: "score-350", title: "Ring Collector", description: "Score 350 points today", target: 350, reward: 300 },
  { id: "bullseye-2", title: "Dead Center", description: "Land 2 bullseyes today", target: 2, reward: 450 },
  { id: "win-1", title: "Arena Victor", description: "Win one duel today", target: 1, reward: 650 },
] as const;

export const ARCHERY_ACHIEVEMENTS = [
  { id: "first-bullseye", name: "Dead Center", description: "Land your first bullseye", icon: "◎" },
  { id: "long-ranger", name: "Long Ranger", description: "Score 90+ beyond 80m", icon: "➶" },
  { id: "perfect-duel", name: "Flawless Flight", description: "Score 450 in one duel", icon: "✦" },
  { id: "combo-master", name: "Combo Master", description: "Reach a ×3 shot combo", icon: "×3" },
  { id: "hot-hand", name: "Hot Hand", description: "Reach a 5-win streak", icon: "♨" },
  { id: "legend", name: "Arena Legend", description: "Reach Legend rank", icon: "★" },
] as const;

export const ARCHERY_RANKS = ["Rookie", "Ranger", "Hunter", "Marksman", "Champion", "Legend"] as const;

export function archeryTierById(id: string | null | undefined) {
  return ARCHERY_TIERS.find((tier) => tier.id === id) ?? ARCHERY_TIERS[0];
}

export function archeryRankFromPoints(points: number) {
  return ARCHERY_RANKS[Math.min(ARCHERY_RANKS.length - 1, Math.floor(Math.max(0, points) / 300))];
}
