/**
 * Platform-wide single-player difficulty policy.
 *
 * Very Hard keeps every game winnable while favoring the house/CPU on nine
 * out of ten server-owned difficulty rolls.
 */
export const VERY_HARD_PLAYER_TARGET_WIN_PERCENT = 10;
export const VERY_HARD_OPPONENT_FAVORED_PERCENT = 100 - VERY_HARD_PLAYER_TARGET_WIN_PERCENT;
export const VERY_HARD_DIFFICULTY_VERSION = "very-hard-v1-10-percent-target";

export function isVeryHardOpponentFavoredRoll(roll: number) {
  return Number.isInteger(roll) && roll >= 0 && roll < VERY_HARD_OPPONENT_FAVORED_PERCENT;
}
