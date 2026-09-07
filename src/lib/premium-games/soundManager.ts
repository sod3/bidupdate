export type GameSound = "chip" | "count" | "betOpen" | "betClose" | "deal" | "flip" | "impact" | "payout" | "launch" | "wheel" | "card" | "dice" | "reel" | "lightning" | "cashout" | "win" | "loss";

interface SoundSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

class SharedSoundManager {
  private context: AudioContext | null = null;
  private settings: SoundSettings = { master: 0.7, music: 0.25, sfx: 0.75, muted: false };

  setSettings(next: Partial<SoundSettings>) {
    this.settings = { ...this.settings, ...next };
  }

  snapshot() {
    return this.settings;
  }

  private audio() {
    if (typeof window === "undefined" || this.settings.muted) return null;
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  play(sound: GameSound) {
    const context = this.audio();
    if (!context) return;
    const patterns: Record<GameSound, Array<[number, number, OscillatorType, number]>> = {
      chip: [[620, 0.055, "sine", 0], [920, 0.04, "sine", 0.035]],
      count: [[440, 0.08, "square", 0]],
      betOpen: [[330, 0.1, "sine", 0], [495, 0.11, "sine", 0.08], [660, 0.16, "sine", 0.16]],
      betClose: [[150, 0.12, "square", 0], [92, 0.24, "sawtooth", 0.09]],
      deal: [[310, 0.045, "triangle", 0], [470, 0.05, "triangle", 0.075], [650, 0.06, "triangle", 0.15]],
      flip: [[720, 0.045, "triangle", 0], [430, 0.07, "sine", 0.045]],
      impact: [[72, 0.28, "sawtooth", 0], [860, 0.13, "square", 0.035], [1120, 0.12, "sine", 0.11]],
      payout: [[520, 0.06, "sine", 0], [720, 0.07, "sine", 0.065], [940, 0.09, "sine", 0.14]],
      launch: [[90, 0.22, "sawtooth", 0], [180, 0.32, "sine", 0.08]],
      wheel: [[150, 0.18, "triangle", 0], [210, 0.12, "triangle", 0.09]],
      card: [[760, 0.045, "triangle", 0], [510, 0.055, "sine", 0.045]],
      dice: [[130, 0.07, "square", 0], [170, 0.07, "square", 0.08], [115, 0.08, "square", 0.16]],
      reel: [[120, 0.12, "sawtooth", 0], [170, 0.1, "triangle", 0.09], [230, 0.08, "triangle", 0.18]],
      lightning: [[70, 0.08, "sawtooth", 0], [880, 0.16, "square", 0.02]],
      cashout: [[440, 0.08, "sine", 0], [660, 0.1, "sine", 0.07], [990, 0.16, "sine", 0.15]],
      win: [[392, 0.1, "sine", 0], [523, 0.12, "sine", 0.1], [784, 0.22, "sine", 0.21]],
      loss: [[260, 0.12, "triangle", 0], [190, 0.22, "triangle", 0.11]],
    };
    const gainValue = Math.max(0, Math.min(1, this.settings.master * this.settings.sfx)) * 0.065;
    patterns[sound].forEach(([frequency, duration, type, delay]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + delay);
      gain.gain.setValueAtTime(0, context.currentTime + delay);
      gain.gain.linearRampToValueAtTime(gainValue, context.currentTime + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + duration + 0.02);
    });
  }
}

export const SoundManager = new SharedSoundManager();
