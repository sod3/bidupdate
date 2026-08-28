export const TRACK_LENGTH = 4200;

export const CHECKPOINTS = [600, 1200, 1800, 2400, 3000, 3600, TRACK_LENGTH] as const;

export const COMPETITION_TIERS = [
  { id: "rookie", name: "Rookie Race", entry: 100, pool: 200, difficulty: "Expert AI", matchTime: "Instant", accent: "cyan" },
  { id: "street", name: "Street Racer", entry: 250, pool: 500, difficulty: "Expert AI", matchTime: "Instant", accent: "violet" },
  { id: "pro", name: "Pro Race", entry: 500, pool: 1000, difficulty: "Expert AI", matchTime: "Instant", accent: "amber" },
  { id: "elite", name: "Elite Race", entry: 1000, pool: 2000, difficulty: "Expert AI", matchTime: "Instant", accent: "rose" },
  { id: "legend", name: "Legend Race", entry: 2500, pool: 5000, difficulty: "Expert AI", matchTime: "Instant", accent: "gold" },
] as const;

export type CompetitionTierId = (typeof COMPETITION_TIERS)[number]["id"];

export const VEHICLES = [
  {
    id: "nightfang",
    name: "Nightfang",
    className: "Balanced assault",
    description: "Confident at full throttle and forgiving through long drifts.",
    color: "#14e7ff",
    accent: "#00a6ff",
    acceleration: 8,
    topSpeed: 9,
    handling: 7,
    nitro: 8,
  },
  {
    id: "vortex-r",
    name: "Vortex R",
    className: "Corner specialist",
    description: "Fast direction changes and surgical control in the drift district.",
    color: "#9b5cff",
    accent: "#ff3cd5",
    acceleration: 7,
    topSpeed: 8,
    handling: 9,
    nitro: 7,
  },
  {
    id: "phantom-x",
    name: "Phantom X",
    className: "Launch specialist",
    description: "Explosive acceleration with a demanding high-speed balance.",
    color: "#f2f5ff",
    accent: "#ff405f",
    acceleration: 9,
    topSpeed: 8,
    handling: 7,
    nitro: 8,
  },
] as const;

export type VehicleId = (typeof VEHICLES)[number]["id"];

export const MISSIONS = [
  { id: "win-3", title: "Own the night", description: "Win 3 races", progress: 1, target: 3, reward: 500, unit: "XP" },
  { id: "perfect-5", title: "Hold the angle", description: "Perform 5 perfect drifts", progress: 3, target: 5, reward: 250, unit: "XP" },
  { id: "speed-280", title: "Break the rain", description: "Reach 280 KM/H", progress: 1, target: 1, reward: 100, unit: "XP" },
] as const;

export const ACHIEVEMENTS = [
  { icon: "◈", title: "First Blood", description: "Win your first race", unlocked: true },
  { icon: "〽", title: "Drift King", description: "Perform a 500m drift", unlocked: true },
  { icon: "↟", title: "Speed Demon", description: "Reach 300 KM/H", unlocked: false },
  { icon: "♛", title: "Untouchable", description: "Win 10 races consecutively", unlocked: false },
  { icon: "◉", title: "Photo Finish", description: "Win by less than 0.10 seconds", unlocked: false },
  { icon: "✦", title: "Legend", description: "Reach Legend rank", unlocked: false },
] as const;

export function tierById(id: string | null | undefined) {
  return COMPETITION_TIERS.find((tier) => tier.id === id) ?? COMPETITION_TIERS[0];
}

export function vehicleById(id: string | null | undefined) {
  return VEHICLES.find((vehicle) => vehicle.id === id) ?? VEHICLES[0];
}

export function formatRaceTime(milliseconds: number) {
  const safe = Math.max(0, milliseconds);
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = Math.floor(safe % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
