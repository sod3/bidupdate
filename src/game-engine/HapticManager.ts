export type HapticPattern = "tap" | "success" | "major" | "failure" | "impact";

const patterns: Record<HapticPattern, number | number[]> = {
  tap: 9,
  success: [16, 35, 20],
  major: [24, 45, 28, 55, 35],
  failure: [35, 28, 35],
  impact: 24,
};

export const HapticManager = {
  pulse(pattern: HapticPattern = "tap") {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return false;
    return navigator.vibrate(patterns[pattern]);
  },
};
