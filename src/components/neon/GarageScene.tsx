"use client";

import { useEffect, useRef } from "react";
import { Application, Graphics } from "pixi.js";

export default function GarageScene({ name, color, accent }: { name: string; color: string; accent: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();
    const art = new Graphics();
    const body = Number.parseInt(color.slice(1), 16);
    const glow = Number.parseInt(accent.slice(1), 16);
    void app.init({ resizeTo: host, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1), backgroundAlpha: 0 }).then(() => {
      if (disposed) { app.destroy({ removeView: true }, { children: true }); return; }
      host.appendChild(app.canvas);
      app.canvas.setAttribute("aria-label", `Animated 2D showcase of ${name}`);
      Object.assign(app.canvas.style, { width: "100%", height: "100%" });
      app.stage.addChild(art);
      app.ticker.add(() => {
        const width = app.screen.width, height = app.screen.height, time = performance.now() / 1000;
        const cx = width / 2, cy = height * .56 + Math.sin(time * 1.5) * 3, scale = Math.min(width / 700, height / 420, 1.25);
        art.clear();
        art.rect(0, 0, width, height).fill(0x030711);
        for (let ring = 0; ring < 4; ring++) art.ellipse(cx, height * .73, (220 + ring * 30) * scale, (54 + ring * 9) * scale).stroke({ color: ring % 2 ? glow : 0x22d3ee, width: 2, alpha: .24 - ring * .04 });
        for (let beam = 0; beam < 10; beam++) { const x = (beam + .5) * width / 10; art.moveTo(x, 0).lineTo(cx + (x - cx) * .5, height).stroke({ color: beam % 2 ? glow : 0x22d3ee, width: 1, alpha: .08 }); }
        art.ellipse(cx, cy + 55 * scale, 155 * scale, 30 * scale).fill({ color: glow, alpha: .16 });
        const p = (x: number, y: number) => ({ x: cx + x * scale, y: cy + y * scale });
        const polygon = (points: Array<{x:number;y:number}>, fill: number, alpha = 1) => { art.moveTo(points[0].x, points[0].y); points.slice(1).forEach((point) => art.lineTo(point.x, point.y)); art.closePath().fill({ color: fill, alpha }); };
        polygon([p(-122, 44), p(-145, 12), p(-130, -42), p(-78, -75), p(78, -75), p(130, -42), p(145, 12), p(122, 44)], glow, .16);
        polygon([p(-108, 43), p(-130, 10), p(-114, -35), p(-67, -64), p(67, -64), p(114, -35), p(130, 10), p(108, 43)], body);
        polygon([p(-71, -10), p(-58, -48), p(-31, -61), p(31, -61), p(58, -48), p(71, -10)], 0x071927, .92);
        polygon([p(-62, -14), p(-50, -43), p(50, -43), p(62, -14)], 0x9edcff, .32);
        art.roundRect(cx - 88 * scale, cy + 17 * scale, 176 * scale, 14 * scale, 7 * scale).fill({ color: 0x05070c, alpha: .95 });
        art.roundRect(cx - 38 * scale, cy + 18 * scale, 76 * scale, 4 * scale, 2 * scale).fill({ color: glow, alpha: .95 });
        for (const side of [-1, 1]) { art.roundRect(cx + side * 95 * scale - 16 * scale, cy + 16 * scale, 32 * scale, 10 * scale, 5 * scale).fill(0xff2a55); art.roundRect(cx + side * 112 * scale - 15 * scale, cy - 35 * scale, 30 * scale, 15 * scale, 5 * scale).fill(0x070910); }
      });
    });
    return () => { disposed = true; if (app.renderer) app.destroy({ removeView: true }, { children: true }); };
  }, [name, color, accent]);
  return <div ref={hostRef} className="h-full w-full [&_canvas]:block" />;
}
