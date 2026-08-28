export type GameAudioCue = "tap" | "spin" | "reel-stop" | "win" | "mega-win" | "loss" | "impact";

const cueNotes: Record<GameAudioCue, readonly number[]> = {
  tap: [360],
  spin: [155, 190],
  "reel-stop": [410],
  win: [523, 659, 784],
  "mega-win": [523, 659, 784, 1047],
  loss: [150],
  impact: [120, 82],
};

class SharedAudioManager {
  private context: AudioContext | null = null;
  muted = false;
  volume = .72;

  setMuted(value: boolean) {
    this.muted = value;
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
  }

  cue(kind: GameAudioCue) {
    if (this.muted || typeof window === "undefined") return;
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const context = this.context ?? new AudioCtor();
      this.context = context;
      if (context.state === "suspended") void context.resume();
      cueNotes[kind].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const startsAt = context.currentTime + index * (kind === "spin" ? .045 : .095);
        oscillator.type = kind === "spin" || kind === "impact" ? "sawtooth" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, startsAt);
        if (kind === "spin") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.7, startsAt + .1);
        gain.gain.setValueAtTime(.0001, startsAt);
        gain.gain.exponentialRampToValueAtTime(Math.max(.0002, this.volume * (kind === "mega-win" ? .06 : .032)), startsAt + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, startsAt + (kind === "mega-win" ? .22 : .14));
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(startsAt);
        oscillator.stop(startsAt + .24);
      });
    } catch {
      // Audio feedback is progressive enhancement and must never block play.
    }
  }

  dispose() {
    void this.context?.close();
    this.context = null;
  }
}

export const AudioManager = new SharedAudioManager();
