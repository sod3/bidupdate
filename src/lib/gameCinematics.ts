export type GameCinematicKind = "intro" | "versus" | "countdown" | "start" | "win" | "loss" | "jackpot" | "launch";

export interface GameCinematicPayload {
  kind?: GameCinematicKind;
  game: string;
  kicker?: string;
  left?: string;
  leftMeta?: string;
  right?: string;
  rightMeta?: string;
  center?: string;
  durationMs?: number;
  accent?: string;
  accent2?: string;
  icon?: string;
}

export const GAME_CINEMATIC_EVENT = "play-arena:cinematic";

export function triggerGameCinematic(payload: GameCinematicPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GameCinematicPayload>(GAME_CINEMATIC_EVENT, { detail: payload }));
}
