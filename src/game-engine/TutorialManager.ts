const tutorialKey = (gameId: string) => `play-arena:tutorial:${gameId}:v1`;

export const TutorialManager = {
  shouldShow(gameId: string) {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(tutorialKey(gameId)) !== "seen";
  },
  complete(gameId: string) {
    if (typeof window !== "undefined") window.localStorage.setItem(tutorialKey(gameId), "seen");
  },
  replay(gameId: string) {
    if (typeof window !== "undefined") window.localStorage.removeItem(tutorialKey(gameId));
  },
};
