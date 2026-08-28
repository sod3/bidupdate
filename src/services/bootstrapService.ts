import { connectDB } from "@/lib/db";
import { Achievement, CompetitionTier, Cosmetic, Mission, SiteSetting, Track, Vehicle } from "@/models";
import { ACHIEVEMENTS, CHECKPOINTS, COMPETITION_TIERS, MISSIONS, TRACK_LENGTH, VEHICLES } from "@/lib/neon/constants";

const PLATFORM_BOOTSTRAP_VERSION = "2026-08-speed-v1";

const siteSettings = [
  { key: "siteName", value: "Neon Drift", description: "Public platform name", isPublic: true },
  { key: "tagline", value: "Race. Drift. Dominate.", description: "Public site tagline", isPublic: true },
  { key: "homepageTitle", value: "Neon Drift", description: "Homepage heading", isPublic: true },
  { key: "homepageDescription", value: "Instant single-player midnight street racing against Expert AI, with verified driving performance deciding the winner.", description: "Homepage summary", isPublic: true },
  { key: "legalNotice", value: "Platform credits are virtual, non-transferable, and have no cash value. Any future real-money configuration must remain jurisdiction-gated and separate from race logic.", description: "Public credit notice", isPublic: true },
  { key: "starterCredits", value: 0, description: "New accounts start at zero; credits must be purchased or explicitly adjusted", isPublic: false },
  { key: "registrationEnabled", value: true, description: "Allow new driver registration", isPublic: false },
  { key: "maintenanceMode", value: false, description: "Pause competitive games platform-wide", isPublic: false },
  { key: "neonDriftMigrationV2", value: true, description: "Legacy casino data removal marker", isPublic: false },
  { key: "platformBootstrapVersion", value: PLATFORM_BOOTSTRAP_VERSION, description: "Static platform seed version", isPublic: false },
];

const achievementMetrics = ["wins", "driftDistance", "topSpeed", "winStreak", "photoFinish", "rank"];

const bootstrapCache = globalThis as typeof globalThis & {
  __neonDriftBootstrap?: Promise<void>;
};

async function seedPlatformData() {
  const database = await connectDB();
  // The previous implementation rewrote every vehicle, tier, mission, track,
  // cosmetic and setting on every serverless cold start. That made the first
  // game request unnecessarily expensive. A version marker turns the common
  // path into one indexed read while still allowing a future seed version to
  // deliberately refresh static data.
  const seeded = await SiteSetting.findOne({
    key: "platformBootstrapVersion",
    value: PLATFORM_BOOTSTRAP_VERSION,
  }).select("_id").lean();
  if (seeded) return;

  const migration = await SiteSetting.findOne({ key: "neonDriftMigrationV2" }).lean();
  if (!migration) {
    const legacyCollections = ["games", "gamecategories", "gamerounds", "gameactions", "promotions"];
    const available = new Set((await database.connection.db!.listCollections().toArray()).map((item) => item.name));
    await Promise.all(legacyCollections.filter((name) => available.has(name)).map((name) => database.connection.db!.collection(name).deleteMany({})));
  }

  await Promise.all([
    Vehicle.bulkWrite(VEHICLES.map((vehicle) => ({
      updateOne: {
        filter: { vehicleId: vehicle.id },
        update: { $set: { vehicleId: vehicle.id, name: vehicle.name, description: vehicle.description, color: vehicle.color, accent: vehicle.accent, stats: { acceleration: vehicle.acceleration, topSpeed: vehicle.topSpeed, handling: vehicle.handling, nitro: vehicle.nitro }, isActive: true } },
        upsert: true,
      },
    }))),
    CompetitionTier.bulkWrite(COMPETITION_TIERS.map((tier, order) => ({
      updateOne: { filter: { tierId: tier.id }, update: { $set: { tierId: tier.id, name: tier.name, entryCredits: tier.entry, prizePool: tier.pool, order, isActive: true } }, upsert: true },
    }))),
    Track.updateOne({ trackId: "night-city-circuit" }, { $set: { trackId: "night-city-circuit", name: "Night City Circuit", distanceMeters: TRACK_LENGTH, checkpointMeters: [...CHECKPOINTS], environment: { time: "00:14", weather: "HEAVY_RAIN", sectors: ["DOWNTOWN", "TUNNEL", "HIGHWAY", "DRIFT_DISTRICT", "BRIDGE", "CITY_CENTER"] }, isActive: true } }, { upsert: true }),
    Mission.bulkWrite(MISSIONS.map((mission, index) => ({ updateOne: { filter: { missionId: mission.id }, update: { $set: { missionId: mission.id, title: mission.title, description: mission.description, metric: ["wins", "perfectDrifts", "topSpeed"][index], target: mission.target, xpReward: mission.reward, cadence: "DAILY", isActive: true } }, upsert: true } }))),
    Achievement.bulkWrite(ACHIEVEMENTS.map((achievement, index) => ({ updateOne: { filter: { achievementId: achievement.title.toLowerCase().replaceAll(" ", "-") }, update: { $set: { achievementId: achievement.title.toLowerCase().replaceAll(" ", "-"), title: achievement.title, description: achievement.description, metric: achievementMetrics[index], target: [1, 500, 300, 10, .1, 1][index] } }, upsert: true } }))),
    Cosmetic.bulkWrite([
      { cosmeticId: "paint-ion-cyan", name: "Ion Cyan", slot: "PAINT", rarity: "COMMON", config: { color: "#14e7ff" }, isActive: true },
      { cosmeticId: "glow-ultraviolet", name: "Ultraviolet", slot: "UNDERGLOW", rarity: "RARE", config: { color: "#9b5cff" }, isActive: true },
      { cosmeticId: "nitro-eclipse", name: "Eclipse Trail", slot: "NITRO", rarity: "EPIC", config: { colors: ["#14e7ff", "#9b5cff"] }, isActive: true },
    ].map((cosmetic) => ({ updateOne: { filter: { cosmeticId: cosmetic.cosmeticId }, update: { $set: cosmetic }, upsert: true } }))),
    SiteSetting.bulkWrite(siteSettings.map((setting) => ({ updateOne: { filter: { key: setting.key }, update: { $set: setting }, upsert: true } }))),
  ]);
}

export async function ensurePlatformData() {
  if (!bootstrapCache.__neonDriftBootstrap) {
    bootstrapCache.__neonDriftBootstrap = seedPlatformData().catch((error) => {
      bootstrapCache.__neonDriftBootstrap = undefined;
      throw error;
    });
  }
  return bootstrapCache.__neonDriftBootstrap;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  await ensurePlatformData();
  const setting = await SiteSetting.findOne({ key }).lean();
  return (setting?.value as T | undefined) ?? fallback;
}
