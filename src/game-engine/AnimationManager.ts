export type AnimationCurve = (progress: number) => number;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const AnimationManager = {
  delay(milliseconds: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
  },

  easeOutCubic(progress: number) {
    return 1 - Math.pow(1 - clamp01(progress), 3);
  },

  easeOutBack(progress: number) {
    const value = clamp01(progress) - 1;
    return 1 + 2.70158 * value ** 3 + 1.70158 * value ** 2;
  },

  count(options: { from?: number; to: number; duration?: number; onUpdate: (value: number) => void; curve?: AnimationCurve }) {
    const from = options.from ?? 0;
    const duration = Math.max(1, options.duration ?? 650);
    const curve = options.curve ?? AnimationManager.easeOutCubic;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = clamp01((now - startedAt) / duration);
      options.onUpdate(from + (options.to - from) * curve(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  },
};
