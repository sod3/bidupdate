export const PLAYER_TARGET_WIN_PERCENT = 10;
export const AI_FAVORED_PERCENT = 100 - PLAYER_TARGET_WIN_PERCENT;

export function isAiFavoredRoll(roll) {
  return Number.isInteger(roll) && roll >= 0 && roll < AI_FAVORED_PERCENT;
}
