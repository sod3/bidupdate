"use client";

import { useEffect } from "react";

type NavigatorWithDeviceHints = Navigator & {
  deviceMemory?: number;
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

export type GameRenderQuality = {
  antialias: boolean;
  lowPower: boolean;
  particleScale: number;
  resolution: number;
};

export type GameQualityPreference = "AUTO" | "LOW" | "MEDIUM" | "HIGH";
export const GAME_QUALITY_STORAGE_KEY = "play-arena:game-quality";

export function setGameQualityPreference(preference: GameQualityPreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GAME_QUALITY_STORAGE_KEY, preference);
  window.dispatchEvent(new CustomEvent("play-arena:quality-change", { detail: preference }));
}

export function getGameQualityPreference(): GameQualityPreference {
  if (typeof window === "undefined") return "AUTO";
  const value = window.localStorage.getItem(GAME_QUALITY_STORAGE_KEY);
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" ? value : "AUTO";
}

/**
 * Keeps high-DPI phones from rendering several million pixels per frame.
 * Desktop retains the sharper 2x ceiling; constrained/mobile devices trade a
 * small amount of sharpness for steadier input and animation frame times.
 */
export function getGameRenderQuality(): GameRenderQuality {
  if (typeof window === "undefined") {
    return { antialias: true, lowPower: false, particleScale: 1, resolution: 1 };
  }

  const preference = getGameQualityPreference();
  if (preference === "LOW") return { antialias: false, lowPower: true, particleScale: .42, resolution: 1 };
  if (preference === "MEDIUM") return { antialias: true, lowPower: false, particleScale: .7, resolution: Math.min(1.35, Math.max(1, window.devicePixelRatio || 1)) };
  if (preference === "HIGH") return { antialias: true, lowPower: false, particleScale: 1, resolution: Math.min(2, Math.max(1, window.devicePixelRatio || 1)) };

  const hints = navigator as NavigatorWithDeviceHints;
  const connection = hints.connection;
  const constrainedNetwork = Boolean(
    connection?.saveData
      || connection?.effectiveType === "slow-2g"
      || connection?.effectiveType === "2g",
  );
  const constrainedHardware = (hints.hardwareConcurrency ?? 8) <= 4 || (hints.deviceMemory ?? 8) <= 4;
  const lowPower = constrainedNetwork || constrainedHardware;
  const mobile = Math.min(window.innerWidth, window.innerHeight) <= 768;
  const deviceResolution = Math.max(1, window.devicePixelRatio || 1);
  const resolution = lowPower
    ? 1
    : Math.min(mobile ? 1.5 : 2, deviceResolution);

  return {
    antialias: !lowPower,
    lowPower,
    particleScale: lowPower ? 0.48 : mobile ? 0.72 : 1,
    resolution,
  };
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Preloads a selected game's renderer after the lobby becomes interactive. */
export function useIdleGamePreload(preload: () => void) {
  useEffect(() => {
    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(preload, { timeout: 900 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }

    const timer = window.setTimeout(preload, 240);
    return () => window.clearTimeout(timer);
  }, [preload]);
}

/** Invokes Next's runtime preload hook without coupling game code to internals. */
export function preloadGameRenderer(component: unknown) {
  const preload = (component as { preload?: () => unknown }).preload;
  if (preload) void preload();
}
