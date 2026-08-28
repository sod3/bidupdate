"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Application, Graphics, Text } from "pixi.js";
import {
  ballsAreMoving,
  cloneBalls,
  colorForBall,
  createRack,
  predictAim,
  stepPoolPhysics,
  strikeCueBall,
  validCuePlacement,
  type PoolBallState,
  type SpinInput,
} from "@/lib/eight-ball/physics";
import { POOL_CUES, POOL_TABLES } from "@/lib/eight-ball/constants";
import { getGameRenderQuality } from "@/lib/gamePerformance";

export type PoolShotReport = { firstHit: number | null; pocketed: number[]; cuePocketed: boolean; railHits: number; collisionCount: number; bankShot: boolean; durationMs: number };
export type PoolShotInput = { angle: number; power: number; spin: SpinInput; cinematic?: boolean };
export type EightBallArenaHandle = { reset: () => void; shoot: (shot: PoolShotInput) => boolean; getSnapshot: () => PoolBallState[]; placeCueBall: (x: number, z: number) => boolean };
type Props = { interactive: boolean; showGuide: boolean; aimAngle: number; power: number; spin: SpinInput; cueId: string; tableId: string; ballSkinId: string; onAimChange: (angle: number) => void; onShotStart: () => void; onShotComplete: (report: PoolShotReport) => void; onSound: (kind: "cue" | "collision" | "rail" | "pocket", intensity: number) => void };
type ShotRuntime = { input: PoolShotInput; requestedAt: number; struckAt: number | null; firstHit: number | null; pocketed: number[]; railHits: number; collisionCount: number; railBeforePocket: boolean; settleStartedAt: number | null };
type TrailPoint = { x: number; z: number; life: number; color: number };
type PocketBurst = { x: number; z: number; life: number; color: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const hexNumber = (value: string) => Number.parseInt(value.slice(1), 16);

export const EightBallArena = forwardRef<EightBallArenaHandle, Props>(function EightBallArena(props, forwardedRef) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ballsRef = useRef<PoolBallState[]>(createRack());
  const propsRef = useRef(props);
  const shotRef = useRef<ShotRuntime | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startAngle: number } | null>(null);
  useEffect(() => { propsRef.current = props; }, [props]);

  useImperativeHandle(forwardedRef, () => ({
    reset: () => { ballsRef.current = createRack(); shotRef.current = null; },
    shoot: (shot) => {
      if (shotRef.current || ballsAreMoving(ballsRef.current)) return false;
      const cue = ballsRef.current.find((ball) => ball.number === 0 && !ball.pocketed);
      if (!cue) return false;
      shotRef.current = { input: shot, requestedAt: performance.now(), struckAt: null, firstHit: null, pocketed: [], railHits: 0, collisionCount: 0, railBeforePocket: false, settleStartedAt: null };
      propsRef.current.onShotStart();
      return true;
    },
    getSnapshot: () => cloneBalls(ballsRef.current),
    placeCueBall: (x, z) => {
      if (!validCuePlacement(x, z, ballsRef.current)) return false;
      const cue = ballsRef.current.find((ball) => ball.number === 0); if (!cue) return false;
      Object.assign(cue, { x, z, vx: 0, vz: 0, sideSpin: 0, topSpin: 0, pocketed: false }); return true;
    },
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const quality = getGameRenderQuality();
    const app = new Application();
    const hall = new Graphics(), table = new Graphics(), fx = new Graphics(), ballsArt = new Graphics(), labels: Text[] = [];
    const trails = new Map<number, TrailPoint[]>();
    const bursts: PocketBurst[] = [];
    for (let number = 0; number <= 15; number++) {
      const label = new Text({ text: number === 0 ? "" : String(number), style: { fontFamily: "Arial", fontSize: 12, fontWeight: "900", fill: number === 8 ? 0xffffff : 0x05070b, align: "center" } });
      label.anchor.set(.5); labels.push(label);
    }
    void app.init({ resizeTo: host, antialias: quality.antialias, autoDensity: true, resolution: quality.resolution, preference: "webgl", backgroundAlpha: 0, powerPreference: "high-performance" }).then(() => {
      if (disposed) { app.destroy({ removeView: true }, { children: true }); return; }
      host.appendChild(app.canvas);
      app.canvas.setAttribute("aria-label", "8 Ball Cash Arena premium top-down 2D pool table. Drag left or right to aim.");
      Object.assign(app.canvas.style, { width: "100%", height: "100%", touchAction: "none" });
      app.stage.addChild(hall, table, fx, ballsArt, ...labels);
      let lastFrame = performance.now(), lastCollisionSound = 0, cuePulse = 0;
      app.ticker.add(() => {
        const now = performance.now(), rawDelta = Math.min(.033, Math.max(.001, (now - lastFrame) / 1000)); lastFrame = now;
        const activeShot = shotRef.current;
        const cinematic = Boolean(activeShot?.input.cinematic && activeShot.struckAt && now - activeShot.struckAt < 1700);
        const delta = rawDelta * (cinematic ? .43 : 1);
        if (activeShot && activeShot.struckAt === null && now - activeShot.requestedAt >= 185) {
          activeShot.struckAt = now; strikeCueBall(ballsRef.current, activeShot.input.angle, activeShot.input.power, activeShot.input.spin); propsRef.current.onSound("cue", activeShot.input.power); cuePulse = 1;
        }
        if (activeShot?.struckAt) {
          const steps = Math.max(1, Math.ceil(delta / .008));
          for (let step = 0; step < steps; step++) {
            const events = stepPoolPhysics(ballsRef.current, delta / steps);
            events.collisions.forEach((collision) => {
              activeShot.collisionCount += 1;
              if (activeShot.firstHit === null && (collision.a === 0 || collision.b === 0)) activeShot.firstHit = collision.a === 0 ? collision.b : collision.a;
              if (now - lastCollisionSound > 38) { lastCollisionSound = now; propsRef.current.onSound("collision", clamp(collision.force / 3, .12, 1)); }
            });
            if (events.railHits.length) { activeShot.railHits += events.railHits.length; if (!activeShot.pocketed.length) activeShot.railBeforePocket = true; propsRef.current.onSound("rail", .35); }
            if (events.pocketed.length) {
              activeShot.pocketed.push(...events.pocketed); propsRef.current.onSound("pocket", .85);
              events.pocketed.forEach((number) => { const ball = ballsRef.current.find((item) => item.number === number); if (ball) bursts.push({ x: ball.x, z: ball.z, life: 1, color: hexNumber(colorForBall(number)) }); });
            }
          }
          ballsRef.current.forEach((ball) => {
            if (ball.pocketed || Math.hypot(ball.vx, ball.vz) < .08) return;
            const list = trails.get(ball.number) ?? []; list.push({ x: ball.x, z: ball.z, life: .42, color: hexNumber(colorForBall(ball.number)) }); if (list.length > 15) list.shift(); trails.set(ball.number, list);
          });
          if (!ballsAreMoving(ballsRef.current)) {
            activeShot.settleStartedAt ??= now;
            if (now - activeShot.settleStartedAt > 260) {
              const report: PoolShotReport = { firstHit: activeShot.firstHit, pocketed: [...activeShot.pocketed], cuePocketed: activeShot.pocketed.includes(0), railHits: activeShot.railHits, collisionCount: activeShot.collisionCount, bankShot: activeShot.railBeforePocket && activeShot.pocketed.some((number) => number > 0), durationMs: Math.round(now - activeShot.struckAt) };
              shotRef.current = null; propsRef.current.onShotComplete(report);
            }
          } else activeShot.settleStartedAt = null;
        }
        trails.forEach((points) => points.forEach((point) => { point.life -= rawDelta; }));
        cuePulse = Math.max(0, cuePulse - rawDelta * 2.4);

        const width = app.screen.width, height = app.screen.height;
        const compactLandscape = height < 500;
        const availableTop = compactLandscape ? 112 : width < 640 ? 188 : 148;
        const availableBottom = compactLandscape ? 106 : width < 640 ? 184 : 138;
        const tableH = Math.min(height - availableTop - availableBottom, width * 1.55, 650), tableW = tableH * .5;
        const cx = width / 2, cy = availableTop + tableH / 2;
        const map = (x: number, z: number) => ({ x: cx + x / 1.17 * tableW * .405, y: cy + z / 2.34 * tableH * .43 });
        const style = POOL_TABLES.find((item) => item.id === propsRef.current.tableId) ?? POOL_TABLES[0];
        const cueStyle = POOL_CUES.find((item) => item.id === propsRef.current.cueId) ?? POOL_CUES[0];
        const cloth = hexNumber(style.cloth), rail = hexNumber(style.rail), glow = hexNumber(style.glow);
        hall.clear(); table.clear(); fx.clear(); ballsArt.clear();
        hall.rect(0, 0, width, height).fill(0x02040a);
        hall.circle(width * .2, height * .22, width * .28).fill({ color: 0x0ea5e9, alpha: .055 }); hall.circle(width * .82, height * .32, width * .25).fill({ color: 0xa855f7, alpha: .065 });
        for (let band = 0; band < 7; band++) hall.rect(0, height * (.13 + band * .07), width, 1).fill({ color: band % 2 ? 0x22d3ee : 0xa855f7, alpha: .055 });
        for (let person = 0; person < Math.floor(width / 30); person++) { const x = 15 + person * 30, y = availableTop - 24 - (person % 3) * 5; hall.circle(x, y, 5).fill({ color: 0x293449, alpha: .68 }); hall.roundRect(x - 6, y + 5, 12, 16, 5).fill({ color: person % 2 ? 0x111827 : 0x1e293b, alpha: .72 }); }
        hall.ellipse(cx, cy + tableH * .48, tableW * .78, tableH * .12).fill({ color: 0x000000, alpha: .55 });
        table.roundRect(cx - tableW * .59, cy - tableH * .51, tableW * 1.18, tableH * 1.02, tableW * .095).fill({ color: glow, alpha: .11 });
        table.roundRect(cx - tableW * .56, cy - tableH * .49, tableW * 1.12, tableH * .98, tableW * .08).fill(rail).stroke({ color: glow, width: 2.5, alpha: .72 });
        table.roundRect(cx - tableW * .44, cy - tableH * .435, tableW * .88, tableH * .87, tableW * .035).fill(cloth);
        for (let stripe = 0; stripe < 9; stripe++) table.rect(cx - tableW * .435, cy - tableH * .425 + stripe * tableH * .095, tableW * .87, tableH * .0475).fill({ color: 0xffffff, alpha: stripe % 2 ? .012 : .022 });
        const pockets = [[-1.205, -2.39], [1.205, -2.39], [-1.225, 0], [1.225, 0], [-1.205, 2.39], [1.205, 2.39]];
        pockets.forEach(([x, z]) => { const p = map(x, z); table.circle(p.x, p.y, tableW * .052).fill(0x000000).stroke({ color: glow, width: 1.5, alpha: .28 }); });
        for (let marker = 1; marker <= 3; marker++) for (const side of [-1, 1]) { const p1 = map(side * 1.11, -2.34 + marker * 1.17), p2 = map(-1.17 + marker * .585, side * 2.28); table.rect(p1.x - 2, p1.y - 2, 4, 4).fill({ color: 0xe8f5ff, alpha: .75 }); table.rect(p2.x - 2, p2.y - 2, 4, 4).fill({ color: 0xe8f5ff, alpha: .75 }); }
        const cue = ballsRef.current.find((ball) => ball.number === 0 && !ball.pocketed);
        const showGuide = Boolean(cue && propsRef.current.showGuide && !shotRef.current && !ballsAreMoving(ballsRef.current));
        if (cue && showGuide) {
          const prediction = predictAim(ballsRef.current, propsRef.current.aimAngle), start = map(cue.x, cue.z), end = map(prediction.endX, prediction.endZ);
          fx.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color: glow, width: 2.5, alpha: .85 });
          const dashCount = 12;
          if (prediction.objectEndX !== null && prediction.objectEndZ !== null) { const object = map(prediction.endX, prediction.endZ), objectEnd = map(prediction.objectEndX, prediction.objectEndZ); for (let dash = 0; dash < dashCount; dash += 2) { const t1 = dash / dashCount, t2 = (dash + 1) / dashCount; fx.moveTo(object.x + (objectEnd.x - object.x) * t1, object.y + (objectEnd.y - object.y) * t1).lineTo(object.x + (objectEnd.x - object.x) * t2, object.y + (objectEnd.y - object.y) * t2).stroke({ color: 0xfacc15, width: 2, alpha: .72 }); } }
          fx.circle(end.x, end.y, 8).stroke({ color: prediction.targetNumber ? 0xfacc15 : glow, width: 2, alpha: .8 });
          const pull = 54 + propsRef.current.power * 52, cueBack = { x: start.x - Math.sin(propsRef.current.aimAngle) * pull, y: start.y - Math.cos(propsRef.current.aimAngle) * pull }, cueEnd = { x: start.x - Math.sin(propsRef.current.aimAngle) * (pull + tableH * .28), y: start.y - Math.cos(propsRef.current.aimAngle) * (pull + tableH * .28) };
          fx.moveTo(cueBack.x, cueBack.y).lineTo(cueEnd.x, cueEnd.y).stroke({ color: hexNumber(cueStyle.color), width: Math.max(5, tableW * .018), alpha: 1 }); fx.moveTo(cueBack.x, cueBack.y).lineTo(cueBack.x - Math.sin(propsRef.current.aimAngle) * tableH * .07, cueBack.y - Math.cos(propsRef.current.aimAngle) * tableH * .07).stroke({ color: hexNumber(cueStyle.accent), width: Math.max(2, tableW * .006), alpha: 1 });
        }
        if (activeShot && cue && activeShot.struckAt === null) {
          const start = map(cue.x, cue.z), pullTime = clamp((now - activeShot.requestedAt) / 185, 0, 1), pull = 46 + activeShot.input.power * 65 * (1 - pullTime);
          fx.moveTo(start.x - Math.sin(activeShot.input.angle) * pull, start.y - Math.cos(activeShot.input.angle) * pull).lineTo(start.x - Math.sin(activeShot.input.angle) * (pull + tableH * .3), start.y - Math.cos(activeShot.input.angle) * (pull + tableH * .3)).stroke({ color: hexNumber(cueStyle.color), width: 6, alpha: 1 });
        }
        trails.forEach((points) => { points.forEach((point, index) => { if (point.life <= 0) return; const p = map(point.x, point.z); fx.circle(p.x, p.y, Math.max(1, tableW * .017 * point.life)).fill({ color: point.color, alpha: point.life * .24 * (index + 1) / points.length }); }); });
        bursts.forEach((burst) => { burst.life -= rawDelta * 1.3; const p = map(burst.x, burst.z); fx.circle(p.x, p.y, (1 - burst.life) * 34).stroke({ color: burst.color, width: 3, alpha: clamp(burst.life, 0, 1) }); });
        for (let index = bursts.length - 1; index >= 0; index--) if (bursts[index].life <= 0) bursts.splice(index, 1);
        labels.forEach((label) => { label.visible = false; });
        ballsRef.current.forEach((ball) => {
          if (ball.pocketed) return;
          const p = map(ball.x, ball.z), radius = Math.max(7, tableW * .024), color = hexNumber(colorForBall(ball.number));
          ballsArt.circle(p.x + radius * .25, p.y + radius * .32, radius * 1.05).fill({ color: 0x000000, alpha: .28 });
          if (ball.number >= 9) { ballsArt.circle(p.x, p.y, radius).fill(0xf8fafc); ballsArt.roundRect(p.x - radius, p.y - radius * .47, radius * 2, radius * .94, radius * .2).fill(color); }
          else ballsArt.circle(p.x, p.y, radius).fill(color);
          ballsArt.circle(p.x - radius * .32, p.y - radius * .36, radius * .26).fill({ color: 0xffffff, alpha: .65 });
          if (ball.number > 0) { ballsArt.circle(p.x, p.y, radius * .43).fill(ball.number === 8 ? 0x20242a : 0xffffff); const label = labels[ball.number]; label.visible = true; label.position.set(p.x, p.y + .4); label.scale.set(clamp(radius / 13, .55, 1)); }
        });
        if (cuePulse > 0 && cue) { const p = map(cue.x, cue.z); fx.circle(p.x, p.y, 15 + (1 - cuePulse) * 34).stroke({ color: glow, width: 3, alpha: cuePulse * .7 }); }
      });
    });
    return () => { disposed = true; if (app.renderer) app.destroy({ removeView: true }, { children: true }); };
  }, []);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!props.interactive) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startAngle: props.aimAngle }; event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; props.onAimChange(drag.startAngle + (event.clientX - drag.startX) * .0065); };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; };
  return <div ref={hostRef} className="absolute inset-0 touch-none outline-none [&_canvas]:block" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />;
});
