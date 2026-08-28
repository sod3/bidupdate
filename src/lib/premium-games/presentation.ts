export const EUROPEAN_ROULETTE_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

const ROULETTE_POCKET_ANGLE = 360 / EUROPEAN_ROULETTE_ORDER.length;

export function roulettePresentation(number: number) {
  const pocketIndex = Math.max(0, EUROPEAN_ROULETTE_ORDER.indexOf(number as (typeof EUROPEAN_ROULETTE_ORDER)[number]));
  return {
    wheelAngle: 1440 + (EUROPEAN_ROULETTE_ORDER.length - pocketIndex) * ROULETTE_POCKET_ANGLE,
    ballAngle: -1260 - pocketIndex * ROULETTE_POCKET_ANGLE,
  };
}

export function carSelectorAngle(winnerIndex: number) {
  return 1260 + Math.max(0, winnerIndex) * 60;
}
