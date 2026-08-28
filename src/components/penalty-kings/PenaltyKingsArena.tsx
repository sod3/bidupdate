"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Application, Graphics } from "pixi.js";
import { Crosshair, MoveUp, Sparkles, Zap } from "lucide-react";
import type { KeeperZone, ShotInput, ShotResolution } from "@/lib/penalty-kings/constants";
import { getGameRenderQuality } from "@/lib/gamePerformance";

type ArenaRole = "spectator" | "striker" | "keeper";
type Props = { role: ArenaRole; interactive: boolean; resolution: ShotResolution | null; turnKey: number; rain: boolean; onShot: (shot: ShotInput) => void; onSave: (zone: KeeperZone) => void };
type Gesture = { pointerId: number; startX: number; startY: number; x: number; y: number; startedAt: number; points: Array<{ x: number; y: number }> };
type AimPreview = ShotInput & { active: boolean };
type Confetti = { x: number; y: number; vx: number; vy: number; color: number; life: number; size: number };

const idleAim: AimPreview = { active: false, directionX: 0, height: .5, power: 0, curve: 0, timing: .5 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const keeperZones: Array<{ zone: KeeperZone; label: string; position: string; symbol: string }> = [
  { zone: "upper-left", label: "Top left", position: "left-[19%] top-[24%]", symbol: "↖" },
  { zone: "upper-right", label: "Top right", position: "right-[19%] top-[24%]", symbol: "↗" },
  { zone: "low-left", label: "Low left", position: "left-[16%] top-[48%]", symbol: "↙" },
  { zone: "center", label: "Hold center", position: "left-1/2 top-[48%] -translate-x-1/2", symbol: "●" },
  { zone: "low-right", label: "Low right", position: "right-[16%] top-[48%]", symbol: "↘" },
];

function keeperTarget(zone: KeeperZone, width: number, height: number) {
  const map: Record<KeeperZone, [number, number, number]> = {
    "upper-left": [-.28, -.13, -.78], "upper-right": [.28, -.13, .78], "low-left": [-.31, .04, -.58], center: [0, .03, 0], "low-right": [.31, .04, .58],
  };
  const [x, y, rotation] = map[zone];
  return { x: width * (.5 + x), y: height * (.465 + y), rotation };
}

function drawPlayer(graphics: Graphics, x: number, y: number, scale: number, kit: number, pose = 0, keeper = false) {
  graphics.circle(x, y - 52 * scale, 10 * scale).fill(0x9d603a);
  graphics.roundRect(x - 13 * scale, y - 43 * scale, 26 * scale, 34 * scale, 8 * scale).fill(kit);
  graphics.roundRect(x - 14 * scale, y - 12 * scale, 12 * scale, 38 * scale, 5 * scale).fill(0x07131c);
  graphics.roundRect(x + 2 * scale, y - 12 * scale, 12 * scale, 38 * scale, 5 * scale).fill(0x07131c);
  const armReach = keeper ? 35 : 21;
  graphics.moveTo(x - 10 * scale, y - 36 * scale).lineTo(x - armReach * scale, y + (-21 + pose * 13) * scale).stroke({ color: keeper ? kit : 0x9d603a, width: 8 * scale });
  graphics.moveTo(x + 10 * scale, y - 36 * scale).lineTo(x + armReach * scale, y + (-21 - pose * 13) * scale).stroke({ color: keeper ? kit : 0x9d603a, width: 8 * scale });
  if (keeper) for (const side of [-1, 1]) graphics.circle(x + side * armReach * scale, y + (-21 - side * pose * 13) * scale, 7 * scale).fill(0xd9ff72);
}

export default function PenaltyKingsArena({ role, interactive, resolution, turnKey, rain, onShot, onSave }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ role, interactive, resolution, onShot, onSave });
  const gestureRef = useRef<Gesture | null>(null);
  const flightRef = useRef<{ resolution: ShotResolution; startedAt: number } | null>(null);
  const aimRef = useRef<AimPreview>(idleAim);
  const [aim, setAim] = useState<AimPreview>(idleAim);
  const [timing, setTiming] = useState(.5);

  useEffect(() => { propsRef.current = { role, interactive, resolution, onShot, onSave }; }, [role, interactive, resolution, onShot, onSave]);
  useEffect(() => { aimRef.current = aim; }, [aim]);
  useEffect(() => {
    gestureRef.current = null;
    const frame = requestAnimationFrame(() => setAim(idleAim));
    return () => cancelAnimationFrame(frame);
  }, [turnKey]);
  useEffect(() => {
    if (!resolution || flightRef.current?.resolution.turn === resolution.turn) return;
    flightRef.current = { resolution, startedAt: performance.now() };
  }, [resolution]);
  useEffect(() => {
    if (!interactive || role !== "striker") return;
    let frame = 0;
    const tick = () => { setTiming((Math.sin(performance.now() / 360) + 1) / 2); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [interactive, role, turnKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const quality = getGameRenderQuality();
    const app = new Application();
    const scene = new Graphics();
    const fx = new Graphics();
    const confetti: Confetti[] = [];
    const drops = Array.from({ length: Math.round(110 * quality.particleScale) }, (_, index) => ({ x: (index * 71) % 1200, y: (index * 43) % 800, speed: 350 + index % 9 * 32 }));
    let lastResolutionTurn = -999;
    void app.init({ resizeTo: host, antialias: quality.antialias, autoDensity: true, resolution: quality.resolution, preference: "webgl", backgroundAlpha: 0, powerPreference: "high-performance" }).then(() => {
      if (disposed) { app.destroy({ removeView: true }, { children: true }); return; }
      host.appendChild(app.canvas);
      app.canvas.setAttribute("aria-label", "Penalty Kings interactive premium 2D penalty shootout");
      Object.assign(app.canvas.style, { width: "100%", height: "100%", touchAction: "none" });
      app.stage.addChild(scene, fx);
      let lastFrame = performance.now();
      app.ticker.add(() => {
        const now = performance.now(), dt = Math.min(.034, (now - lastFrame) / 1000); lastFrame = now;
        const width = app.screen.width, height = app.screen.height, center = width / 2;
        scene.clear(); fx.clear();
        scene.rect(0, 0, width, height).fill(0x020906);
        scene.rect(0, 0, width, height * .32).fill(0x07182b);
        scene.circle(width * .16, height * .07, width * .2).fill({ color: 0x2563eb, alpha: .1 });
        scene.circle(width * .82, height * .08, width * .2).fill({ color: 0x22c55e, alpha: .1 });
        for (let tier = 0; tier < 3; tier++) {
          const top = height * (.11 + tier * .07), bottom = top + height * .095;
          scene.rect(0, top, width, bottom - top).fill([0x07101b, 0x0a1420, 0x0c1822][tier]);
          const count = Math.max(20, Math.floor(width / 14));
          for (let index = 0; index < count; index++) { const x = (index + .35 + (tier % 2) * .4) * width / count, y = top + 10 + ((index * 17 + tier * 9) % Math.max(12, bottom - top - 18)); scene.circle(x, y, 2 + (index % 3 === 0 ? 1 : 0)).fill({ color: [0xfacc15, 0x4ade80, 0xe2e8f0, 0x38bdf8][(index + tier) % 4], alpha: .72 }); }
        }
        for (const x of [width * .07, width * .93]) { scene.rect(x - 4, 0, 8, height * .27).fill(0x26344a); scene.roundRect(x - 42, height * .015, 84, 28, 5).fill(0xd7f7ff); scene.circle(x, height * .03, 65).fill({ color: 0xd7f7ff, alpha: .08 }); }
        const horizon = height * .33;
        scene.moveTo(0, height).lineTo(width, height).lineTo(width * .78, horizon).lineTo(width * .22, horizon).closePath().fill(0x0d6a37);
        for (let stripe = 0; stripe < 9; stripe++) { const y1 = horizon + (height - horizon) * stripe / 9, y2 = horizon + (height - horizon) * (stripe + 1) / 9; scene.moveTo(center + (0 - center) * ((y1 - horizon) / (height - horizon)), y1).lineTo(center + (0 - center) * ((y2 - horizon) / (height - horizon)), y2).lineTo(center + (width - center) * ((y2 - horizon) / (height - horizon)), y2).lineTo(center + (width - center) * ((y1 - horizon) / (height - horizon)), y1).closePath().fill({ color: stripe % 2 ? 0x0b773b : 0x096331, alpha: .8 }); }
        const goalW = Math.min(width * .61, 650), goalH = Math.min(height * .31, 245), goalX = center - goalW / 2, goalY = height * .28;
        scene.rect(goalX, goalY, goalW, goalH).fill({ color: 0xd7f3ff, alpha: .035 });
        for (let line = 0; line <= 12; line++) { const x = goalX + goalW * line / 12; scene.moveTo(x, goalY).lineTo(x, goalY + goalH).stroke({ color: 0xcdefff, width: 1, alpha: .28 }); }
        for (let line = 0; line <= 7; line++) { const y = goalY + goalH * line / 7; scene.moveTo(goalX, y).lineTo(goalX + goalW, y).stroke({ color: 0xcdefff, width: 1, alpha: .28 }); }
        scene.moveTo(goalX, goalY + goalH).lineTo(goalX, goalY).lineTo(goalX + goalW, goalY).lineTo(goalX + goalW, goalY + goalH).stroke({ color: 0xffffff, width: Math.max(5, width / 180), alpha: 1 });
        scene.moveTo(center - width * .33, height).lineTo(center - goalW * .38, goalY + goalH).lineTo(center + goalW * .38, goalY + goalH).lineTo(center + width * .33, height).stroke({ color: 0xe8fff1, width: 2, alpha: .55 });
        scene.arc(center, height * .72, width * .11, Math.PI, Math.PI * 2).stroke({ color: 0xe8fff1, width: 2, alpha: .55 });

        const flight = flightRef.current;
        let ballX = center, ballY = height * .79, ballScale = clamp(width / 900, .72, 1.15), keeper = { x: center, y: goalY + goalH * .86, rotation: 0 }, flightT = 0;
        if (flight) {
          const duration = flight.resolution.shotType === "PANENKA" ? 1500 : flight.resolution.shotType === "POWER" ? 830 : 1100;
          flightT = clamp((now - flight.startedAt) / duration, 0, 1);
          const slow = flight.resolution.perfect && flightT > .62 ? .62 + (flightT - .62) * .56 : flightT;
          const eased = 1 - Math.pow(1 - slow, 3), targetX = center + clamp(flight.resolution.targetX / 3.9, -.48, .48) * goalW, targetY = goalY + goalH * (1 - clamp(flight.resolution.targetY / 2.8, .05, .92));
          const curve = flight.resolution.shotType === "CURVED" ? -Math.sign(flight.resolution.targetX || 1) * goalW * .12 * Math.sin(Math.PI * eased) : 0;
          ballX = center + (targetX - center) * eased + curve;
          ballY = height * .79 + (targetY - height * .79) * eased - Math.sin(Math.PI * eased) * (flight.resolution.shotType === "PANENKA" ? height * .17 : height * .055);
          ballScale *= 1 - eased * .43;
          const kt = clamp((eased - .18) / .58, 0, 1), keeperGoal = keeperTarget(flight.resolution.keeperZone, width, height);
          keeper = { x: center + (keeperGoal.x - center) * kt, y: goalY + goalH * .86 + (keeperGoal.y - (goalY + goalH * .86)) * kt, rotation: keeperGoal.rotation * kt };
          if (flight.resolution.turn !== lastResolutionTurn && flightT > .82) { lastResolutionTurn = flight.resolution.turn; if (flight.resolution.goal) for (let index = 0; index < Math.round(100 * quality.particleScale); index++) confetti.push({ x: center, y: goalY + goalH * .15, vx: (Math.random() - .5) * 500, vy: -120 - Math.random() * 260, color: [0x4ade80, 0xfacc15, 0x38bdf8, 0xf472b6][index % 4], life: 2 + Math.random(), size: 3 + Math.random() * 5 }); }
          if (flightT > .76 && flight.resolution.goal) { const ripple = (flightT - .76) * 60; fx.circle(targetX, targetY, ripple).stroke({ color: 0xd8fff0, width: 3, alpha: Math.max(0, .6 - flightT * .4) }); }
          if (flight.resolution.perfect && flightT > .55 && flightT < .86) fx.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: .04 });
        }
        drawPlayer(fx, keeper.x, keeper.y, clamp(width / 1000, .72, 1.05), 0xfacc15, keeper.rotation + Math.sin(now / 320) * .12, true);
        if (!flight || flightT < .18) drawPlayer(scene, center - width * .035, height * .9, clamp(width / 1050, .68, 1), 0x22c55e, .25, false);
        const aimNow = aimRef.current;
        if (propsRef.current.interactive && propsRef.current.role === "striker") {
          const tx = center + aimNow.directionX * goalW * .45, ty = goalY + goalH * (1 - aimNow.height * .8);
          scene.moveTo(center, height * .79).bezierCurveTo(center + aimNow.curve * width * .15, height * .63, tx - aimNow.curve * width * .08, ty + height * .08, tx, ty).stroke({ color: 0xa7f3d0, width: 2, alpha: aimNow.active ? .72 : .28 });
          scene.circle(tx, ty, 10 + aimNow.power * 10).stroke({ color: aimNow.power > .8 ? 0xfacc15 : 0x4ade80, width: 2, alpha: .82 });
        }
        scene.circle(ballX, ballY + 4 * ballScale, 16 * ballScale).fill({ color: 0x000000, alpha: .22 });
        scene.circle(ballX, ballY, 13 * ballScale).fill(0xf8fafc).stroke({ color: 0xcbd5e1, width: 1.5 });
        for (let patch = 0; patch < 5; patch++) { const angle = patch / 5 * Math.PI * 2 + now / 220; scene.circle(ballX + Math.cos(angle) * 6 * ballScale, ballY + Math.sin(angle) * 6 * ballScale, 2.6 * ballScale).fill(0x111827); }
        confetti.forEach((piece) => { piece.vy += 380 * dt; piece.x += piece.vx * dt; piece.y += piece.vy * dt; piece.life -= dt; fx.rect(piece.x, piece.y, piece.size, piece.size * 2).fill({ color: piece.color, alpha: clamp(piece.life, 0, 1) }); });
        for (let index = confetti.length - 1; index >= 0; index--) if (confetti[index].life <= 0) confetti.splice(index, 1);
        if (rain) drops.forEach((drop) => { drop.y = (drop.y + drop.speed * dt) % (height + 30); drop.x = (drop.x - drop.speed * dt * .12 + width) % width; fx.moveTo(drop.x, drop.y).lineTo(drop.x - 4, drop.y + 13).stroke({ color: 0xb6e6ff, width: 1, alpha: .22 }); });
        const flash = Math.sin(now / 183) > .994; if (flash) fx.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: .08 });
      });
    });
    return () => { disposed = true; if (app.renderer) app.destroy({ removeView: true }, { children: true }); };
  }, [rain]);

  const toAim = (gesture: Gesture): AimPreview => {
    const dx = gesture.x - gesture.startX, dy = gesture.y - gesture.startY, distance = Math.hypot(dx, dy);
    const midpoint = gesture.points[Math.floor(gesture.points.length / 2)] ?? { x: (gesture.startX + gesture.x) / 2, y: (gesture.startY + gesture.y) / 2 };
    const straightMidX = (gesture.startX + gesture.x) / 2;
    return { active: true, directionX: clamp(dx / 170, -1, 1), height: clamp(-dy / 200, .05, 1), power: clamp(distance / 235, .12, 1), curve: clamp((midpoint.x - straightMidX) / 70, -1, 1), timing };
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || role !== "striker") return;
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, startedAt: performance.now(), points: [{ x: event.clientX, y: event.clientY }] };
    event.currentTarget.setPointerCapture(event.pointerId); setAim({ ...idleAim, active: true, timing });
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current; if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.x = event.clientX; gesture.y = event.clientY; gesture.points.push({ x: event.clientX, y: event.clientY }); if (gesture.points.length > 18) gesture.points.shift(); setAim(toAim(gesture));
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current; if (!gesture || gesture.pointerId !== event.pointerId) return;
    const shot = toAim(gesture); gestureRef.current = null; setAim({ ...shot, active: false }); if (shot.power >= .2) onShot({ directionX: shot.directionX, height: shot.height, power: shot.power, curve: shot.curve, timing });
  };

  return (
    <div ref={hostRef} className="absolute inset-0 touch-none overflow-hidden" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      {interactive && role === "striker" && <div className="game-safe-bottom pointer-events-none absolute inset-x-3 z-10 mx-auto max-w-xl rounded-2xl border border-white/12 bg-black/72 p-3 backdrop-blur-xl sm:p-4"><div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.18em] text-emerald-200"><Crosshair className="h-4 w-4" /> Swipe up to kick</p><p className="mt-1 text-[7px] font-bold uppercase tracking-wider text-white/45">Aim with one finger · swipe farther for power</p></div><MoveUp className="h-6 w-6 animate-bounce text-white/70" /></div><div className="game-compact-stats mt-3 grid grid-cols-4 gap-2">{[{ l: "Direction", v: `${aim.directionX < -.08 ? "LEFT" : aim.directionX > .08 ? "RIGHT" : "CENTER"}` }, { l: "Power", v: `${Math.round(aim.power * 100)}%` }, { l: "Height", v: `${Math.round(aim.height * 100)}%` }, { l: "Curve", v: `${aim.curve > .08 ? "+" : ""}${Math.round(aim.curve * 100)}` }].map((item) => <div key={item.l} className="rounded-lg bg-white/[.05] px-2 py-1.5 text-center"><p className="text-[6px] font-black uppercase text-white/30">{item.l}</p><p className="mt-1 text-[8px] font-black text-white">{item.v}</p></div>)}</div><div className="mt-3 flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-amber-300" /><div className="relative h-2 flex-1 rounded-full bg-white/10"><span className="absolute left-1/2 top-1/2 h-4 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300/22" /><span className="absolute top-1/2 h-4 w-2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_white]" style={{ left: `${timing * 100}%` }} /></div><span className="text-[7px] font-black uppercase text-white/45">Timing</span></div></div>}
      {interactive && role === "keeper" && <div className="absolute inset-0 z-20">{keeperZones.map(({ zone, label, position, symbol }) => <button key={zone} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSave(zone)} aria-label={label} className={`absolute ${position} grid h-16 w-16 place-items-center rounded-full border border-amber-100/35 bg-black/38 text-xl font-black text-white/90 shadow-[0_0_24px_rgba(250,204,21,.12)] backdrop-blur-sm transition hover:scale-110 hover:border-amber-200 hover:bg-amber-300/25 sm:h-20 sm:w-20`}><span>{symbol}<small className="mt-1 block text-[6px] uppercase tracking-wider">{label}</small></span></button>)}</div>}
      {interactive && role === "keeper" && <div className="game-safe-bottom pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-200/20 bg-black/68 px-5 py-2 text-[8px] font-black uppercase tracking-[.2em] text-amber-100 backdrop-blur"><Sparkles className="mr-2 inline h-3.5 w-3.5" /> Tap a dive zone</div>}
    </div>
  );
}
