"use client";

/**
 * Game code preloader.
 *
 * Route prefetching gets the Next.js route ready, while these imports warm the
 * renderer chunk that would otherwise create a second network waterfall after
 * navigation. All calls are deduplicated by the browser/module loader and by
 * this small registry.
 */
const warmed = new Map<string, Promise<unknown>>();

function once(key: string, loader: () => Promise<unknown>) {
  const existing = warmed.get(key);
  if (existing) return existing;
  const task = loader().catch((error) => {
    warmed.delete(key);
    throw error;
  });
  warmed.set(key, task);
  return task;
}


function warmImage(src: string) {
  if (typeof Image === "undefined") return;
  const image = new Image();
  image.decoding = "async";
  image.src = src;
}

export function canBackgroundPreload() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData) return false;
  return connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
}

export function preloadPremiumCore() {
  return once("premium-core", async () => {
    await Promise.all([
      import("@/components/premium-games/GameShell"),
      import("pixi.js"),
    ]);
  });
}

export function preloadGameExperience(gameId: string) {
  switch (gameId) {
    case "royal-roulette":
    case "thunder-gods":
    case "car-roulette":
    case "red-vs-black":
    case "sic-bo":
    case "flight-x":
    case "dragon-tiger":
    case "money-machine":
      return preloadPremiumCore();
    case "777-slots":
      return once("777-slots", async () => {
        warmImage("/images/slots/nova-mascot.webp");
        await Promise.all([
          import("@/components/slots/SlotsExperience"),
          import("@/components/slots/SlotsReelCanvas"),
          import("pixi.js"),
        ]);
      });
    case "teen-patti":
      return once("teen-patti", () => import("@/components/teen-patti/TeenPattiExperience"));
    case "precision-arena":
      return once("precision-arena", async () => {
        await Promise.all([
          import("@/components/precision-arena/PrecisionArenaExperience"),
          import("@/components/precision-arena/PrecisionArena"),
          import("pixi.js"),
        ]);
      });
    case "eight-ball":
      return once("eight-ball", async () => {
        await Promise.all([
          import("@/components/eight-ball/EightBallExperience"),
          import("@/components/eight-ball/EightBallArena"),
          import("pixi.js"),
        ]);
      });
    case "penalty-kings":
      return once("penalty-kings", async () => {
        await Promise.all([
          import("@/components/penalty-kings/PenaltyKingsExperience"),
          import("@/components/penalty-kings/PenaltyKingsArena"),
          import("pixi.js"),
        ]);
      });
    case "tower-clash":
      return once("tower-clash", async () => {
        await Promise.all([
          import("@/components/tower-clash/TowerClashExperience"),
          import("@/components/tower-clash/TowerClashArena"),
        ]);
      });
    case "neon-drift":
      return once("neon-drift", async () => {
        warmImage("/images/neon-drift-hero.webp");
        await Promise.all([
          import("@/components/neon/RaceExperience"),
          import("@/components/neon/RaceCanvas"),
          import("pixi.js"),
        ]);
      });
    default:
      return Promise.resolve();
  }
}
