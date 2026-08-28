"use client";

import { useEffect, useRef } from "react";
import { Application, Graphics, Text } from "pixi.js";
import { ParticlePool } from "@/game-engine";
import { getGameRenderQuality } from "@/lib/gamePerformance";
import type { SlotGrid, SlotSymbolId } from "@/lib/slots/engine";

type Props = {
  grid: SlotGrid;
  spinning: boolean;
  stoppedReels: number;
  winningCells: ReadonlySet<string>;
  celebration: "none" | "win" | "jackpot";
};

type Spark = { active: boolean; x: number; y: number; vx: number; vy: number; life: number; size: number };

const spinnerSymbols: readonly SlotSymbolId[] = ["COIN", "EMERALD", "RUBY", "BELL", "STAR", "CROWN", "CHEST", "SEVEN", "WILD", "BONUS"];
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function polygon(graphics: Graphics, points: Array<[number, number]>, color: number, alpha = 1) {
  graphics.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => graphics.lineTo(x, y));
  graphics.closePath().fill({ color, alpha });
}

function star(graphics: Graphics, x: number, y: number, outer: number, inner: number, color: number) {
  const points: Array<[number, number]> = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 ? inner : outer;
    points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
  }
  polygon(graphics, points, color);
}

function drawSymbol(graphics: Graphics, label: Text, symbol: SlotSymbolId, x: number, y: number, size: number, pulse: number) {
  const scale = size * (.88 + pulse * .06);
  label.text = "";
  if (symbol === "COIN") {
    graphics.circle(x, y, scale * .34).fill(0xf8c544).stroke({ color: 0x7b3d08, width: scale * .055 });
    graphics.circle(x, y, scale * .23).stroke({ color: 0xfff3a0, width: scale * .045, alpha: .9 });
    star(graphics, x, y, scale * .13, scale * .06, 0xfff5b0);
  } else if (symbol === "EMERALD" || symbol === "RUBY") {
    const color = symbol === "EMERALD" ? 0x20d48a : 0xf23b5d;
    const dark = symbol === "EMERALD" ? 0x075d46 : 0x741126;
    polygon(graphics, [[x, y - scale * .4], [x + scale * .34, y - scale * .12], [x + scale * .23, y + scale * .34], [x, y + scale * .42], [x - scale * .23, y + scale * .34], [x - scale * .34, y - scale * .12]], dark);
    polygon(graphics, [[x, y - scale * .32], [x + scale * .25, y - scale * .08], [x, y + scale * .32], [x - scale * .25, y - scale * .08]], color);
    polygon(graphics, [[x, y - scale * .29], [x + scale * .18, y - scale * .08], [x, y - scale * .01]], 0xffffff, .42);
  } else if (symbol === "BELL") {
    graphics.roundRect(x - scale * .3, y - scale * .2, scale * .6, scale * .48, scale * .18).fill(0xf6b936).stroke({ color: 0x743908, width: scale * .045 });
    graphics.circle(x, y + scale * .3, scale * .08).fill(0xffe58a);
    graphics.roundRect(x - scale * .35, y + scale * .2, scale * .7, scale * .09, scale * .04).fill(0xffdb65);
    graphics.ellipse(x - scale * .09, y - scale * .11, scale * .08, scale * .17).fill({ color: 0xffffff, alpha: .45 });
  } else if (symbol === "STAR") {
    star(graphics, x, y, scale * .43, scale * .19, 0xffd84d);
    star(graphics, x, y - scale * .02, scale * .27, scale * .12, 0xfff5a1);
  } else if (symbol === "CROWN") {
    polygon(graphics, [[x - scale * .38, y + scale * .26], [x - scale * .33, y - scale * .26], [x - scale * .08, y], [x, y - scale * .38], [x + scale * .1, y], [x + scale * .34, y - scale * .26], [x + scale * .38, y + scale * .26]], 0xf5b72d);
    graphics.roundRect(x - scale * .38, y + scale * .17, scale * .76, scale * .15, scale * .04).fill(0xffdb5f).stroke({ color: 0x743908, width: scale * .035 });
    [-.33, 0, .34].forEach((offset) => graphics.circle(x + scale * offset, y - scale * (offset === 0 ? .38 : .26), scale * .055).fill(0xfff5a3));
  } else if (symbol === "CHEST") {
    graphics.roundRect(x - scale * .36, y - scale * .25, scale * .72, scale * .57, scale * .1).fill(0x9b481d).stroke({ color: 0x4b1b0b, width: scale * .05 });
    graphics.roundRect(x - scale * .36, y - scale * .25, scale * .72, scale * .24, scale * .1).fill(0xc56a28);
    graphics.rect(x - scale * .05, y - scale * .29, scale * .1, scale * .64).fill(0xf2bd3e);
    graphics.roundRect(x - scale * .1, y - scale * .04, scale * .2, scale * .18, scale * .04).fill(0xffdc65);
  } else {
    const isSeven = symbol === "SEVEN";
    label.text = isSeven ? "7" : symbol;
    label.style.fill = isSeven ? 0xef2944 : symbol === "WILD" ? 0xb66dff : 0x4fe9ff;
    label.style.stroke = { color: isSeven ? 0xffd65a : 0xffffff, width: isSeven ? 6 : 3 };
    label.style.fontSize = isSeven ? 86 : 32;
    label.style.fontStyle = isSeven ? "italic" : "normal";
    label.style.fontWeight = "900";
    label.position.set(x, y);
    label.scale.set(clamp(scale / (isSeven ? 105 : 88), .36, 1.08));
    label.visible = true;
  }
}

export default function SlotsReelCanvas({ grid, spinning, stoppedReels, winningCells, celebration }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ grid, spinning, stoppedReels, winningCells, celebration });
  const stopTimesRef = useRef([0, 0, 0, 0, 0]);
  const previousStoppedRef = useRef(stoppedReels);

  useEffect(() => {
    if (stoppedReels > previousStoppedRef.current) {
      for (let reel = previousStoppedRef.current; reel < stoppedReels; reel += 1) stopTimesRef.current[reel] = performance.now();
    }
    if (spinning && stoppedReels === 0) stopTimesRef.current.fill(0);
    previousStoppedRef.current = stoppedReels;
    stateRef.current = { grid, spinning, stoppedReels, winningCells, celebration };
  }, [celebration, grid, spinning, stoppedReels, winningCells]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const quality = getGameRenderQuality();
    const app = new Application();
    const machine = new Graphics();
    const symbols = new Graphics();
    const effects = new Graphics();
    const labels = Array.from({ length: 15 }, () => {
      const label = new Text({ text: "", style: { fontFamily: "Arial", align: "center", fill: 0xffffff, fontWeight: "900" } });
      label.anchor.set(.5);
      return label;
    });
    const sparks = new ParticlePool<Spark>(() => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 0 }), Math.round(120 * quality.particleScale));
    let lastCelebration = "none";
    let lastFrame = performance.now();

    void app.init({ resizeTo: host, antialias: quality.antialias, autoDensity: true, resolution: quality.resolution, preference: "webgl", backgroundAlpha: 0, powerPreference: "high-performance" }).then(() => {
      if (disposed) { app.destroy({ removeView: true }, { children: true }); return; }
      host.appendChild(app.canvas);
      app.canvas.setAttribute("aria-label", "Five reel Nova 777 slot machine");
      Object.assign(app.canvas.style, { width: "100%", height: "100%" });
      app.stage.addChild(machine, symbols, ...labels, effects);
      app.ticker.add(() => {
        const now = performance.now();
        const delta = Math.min(.034, (now - lastFrame) / 1000);
        lastFrame = now;
        const state = stateRef.current;
        const width = app.screen.width;
        const height = app.screen.height;
        const gap = Math.max(3, width * .006);
        const reelWidth = (width - gap * 6) / 5;
        const cellHeight = (height - gap * 4) / 3;
        machine.clear(); symbols.clear(); effects.clear();
        labels.forEach((label) => { label.visible = false; });

        machine.roundRect(0, 0, width, height, Math.max(10, width * .018)).fill(0x090607);
        machine.rect(0, 0, width, height).fill({ color: 0x7c2d12, alpha: .045 });
        for (let column = 0; column < 5; column += 1) {
          const reelX = gap + column * (reelWidth + gap);
          machine.roundRect(reelX, gap, reelWidth, height - gap * 2, Math.max(7, reelWidth * .08)).fill(0xf5ecd9).stroke({ color: 0xb67b20, width: Math.max(1.5, width * .0025) });
          machine.rect(reelX, gap, reelWidth, height - gap * 2).fill({ color: column % 2 ? 0x7c2d12 : 0x1d4ed8, alpha: .025 });
          const rolling = state.spinning && column >= state.stoppedReels;
          const stoppedAgo = now - stopTimesRef.current[column];
          const bounce = stoppedAgo >= 0 && stoppedAgo < 330 ? Math.sin(stoppedAgo / 330 * Math.PI) * cellHeight * .075 : 0;
          for (let row = 0; row < 3; row += 1) {
            const cellY = gap * 2 + row * (cellHeight + gap) - bounce;
            const cycle = Math.floor(now / (42 + column * 4)) + row + column * 3;
            const symbol = rolling ? spinnerSymbols[cycle % spinnerSymbols.length] : state.grid[row][column];
            const winning = !rolling && state.winningCells.has(`${row}:${column}`);
            const pulse = winning ? (Math.sin(now / 105) + 1) / 2 : 0;
            if (row > 0) machine.rect(reelX + 4, cellY - gap / 2, reelWidth - 8, 1).fill({ color: 0x7b4b18, alpha: .17 });
            if (winning) {
              effects.roundRect(reelX + 3, cellY - 2, reelWidth - 6, cellHeight + 3, 8).fill({ color: 0xffd84a, alpha: .12 + pulse * .18 }).stroke({ color: 0xffd84a, width: 2 + pulse * 2, alpha: .62 + pulse * .3 });
            }
            if (rolling) {
              for (let streak = 0; streak < 4; streak += 1) effects.roundRect(reelX + reelWidth * (.18 + streak * .2), cellY + (now / (3 + streak) % cellHeight), Math.max(1, reelWidth * .025), cellHeight * .28, 2).fill({ color: streak % 2 ? 0xf59e0b : 0xef4444, alpha: .11 });
            }
            drawSymbol(symbols, labels[row * 5 + column], symbol, reelX + reelWidth / 2, cellY + cellHeight / 2, Math.min(reelWidth, cellHeight), pulse);
          }
          machine.rect(reelX, gap, reelWidth, height * .12).fill({ color: 0x401207, alpha: .12 });
          machine.rect(reelX, height - gap - height * .12, reelWidth, height * .12).fill({ color: 0x401207, alpha: .12 });
        }

        if (state.celebration !== "none" && lastCelebration === "none") {
          const amount = state.celebration === "jackpot" ? 90 : 38;
          for (let index = 0; index < Math.round(amount * quality.particleScale); index += 1) {
            const spark = sparks.acquire();
            if (!spark) break;
            Object.assign(spark, { x: width * (.15 + Math.random() * .7), y: height * .5, vx: (Math.random() - .5) * width * .52, vy: -height * (.35 + Math.random() * .65), life: .8 + Math.random() * 1.2, size: 2 + Math.random() * 5 });
          }
        }
        lastCelebration = state.celebration;
        sparks.active().forEach((spark) => {
          spark.vy += height * 1.3 * delta;
          spark.x += spark.vx * delta;
          spark.y += spark.vy * delta;
          spark.life -= delta;
          if (spark.life <= 0) { spark.active = false; return; }
          effects.circle(spark.x, spark.y, spark.size).fill({ color: 0xffd34e, alpha: clamp(spark.life, 0, 1) });
        });
      });
    });
    return () => { disposed = true; if (app.renderer) app.destroy({ removeView: true }, { children: true }); };
  }, []);

  return <div ref={hostRef} className="slot-reel-canvas" aria-hidden="true" />;
}
