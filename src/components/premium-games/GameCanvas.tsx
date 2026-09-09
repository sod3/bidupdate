"use client";

import { useEffect, useRef } from "react";
import type { PremiumGameMode } from "@/lib/premium-games/definitions";

function toHex(color: string) {
  return Number.parseInt(color.replace("#", ""), 16);
}

export function GameCanvas({ accent, accent2, active, mode }: { accent: string; accent2: string; active: boolean; mode: PremiumGameMode }) {
  const host = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;

    void import("pixi.js").then(async (PIXI) => {
      if (cancelled) return;
      const application = new PIXI.Application();
      await application.init({
        resizeTo: element,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(1.5, window.devicePixelRatio || 1),
        preference: "webgl",
      });
      if (cancelled) {
        application.destroy(true, { children: true });
        return;
      }

      element.appendChild(application.canvas);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
      const particleCount = reduced ? 10 : lowPower ? 26 : 48;
      const streakCount = reduced ? 0 : lowPower ? 5 : 10;
      const colors = [toHex(accent), toHex(accent2), 0xffd56a, 0xffffff];

      const particles = Array.from({ length: particleCount }, (_, index) => {
        const radius = 0.6 + Math.random() * (index % 7 === 0 ? 2.8 : 1.3);
        const particle = new PIXI.Graphics().circle(0, 0, radius).fill({
          color: colors[index % colors.length],
          alpha: 0.16 + Math.random() * 0.42,
        });
        particle.x = Math.random() * Math.max(1, element.clientWidth);
        particle.y = Math.random() * Math.max(1, element.clientHeight);
        application.stage.addChild(particle);
        return {
          node: particle,
          speed: 0.1 + Math.random() * 0.28,
          drift: (Math.random() - 0.5) * 0.18,
          phase: Math.random() * Math.PI * 2,
        };
      });

      const streaks = Array.from({ length: streakCount }, (_, index) => {
        const width = 28 + Math.random() * 70;
        const line = new PIXI.Graphics().roundRect(0, 0, width, 1 + Math.random() * 1.5, 2).fill({
          color: colors[index % 2],
          alpha: 0.08,
        });
        line.rotation = mode === "crash" ? -0.38 : -0.18;
        line.x = Math.random() * Math.max(1, element.clientWidth);
        line.y = Math.random() * Math.max(1, element.clientHeight);
        application.stage.addChild(line);
        return { node: line, speed: 1.5 + Math.random() * 2.5 };
      });

      const halo = new PIXI.Graphics().circle(0, 0, 110).stroke({ color: colors[0], width: 1, alpha: 0.08 });
      halo.x = application.screen.width * 0.5;
      halo.y = application.screen.height * 0.45;
      application.stage.addChild(halo);

      let time = 0;
      const animate = (ticker: { deltaTime: number }) => {
        const isActive = activeRef.current;
        time += ticker.deltaTime;
        const width = Math.max(1, application.screen.width);
        const height = Math.max(1, application.screen.height);

        halo.x = width * 0.5;
        halo.y = height * 0.45;
        halo.scale.set(1 + Math.sin(time * 0.018) * 0.08 + (isActive ? 0.1 : 0));
        halo.alpha = isActive ? 0.48 : 0.22;

        particles.forEach((item, index) => {
          const boost = isActive ? (mode === "crash" ? 4.2 : 2.35) : 1;
          item.node.y -= item.speed * ticker.deltaTime * boost;
          item.node.x += Math.sin(time * 0.012 + item.phase) * item.drift * boost;
          item.node.alpha = Math.max(0.08, (isActive ? 0.48 : 0.22) + Math.sin(time * 0.032 + index) * 0.14);
          if (item.node.y < -12) {
            item.node.y = height + 12;
            item.node.x = Math.random() * width;
          }
          if (item.node.x < -15) item.node.x = width + 10;
          if (item.node.x > width + 15) item.node.x = -10;
        });

        streaks.forEach((item, index) => {
          item.node.visible = isActive || mode === "crash";
          item.node.alpha = (isActive ? 0.22 : 0.12) + (index % 3) * 0.035;
          item.node.x += item.speed * ticker.deltaTime * (mode === "crash" ? (isActive ? 3.8 : 2.0) : 1.8);
          item.node.y -= item.speed * ticker.deltaTime * (mode === "crash" ? (isActive ? 1.4 : 0.7) : 0.35);
          if (item.node.x > width + 120 || item.node.y < -30) {
            item.node.x = -130 - Math.random() * 180;
            item.node.y = height * (0.35 + Math.random() * 0.65);
          }
        });
      };

      application.ticker.add(animate);
      destroy = () => {
        application.ticker.remove(animate);
        application.destroy(true, { children: true });
      };
    }).catch(() => {
      // The CSS/SVG game scene remains fully usable if WebGL is unavailable.
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [accent, accent2, mode]);

  return <div ref={host} className="premium-pixi-canvas" aria-hidden="true" />;
}
