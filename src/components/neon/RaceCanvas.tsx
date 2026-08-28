"use client";

import { useEffect, useRef, useState } from "react";
import { Application, Graphics } from "pixi.js";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Flame, Gauge, Pause, Play, RotateCcw } from "lucide-react";
import { TRACK_LENGTH, formatRaceTime, vehicleById } from "@/lib/neon/constants";
import { PSEUDO3D_VIEW_DISTANCE, projectRoadPoint, trackCenterAt } from "@/lib/neon/pseudo3d";
import { getGameRenderQuality } from "@/lib/gamePerformance";

export type RaceTelemetry = { x: number; z: number; speed: number; heading: number; checkpoint: number; nitro: number; drifting: boolean };
export type RaceStats = { finishTimeMs: number; perfectDrifts: number; nearMisses: number; topSpeedKmh: number; driftScore: number };

type Props = {
  active: boolean;
  startAt: number;
  vehicleId: string;
  opponentName: string;
  opponentState: RaceTelemetry | null;
  entryCredits: number;
  possibleReward: number;
  difficulty: string;
  level: number;
  muted: boolean;
  onTelemetry: (telemetry: RaceTelemetry) => void;
  onFinish: (stats: RaceStats) => void;
};

type Hud = {
  speed: number;
  progress: number;
  rivalProgress: number;
  nitro: number;
  elapsed: number;
  position: number;
  gap: number;
  driftCombo: number;
  driftScore: number;
  event: string;
  countdown: string;
  district: string;
  boosting: boolean;
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; size: number; color: number; drag: number };
type Traffic = { lane: number; z: number; color: number; hit: boolean; near: boolean; speed: number; style: number };
type RoadFeature = { lane: number; z: number; kind: "boost" | "barrier" | "shortcut"; used: boolean };
type AudioRig = {
  context: AudioContext;
  engine: OscillatorNode;
  engineBass: OscillatorNode;
  engineGain: GainNode;
  bassGain: GainNode;
  filter: BiquadFilterNode;
  wind: AudioBufferSourceNode;
  windGain: GainNode;
  master: GainNode;
};

const initialHud: Hud = {
  speed: 226,
  progress: 0,
  rivalProgress: 0,
  nitro: 54,
  elapsed: 0,
  position: 1,
  gap: 0,
  driftCombo: 0,
  driftScore: 0,
  event: "",
  countdown: "",
  district: "MIDNIGHT GRID",
  boosting: false,
};

const ROAD_STEP = 8;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const modulo = (value: number, modulus: number) => ((value % modulus) + modulus) % modulus;

function polygon(graphics: Graphics, points: Array<{ x: number; y: number }>, color: number, alpha = 1) {
  if (!points.length) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) graphics.lineTo(points[index].x, points[index].y);
  graphics.closePath().fill({ color, alpha });
}

function lateral(point: ReturnType<typeof projectRoadPoint>, amount: number) {
  return point.center + point.halfWidth * amount;
}

function carPoint(x: number, y: number, scale: number, yaw: number, px: number, py: number) {
  return { x: x + px * scale + yaw * (py + 42) * scale, y: y + py * scale };
}

function drawRearCar(
  graphics: Graphics,
  x: number,
  y: number,
  scale: number,
  yaw: number,
  color: number,
  accent: number,
  boosting: boolean,
  braking = false,
  rival = false,
) {
  const p = (px: number, py: number) => carPoint(x, y, scale, yaw, px, py);
  graphics.ellipse(x + yaw * 8 * scale, y + 31 * scale, 58 * scale, 15 * scale).fill({ color: 0x00030a, alpha: .65 });
  graphics.ellipse(x, y + 28 * scale, 45 * scale, 11 * scale).fill({ color: accent, alpha: rival ? .12 : .2 });

  if (boosting) {
    for (const side of [-1, 1]) {
      polygon(graphics, [p(side * 15, 28), p(side * 5, 28), p(side * 10, 96 + Math.random() * 22)], 0x087dff, .34);
      polygon(graphics, [p(side * 13, 29), p(side * 7, 29), p(side * 10, 77 + Math.random() * 18)], 0x16d9ff, .92);
      polygon(graphics, [p(side * 11, 30), p(side * 8, 30), p(side * 10, 59 + Math.random() * 12)], 0xffffff, .95);
    }
  }

  for (const side of [-1, 1]) {
    polygon(graphics, [p(side * 46, 3), p(side * 53, 7), p(side * 52, 35), p(side * 41, 36)], 0x010205);
    graphics.roundRect(p(side * 49, 18).x - 3 * scale, p(side * 49, 18).y - 8 * scale, 6 * scale, 17 * scale, 2 * scale).fill(0x111827);
  }

  polygon(graphics, [p(-45, 29), p(-48, 1), p(-34, -42), p(-20, -55), p(20, -55), p(34, -42), p(48, 1), p(45, 29)], accent, rival ? .36 : .5);
  polygon(graphics, [p(-40, 28), p(-43, 2), p(-31, -39), p(-18, -50), p(18, -50), p(31, -39), p(43, 2), p(40, 28)], color);
  polygon(graphics, [p(-29, -38), p(-18, -48), p(18, -48), p(29, -38), p(23, -14), p(-23, -14)], rival ? 0x160b2b : 0x061522, .96);
  polygon(graphics, [p(-24, -35), p(-15, -44), p(15, -44), p(24, -35), p(20, -20), p(-20, -20)], 0x9eeeff, .18);
  polygon(graphics, [p(-37, -7), p(-24, -16), p(24, -16), p(37, -7), p(34, 14), p(-34, 14)], accent, .22);

  graphics.moveTo(p(-38, -4).x, p(-38, -4).y).lineTo(p(38, -4).x, p(38, -4).y).stroke({ color: 0xe0f9ff, width: Math.max(1, 1.5 * scale), alpha: .26 });
  graphics.moveTo(p(0, -48).x, p(0, -48).y).lineTo(p(0, 23).x, p(0, 23).y).stroke({ color: accent, width: Math.max(1.5, 2.2 * scale), alpha: .85 });

  for (const side of [-1, 1]) {
    const light = p(side * 27, 10);
    graphics.roundRect(light.x - 10 * scale, light.y - 5 * scale, 20 * scale, 10 * scale, 3 * scale).fill({ color: braking ? 0xffffff : 0xff174f, alpha: .98 });
    graphics.roundRect(light.x - 14 * scale, light.y - 8 * scale, 28 * scale, 16 * scale, 5 * scale).fill({ color: 0xff174f, alpha: braking ? .28 : .14 });
  }

  polygon(graphics, [p(-43, -1), p(-60, -5), p(-60, 1), p(-30, 5), p(30, 5), p(60, 1), p(60, -5), p(43, -1)], rival ? 0x170d28 : 0x050b12);
  graphics.roundRect(p(-27, 24).x, p(-27, 24).y, 54 * scale, 5 * scale, 2 * scale).fill({ color: 0xd7fbff, alpha: .22 });
  graphics.roundRect(p(-12, 18).x, p(-12, 18).y, 24 * scale, 7 * scale, 2 * scale).fill({ color: 0x02050a, alpha: .85 });
}

function drawTrafficCar(graphics: Graphics, x: number, y: number, scale: number, color: number, style: number) {
  const wide = style % 4 === 0 ? 1.12 : .94;
  graphics.ellipse(x, y + 18 * scale, 42 * scale * wide, 10 * scale).fill({ color: 0x000000, alpha: .48 });
  polygon(graphics, [
    { x: x - 37 * scale * wide, y: y + 21 * scale },
    { x: x - 34 * scale * wide, y: y - 13 * scale },
    { x: x - 20 * scale * wide, y: y - 37 * scale },
    { x: x + 20 * scale * wide, y: y - 37 * scale },
    { x: x + 34 * scale * wide, y: y - 13 * scale },
    { x: x + 37 * scale * wide, y: y + 21 * scale },
  ], color);
  polygon(graphics, [
    { x: x - 20 * scale * wide, y: y - 31 * scale },
    { x: x + 20 * scale * wide, y: y - 31 * scale },
    { x: x + 25 * scale * wide, y: y - 11 * scale },
    { x: x - 25 * scale * wide, y: y - 11 * scale },
  ], 0x071522, .96);
  graphics.roundRect(x - 31 * scale * wide, y + 5 * scale, 18 * scale, 8 * scale, 2 * scale).fill(0xff244f);
  graphics.roundRect(x + 13 * scale * wide, y + 5 * scale, 18 * scale, 8 * scale, 2 * scale).fill(0xff244f);
  graphics.rect(x - 26 * scale, y + 16 * scale, 52 * scale, 3 * scale).fill({ color: 0xffffff, alpha: .16 });
}

function drawCityLayer(graphics: Graphics, width: number, horizon: number, distance: number, layer: number, curve: number) {
  const spacing = 54 + layer * 34;
  const count = Math.ceil(width / spacing) + 6;
  const span = spacing * count;
  const speed = [.08, .18, .34][layer];
  const shift = distance * speed + curve * width * (.1 + layer * .08);
  const colors = [0x07152b, 0x08182e, 0x0b172b];
  const windowColors = [0x22d3ee, 0xa855f7, 0xf472b6];
  const base = horizon + 16 + layer * 18;

  for (let index = -2; index < count + 2; index += 1) {
    const seed = index + layer * 29;
    const x = modulo(index * spacing - shift, span) - spacing * 2;
    const buildingWidth = spacing * (.62 + (seed % 4) * .08);
    const buildingHeight = 42 + layer * 32 + modulo(seed * 37, 94);
    graphics.rect(x, base - buildingHeight, buildingWidth, buildingHeight).fill({ color: colors[layer], alpha: .96 });
    graphics.rect(x + 3, base - buildingHeight + 3, 2, buildingHeight - 6).fill({ color: windowColors[modulo(seed + layer, 3)], alpha: .32 });
    const windowRows = Math.max(1, Math.floor(buildingHeight / 22));
    for (let row = 0; row < windowRows; row += 1) {
      const lit = (seed + row * 3) % 4 !== 0;
      if (!lit) continue;
      graphics.rect(x + 12 + (row % 2) * 10, base - buildingHeight + 12 + row * 20, Math.max(5, buildingWidth - 27), 2).fill({ color: windowColors[modulo(seed + row, 3)], alpha: .22 + layer * .05 });
    }
    if (seed % 5 === 0) graphics.rect(x + buildingWidth * .48, base - buildingHeight - 18, 2, 18).fill({ color: windowColors[modulo(seed + 1, 3)], alpha: .75 });
  }
}

function drawBoostPad(graphics: Graphics, point: ReturnType<typeof projectRoadPoint>, lane: number) {
  const x = lateral(point, lane * .66);
  const width = point.halfWidth * .16;
  const length = 48 * point.scale;
  polygon(graphics, [
    { x: x - width, y: point.y },
    { x: x - width * .52, y: point.y - length },
    { x: x + width * .52, y: point.y - length },
    { x: x + width, y: point.y },
  ], 0x08c7e8, .62);
  for (let chevron = 0; chevron < 3; chevron += 1) {
    const y = point.y - length * (.2 + chevron * .25);
    graphics.moveTo(x - width * .52, y).lineTo(x, y - 7 * point.scale).lineTo(x + width * .52, y).stroke({ color: 0xffffff, width: Math.max(1, 3 * point.scale), alpha: .92 });
  }
}

function TouchButton({ children, control, controlRef, className = "" }: { children: React.ReactNode; control: string; controlRef: React.MutableRefObject<Record<string, boolean>>; className?: string }) {
  const set = (value: boolean) => { controlRef.current[control] = value; };
  return <button type="button" className={`race-touch-button ${className}`} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); set(true); }} onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onPointerLeave={() => set(false)} onContextMenu={(event) => event.preventDefault()} aria-label={control}>{children}</button>;
}

function createAudioRig(): AudioRig | null {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  const master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
  const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.Q.value = 3.2;
  const engineGain = context.createGain(); engineGain.gain.value = 0;
  const bassGain = context.createGain(); bassGain.gain.value = 0;
  const engine = context.createOscillator(); engine.type = "sawtooth";
  const engineBass = context.createOscillator(); engineBass.type = "triangle";
  engine.connect(filter).connect(engineGain).connect(master);
  engineBass.connect(bassGain).connect(master);
  engine.start(); engineBass.start();

  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  const wind = context.createBufferSource(); wind.buffer = buffer; wind.loop = true;
  const windFilter = context.createBiquadFilter(); windFilter.type = "highpass"; windFilter.frequency.value = 720;
  const windGain = context.createGain(); windGain.gain.value = 0;
  wind.connect(windFilter).connect(windGain).connect(master); wind.start();
  return { context, engine, engineBass, engineGain, bassGain, filter, wind, windGain, master };
}

export default function RaceCanvas({ active, startAt, vehicleId, opponentName, opponentState, entryCredits, possibleReward, difficulty, level, muted, onTelemetry, onFinish }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef<Record<string, boolean>>({});
  const opponentRef = useRef(opponentState);
  const callbacksRef = useRef({ onTelemetry, onFinish });
  const activeRef = useRef(active);
  const startRef = useRef(startAt);
  const pausedRef = useRef(false);
  const mutedRef = useRef(muted);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState(initialHud);

  useEffect(() => { opponentRef.current = opponentState; }, [opponentState]);
  useEffect(() => { callbacksRef.current = { onTelemetry, onFinish }; }, [onTelemetry, onFinish]);
  useEffect(() => { activeRef.current = active; startRef.current = startAt; }, [active, startAt]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const quality = getGameRenderQuality();
    const app = new Application();
    const background = new Graphics();
    const road = new Graphics();
    const props = new Graphics();
    const vehicles = new Graphics();
    const effects = new Graphics();
    const foreground = new Graphics();
    const particles: Particle[] = [];
    const rain = Array.from({ length: Math.round(190 * quality.particleScale) }, (_, index) => ({ x: (index * 97) % 1700, y: (index * 53) % 1050, speed: 720 + (index % 11) * 54, length: 12 + index % 23 }));
    const traffic: Traffic[] = Array.from({ length: 24 }, (_, index) => ({
      lane: [-.74, -.25, .25, .74][index % 4],
      z: 150 + index * 162 + (index % 3) * 27,
      color: [0xff276f, 0xf5b82e, 0x8b5cf6, 0x1dd7e8, 0xe5edf7][index % 5],
      hit: false,
      near: false,
      speed: 12 + (index % 4) * 2.2,
      style: index,
    }));
    const features: RoadFeature[] = [
      { kind: "boost", lane: -.25, z: 390, used: false },
      { kind: "barrier", lane: .72, z: 710, used: false },
      { kind: "boost", lane: .24, z: 1210, used: false },
      { kind: "barrier", lane: -.25, z: 1660, used: false },
      { kind: "shortcut", lane: -.82, z: 2160, used: false },
      { kind: "barrier", lane: .27, z: 2710, used: false },
      { kind: "boost", lane: -.24, z: 3140, used: false },
      { kind: "barrier", lane: -.72, z: 3540, used: false },
      { kind: "boost", lane: .25, z: 3880, used: false },
    ];
    const vehicle = vehicleById(vehicleId);
    const carColor = Number.parseInt(vehicle.color.slice(1), 16);
    const accentColor = Number.parseInt(vehicle.accent.slice(1), 16);
    let audioRig: AudioRig | null = null;

    let distance = 0;
    let lane = 0;
    let cameraLane = 0;
    let speed = 63;
    let steer = 0;
    let nitro = 54;
    let cameraPull = 0;
    let driftCombo = 0;
    let driftScore = 0;
    let driftDistance = 0;
    let perfectDrifts = 0;
    let nearMisses = 0;
    let topSpeed = 0;
    let checkpoint = 0;
    let finished = false;
    let lastTelemetry = 0;
    let lastHud = 0;
    let eventText = "";
    let eventUntil = 0;
    let shake = 0;
    let pausedAt = 0;
    let pausedDuration = 0;
    let lastPosition = 1;
    let finalAnnounced = false;
    let nitroReadyAnnounced = false;
    let boostFlash = 0;

    const unlockAudio = () => {
      if (!audioRig) audioRig = createAudioRig();
      if (audioRig?.context.state === "suspended") void audioRig.context.resume();
    };
    const keyDown = (event: KeyboardEvent) => {
      keyboardRef.current[event.code] = true;
      unlockAudio();
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
      if (event.code === "Escape" && activeRef.current) setPaused((value) => !value);
    };
    const keyUp = (event: KeyboardEvent) => { keyboardRef.current[event.code] = false; };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    host.addEventListener("pointerdown", unlockAudio);

    void app.init({ resizeTo: host, antialias: quality.antialias, autoDensity: true, resolution: quality.resolution, preference: "webgl", backgroundAlpha: 0, powerPreference: "high-performance" }).then(() => {
      if (disposed) { app.destroy({ removeView: true }, { children: true }); return; }
      host.appendChild(app.canvas);
      app.canvas.setAttribute("aria-label", "Neon Drift premium pseudo-3D rear-camera arcade race");
      Object.assign(app.canvas.style, { width: "100%", height: "100%", touchAction: "none" });
      app.stage.addChild(background, road, props, vehicles, effects, foreground);
      let lastFrame = performance.now();

      app.ticker.add(() => {
        if (disposed) return;
        const nowPerf = performance.now();
        const dt = Math.min(.034, Math.max(.001, (nowPerf - lastFrame) / 1000));
        lastFrame = nowPerf;
        const now = Date.now();
        if (pausedRef.current) { if (!pausedAt) pausedAt = now; }
        else if (pausedAt) { pausedDuration += now - pausedAt; pausedAt = 0; }
        const adjustedStart = startRef.current + pausedDuration;
        const racing = activeRef.current && now >= adjustedStart && !finished && !pausedRef.current;
        const keys = keyboardRef.current;
        const touch = touchRef.current;
        const accelerating = racing && (keys.KeyW || keys.ArrowUp || touch.accelerate);
        const braking = racing && (keys.KeyS || keys.ArrowDown || touch.brake);
        const left = racing && (keys.KeyA || keys.ArrowLeft || touch.left);
        const right = racing && (keys.KeyD || keys.ArrowRight || touch.right);
        const steerTarget = (left ? -1 : 0) + (right ? 1 : 0);
        steer += (steerTarget - steer) * Math.min(1, dt * 8.5);
        const drifting = racing && (keys.Space || touch.drift) && speed > 60 && Math.abs(steer) > .16;
        const boosting = racing && (keys.ShiftLeft || keys.ShiftRight || touch.nitro) && nitro > 1 && speed > 52;
        cameraPull += ((boosting ? 1 : 0) - cameraPull) * Math.min(1, dt * (boosting ? 8.5 : 4.5));

        if (racing) {
          const targetSpeed = braking ? 36 : boosting ? 94 : 83;
          const response = braking ? 4.2 : boosting ? 8.8 : accelerating ? 3 : 1.85;
          speed += (targetSpeed - speed) * Math.min(1, dt * response);
          if (boosting && speed < 82) speed += 13 * dt;
          lane = clamp(lane + steer * dt * (drifting ? 1.48 : .93) * (.65 + speed / 92), -1.05, 1.05);
          distance += speed * dt * (boosting ? 1.045 : 1);
          nitro = clamp(nitro + (boosting ? -26 : drifting ? 14 : .8) * dt, 0, 100);
          boostFlash = boosting ? Math.min(1, boostFlash + dt * 6) : Math.max(0, boostFlash - dt * 3.5);

          if (boosting) {
            shake = Math.max(shake, 8 + speed / 18);
            for (let count = 0; count < 5; count += 1) particles.push({ x: 0, y: 0, vx: (Math.random() - .5) * 90, vy: 155 + Math.random() * 170, life: .55, size: 5 + Math.random() * 9, color: count % 2 ? 0x20ddff : 0xa855f7, drag: .96 });
          }

          if (drifting) {
            driftDistance += speed * dt;
            driftScore += Math.round(speed * Math.abs(steer) * dt * 6.2);
            driftCombo = Math.min(9, Math.max(1, Math.floor(driftDistance / 22) + 1));
            for (let count = 0; count < 5; count += 1) particles.push({ x: 0, y: -1, vx: (Math.random() - .5) * 150 - steer * 55, vy: 38 + Math.random() * 75, life: .82, size: 9 + Math.random() * 17, color: 0xc8ecf4, drag: .982 });
            if (driftDistance > (perfectDrifts + 1) * 72) {
              perfectDrifts += 1;
              driftScore += 400;
              eventText = "PERFECT DRIFT  +400";
              eventUntil = now + 1350;
            }
          } else if (Math.abs(steer) < .08) {
            driftDistance = 0;
            driftCombo = 0;
          }

          if (Math.abs(lane) > .99) {
            speed += (56 - speed) * Math.min(1, dt * 2.5);
            shake = Math.max(shake, 9);
            if (now > eventUntil) { eventText = "BARRIER SPARKS"; eventUntil = now + 650; }
            for (let count = 0; count < 5; count += 1) particles.push({ x: Math.sign(lane) * 120, y: -20, vx: -Math.sign(lane) * (90 + Math.random() * 170), vy: (Math.random() - .5) * 120, life: .5, size: 2 + Math.random() * 5, color: count % 2 ? 0xffc857 : 0xff5b24, drag: .97 });
          }

          for (const car of traffic) {
            car.z += car.speed * dt;
            const relative = car.z - distance;
            const laneGap = Math.abs(car.lane - lane);
            if (!car.hit && Math.abs(relative) < 5 && laneGap < .2) {
              car.hit = true;
              speed *= .63;
              shake = 26;
              eventText = "HEAVY IMPACT";
              eventUntil = now + 950;
              for (let count = 0; count < 30; count += 1) particles.push({ x: 0, y: -45, vx: (Math.random() - .5) * 320, vy: (Math.random() - .5) * 220, life: .68, size: 2 + Math.random() * 7, color: count % 2 ? 0xff7a18 : 0xffe08a, drag: .965 });
            } else if (!car.near && relative < -2 && relative > -15 && laneGap >= .2 && laneGap < .39) {
              car.near = true;
              nearMisses += 1;
              nitro = clamp(nitro + 13, 0, 100);
              driftScore += 200;
              eventText = "NEAR MISS  +200";
              eventUntil = now + 1200;
            }
          }

          for (const feature of features) {
            if (feature.used || Math.abs(feature.z - distance) > 6 || Math.abs(feature.lane - lane) > (feature.kind === "shortcut" ? .3 : .23)) continue;
            feature.used = true;
            if (feature.kind === "boost") {
              speed = Math.max(speed, 89);
              nitro = clamp(nitro + 26, 0, 100);
              boostFlash = 1;
              shake = 16;
              eventText = "BOOST PAD  +NITRO";
              eventUntil = now + 1200;
            } else if (feature.kind === "shortcut") {
              distance += 110;
              nitro = clamp(nitro + 20, 0, 100);
              eventText = "SHORTCUT!  +110m";
              eventUntil = now + 1400;
            } else {
              speed *= .56;
              shake = 28;
              eventText = "ROADBLOCK HIT";
              eventUntil = now + 950;
            }
          }

          if (distance > 2120 && distance < 2460 && lane < -.74) distance += speed * dt * .18;
          checkpoint = Math.min(7, Math.floor(distance / (TRACK_LENGTH / 7)));
          topSpeed = Math.max(topSpeed, speed * 3.6);
          const rivalZ = opponentRef.current?.z ?? distance - 4;
          const position = rivalZ > distance ? 2 : 1;
          if (position !== lastPosition) {
            eventText = position === 1 ? "OVERTAKE!" : `${opponentName} OVERTAKES!`;
            eventUntil = now + 1300;
            lastPosition = position;
          }
          if (nitro >= 99 && !nitroReadyAnnounced) {
            eventText = "NITRO READY!";
            eventUntil = now + 1250;
            nitroReadyAnnounced = true;
          }
          if (nitro < 70) nitroReadyAnnounced = false;
          if (distance / TRACK_LENGTH > .82 && !finalAnnounced) {
            finalAnnounced = true;
            eventText = "FINAL STRETCH!";
            eventUntil = now + 1600;
          }
          if (distance >= TRACK_LENGTH && !finished) {
            finished = true;
            distance = TRACK_LENGTH;
            callbacksRef.current.onFinish({ finishTimeMs: Math.max(0, now - adjustedStart), perfectDrifts, nearMisses, topSpeedKmh: Math.round(topSpeed), driftScore });
          }
        }

        cameraLane += (lane - cameraLane) * Math.min(1, dt * (boosting ? 4.2 : 2.8));
        const width = app.screen.width;
        const height = app.screen.height;
        const compactLandscape = height < 520;
        const speedRatio = clamp(speed / 94, 0, 1);
        const vibration = racing && speed > 67 ? (speed - 67) / 27 * (boosting ? 6.2 : 1.8) : 0;
        const cameraX = (Math.random() - .5) * (shake + vibration);
        const cameraY = (Math.random() - .5) * (shake * .42 + vibration);
        shake *= .86;
        background.position.set(cameraX * .08, cameraY * .08);
        road.position.set(cameraX, cameraY);
        props.position.set(cameraX, cameraY);
        vehicles.position.set(cameraX, cameraY);
        effects.position.set(cameraX * .55, cameraY * .45);
        foreground.position.set(cameraX * .2, cameraY * .2);
        background.clear(); road.clear(); props.clear(); vehicles.clear(); effects.clear(); foreground.clear();

        const inTunnel = distance > 1010 && distance < 1510;
        const onBridge = distance > 2740 && distance < 3190;
        const inFinal = distance > 3440;
        const horizon = height * (compactLandscape ? .245 : .255) - height * cameraPull * .022;
        background.rect(-40, -30, width + 80, height + 60).fill(inTunnel ? 0x010207 : inFinal ? 0x12051c : 0x030712);
        background.rect(-20, 0, width + 40, horizon + 55).fill(inTunnel ? 0x02030a : onBridge ? 0x071d34 : 0x071329);
        background.circle(width * .76, horizon * .34, Math.min(width, height) * .105).fill({ color: inFinal ? 0xff3d9a : 0x9edfff, alpha: inTunnel ? .02 : .13 });
        background.circle(width * .76, horizon * .34, Math.min(width, height) * .074).fill({ color: inFinal ? 0xff70bd : 0xc8efff, alpha: inTunnel ? .02 : .16 });
        const curveNow = trackCenterAt(distance);
        if (!inTunnel) {
          drawCityLayer(background, width, horizon, distance, 0, curveNow);
          drawCityLayer(background, width, horizon, distance, 1, curveNow);
          drawCityLayer(background, width, horizon, distance, 2, curveNow);
        }
        if (onBridge) {
          background.rect(0, horizon + 34, width, height - horizon).fill({ color: 0x06203a, alpha: .68 });
          for (let glow = 0; glow < 9; glow += 1) background.rect(0, horizon + 45 + glow * 27, width, 2).fill({ color: glow % 2 ? 0x22d3ee : 0x8b5cf6, alpha: .08 });
        }
        background.rect(0, horizon - 8, width, 54).fill({ color: inFinal ? 0xff2d8d : 0x22d3ee, alpha: inTunnel ? .01 : .035 });

        const samples = [] as Array<ReturnType<typeof projectRoadPoint> & { z: number; relative: number }>;
        for (let relative = 8; relative <= PSEUDO3D_VIEW_DISTANCE + ROAD_STEP; relative += ROAD_STEP) {
          samples.push({ ...projectRoadPoint(width, height, relative, distance, cameraLane, cameraPull), z: distance + relative, relative });
        }

        for (let index = samples.length - 2; index >= 0; index -= 1) {
          const near = samples[index];
          const far = samples[index + 1];
          const alternating = Math.floor(near.z / 16) % 2 === 0;
          const roadColor = inTunnel ? (alternating ? 0x080b13 : 0x0a0d17) : alternating ? 0x101823 : 0x0c131e;
          const shoulderColor = alternating ? (inFinal ? 0xff287f : 0x13bed8) : 0x7138d4;

          polygon(road, [
            { x: lateral(far, -1.13), y: far.y }, { x: lateral(far, 1.13), y: far.y },
            { x: lateral(near, 1.13), y: near.y }, { x: lateral(near, -1.13), y: near.y },
          ], inTunnel ? 0x03050a : onBridge ? 0x07111b : 0x050a12);
          polygon(road, [
            { x: lateral(far, -1), y: far.y }, { x: lateral(far, 1), y: far.y },
            { x: lateral(near, 1), y: near.y }, { x: lateral(near, -1), y: near.y },
          ], roadColor);
          polygon(road, [
            { x: lateral(far, -1.055), y: far.y }, { x: lateral(far, -1), y: far.y },
            { x: lateral(near, -1), y: near.y }, { x: lateral(near, -1.055), y: near.y },
          ], shoulderColor, .9);
          polygon(road, [
            { x: lateral(far, 1), y: far.y }, { x: lateral(far, 1.055), y: far.y },
            { x: lateral(near, 1.055), y: near.y }, { x: lateral(near, 1), y: near.y },
          ], shoulderColor, .9);

          if (Math.floor(near.z / 13) % 2 === 0) {
            for (const marker of [-.5, 0, .5]) {
              const markerWidth = .011 + near.depth * .003;
              polygon(road, [
                { x: lateral(far, marker - markerWidth), y: far.y }, { x: lateral(far, marker + markerWidth), y: far.y },
                { x: lateral(near, marker + markerWidth), y: near.y }, { x: lateral(near, marker - markerWidth), y: near.y },
              ], 0xe7fbff, .8);
              if (near.depth > .38) polygon(road, [
                { x: lateral(far, marker - markerWidth * .55), y: far.y }, { x: lateral(far, marker + markerWidth * .55), y: far.y },
                { x: lateral(near, marker + markerWidth * .8), y: near.y + 13 * near.scale }, { x: lateral(near, marker - markerWidth * .8), y: near.y + 13 * near.scale },
              ], 0x9defff, .09);
            }
          }

          if (near.depth > .25 && index % 3 === 0) {
            road.moveTo(lateral(near, -.92), near.y).lineTo(lateral(near, .92), near.y).stroke({ color: 0x8bdcff, width: Math.max(1, near.scale * 1.7), alpha: .045 });
          }

          if (near.z > 2110 && near.z < 2470) {
            const branchFarCenter = lateral(far, -1.32);
            const branchNearCenter = lateral(near, -1.32);
            polygon(road, [
              { x: branchFarCenter - far.halfWidth * .2, y: far.y }, { x: branchFarCenter + far.halfWidth * .2, y: far.y },
              { x: branchNearCenter + near.halfWidth * .2, y: near.y }, { x: branchNearCenter - near.halfWidth * .2, y: near.y },
            ], 0x071a25, .95);
            road.moveTo(branchFarCenter, far.y).lineTo(branchNearCenter, near.y).stroke({ color: 0x22d3ee, width: Math.max(1, near.scale * 3), alpha: .72 });
          }
        }

        const propStart = Math.floor(distance / 28) * 28;
        for (let propIndex = 30; propIndex >= 0; propIndex -= 1) {
          const worldZ = propStart + propIndex * 28;
          const relative = worldZ - distance;
          if (relative < 16 || relative > PSEUDO3D_VIEW_DISTANCE - 12) continue;
          const point = projectRoadPoint(width, height, relative, distance, cameraLane, cameraPull);
          const scale = point.scale;
          for (const side of [-1, 1]) {
            const baseX = lateral(point, side * (1.13 + (propIndex % 6 === 0 ? .12 : 0)));
            const lightColor = side < 0 ? 0x24e5ff : 0xff42b6;
            if (propIndex % 6 === 0) {
              const billboardWidth = 86 * scale;
              const billboardHeight = 35 * scale;
              const poleHeight = 38 + 115 * scale;
              props.moveTo(baseX, point.y).lineTo(baseX, point.y - poleHeight).stroke({ color: 0x6a7890, width: Math.max(1, 5 * scale), alpha: .85 });
              props.roundRect(baseX - billboardWidth / 2, point.y - poleHeight - billboardHeight, billboardWidth, billboardHeight, 5 * scale).fill({ color: side < 0 ? 0x063246 : 0x3a0b45, alpha: .95 }).stroke({ color: lightColor, width: Math.max(1, 3 * scale) });
              props.rect(baseX - billboardWidth * .32, point.y - poleHeight - billboardHeight * .6, billboardWidth * .64, Math.max(1, 4 * scale)).fill({ color: 0xffffff, alpha: .75 });
              props.rect(baseX - billboardWidth * .22, point.y - poleHeight - billboardHeight * .34, billboardWidth * .44, Math.max(1, 3 * scale)).fill({ color: lightColor, alpha: .7 });
            } else {
              const poleHeight = 30 + 128 * scale;
              props.moveTo(baseX, point.y).lineTo(baseX, point.y - poleHeight).stroke({ color: 0x65748c, width: Math.max(1, 4 * scale), alpha: .84 });
              props.circle(baseX, point.y - poleHeight, 4 + 8 * scale).fill({ color: lightColor, alpha: .95 });
              props.circle(baseX, point.y - poleHeight, 13 + 23 * scale).fill({ color: lightColor, alpha: .12 });
              if (scale > .35) polygon(props, [
                { x: baseX - 4 * scale, y: point.y }, { x: baseX + 4 * scale, y: point.y },
                { x: baseX + 15 * scale, y: point.y + 85 * scale }, { x: baseX - 15 * scale, y: point.y + 85 * scale },
              ], lightColor, .045);
            }

            if (propIndex % 5 === 2 && !inTunnel) {
              const towerX = lateral(point, side * 1.43);
              const towerHeight = 45 + 190 * scale;
              const towerWidth = 18 + 72 * scale;
              props.rect(towerX - towerWidth / 2, point.y - towerHeight, towerWidth, towerHeight).fill({ color: 0x071322, alpha: .96 });
              props.rect(towerX - towerWidth * .34, point.y - towerHeight + 8 * scale, towerWidth * .68, 3 * scale).fill({ color: lightColor, alpha: .5 });
              props.rect(towerX + side * towerWidth * .2, point.y - towerHeight, 2 * scale, towerHeight).fill({ color: lightColor, alpha: .28 });
            }
          }
        }

        if (inTunnel || (distance < 1010 && distance + PSEUDO3D_VIEW_DISTANCE > 1010)) {
          for (let arch = 14; arch >= 0; arch -= 1) {
            const worldZ = Math.max(1010, Math.floor(distance / 42) * 42 + arch * 42);
            if (worldZ > 1510) continue;
            const relative = worldZ - distance;
            if (relative < 12 || relative > PSEUDO3D_VIEW_DISTANCE) continue;
            const point = projectRoadPoint(width, height, relative, distance, cameraLane, cameraPull);
            const top = point.y - 42 - 205 * point.scale;
            props.moveTo(lateral(point, -1.1), point.y).lineTo(lateral(point, -1.1), top).lineTo(lateral(point, 1.1), top).lineTo(lateral(point, 1.1), point.y).stroke({ color: arch % 2 ? 0x22d3ee : 0xa855f7, width: Math.max(1, 9 * point.scale), alpha: .55 });
          }
        }

        for (const feature of features) {
          const relative = feature.z - distance;
          if (relative < 10 || relative > PSEUDO3D_VIEW_DISTANCE - 15) continue;
          const point = projectRoadPoint(width, height, relative, distance, cameraLane, cameraPull);
          const x = lateral(point, feature.lane * .66);
          if (feature.kind === "boost") drawBoostPad(props, point, feature.lane);
          else if (feature.kind === "barrier") {
            const barrierWidth = 72 * point.scale;
            const barrierHeight = 34 * point.scale;
            props.roundRect(x - barrierWidth / 2, point.y - barrierHeight, barrierWidth, barrierHeight, 4 * point.scale).fill(0x202938).stroke({ color: 0xff365f, width: Math.max(1, 4 * point.scale) });
            for (let stripe = -24; stripe < 24; stripe += 18) props.moveTo(x + stripe * point.scale, point.y - barrierHeight + 3).lineTo(x + (stripe + 14) * point.scale, point.y - 3).stroke({ color: 0xf8fafc, width: Math.max(1, 5 * point.scale), alpha: .82 });
          } else {
            const gateWidth = 90 * point.scale;
            const gateHeight = 90 * point.scale;
            props.moveTo(x - gateWidth / 2, point.y).lineTo(x - gateWidth / 2, point.y - gateHeight).lineTo(x + gateWidth / 2, point.y - gateHeight).lineTo(x + gateWidth / 2, point.y).stroke({ color: 0x24e5ff, width: Math.max(1, 6 * point.scale), alpha: .86 });
          }
        }

        const visibleCars: Array<{ relative: number; lane: number; color: number; style: number; rival?: RaceTelemetry }> = [];
        for (const car of traffic) {
          let relative = car.z - distance;
          while (relative < -100) { car.z += 3700; car.hit = false; car.near = false; relative = car.z - distance; }
          if (relative > 8 && relative < PSEUDO3D_VIEW_DISTANCE - 24) visibleCars.push({ relative, lane: car.lane, color: car.color, style: car.style });
        }
        const rivalState = opponentRef.current;
        const rivalDistance = rivalState?.z ?? distance - 4;
        const relativeRival = rivalDistance - distance;
        if (rivalState && relativeRival > 7 && relativeRival < PSEUDO3D_VIEW_DISTANCE - 18) visibleCars.push({ relative: relativeRival, lane: clamp(rivalState.x / 11, -1, 1), color: 0x9856ff, style: 99, rival: rivalState });
        visibleCars.sort((leftCar, rightCar) => rightCar.relative - leftCar.relative);

        for (const car of visibleCars) {
          const point = projectRoadPoint(width, height, car.relative, distance, cameraLane, cameraPull);
          const x = lateral(point, car.lane * .66);
          const carScale = .16 + point.scale * .82;
          if (car.rival) drawRearCar(vehicles, x, point.y - 23 * carScale, carScale, car.rival.heading * .9, 0x9856ff, 0xff3daf, car.rival.nitro > 88 && car.rival.speed > 70, false, true);
          else drawTrafficCar(vehicles, x, point.y - 18 * carScale, carScale, car.color, car.style);
          if (point.depth > .46) polygon(vehicles, [
            { x: x - 17 * carScale, y: point.y + 2 }, { x: x + 17 * carScale, y: point.y + 2 },
            { x: x + 27 * carScale, y: point.y + 60 * point.scale }, { x: x - 27 * carScale, y: point.y + 60 * point.scale },
          ], 0xff244f, .045);
        }

        const nearPoint = projectRoadPoint(width, height, 10, distance, cameraLane, cameraPull);
        const playerX = lateral(nearPoint, lane * .66);
        const playerY = height * (compactLandscape ? .76 : height < 650 ? .775 : .795) - cameraPull * height * .035;
        const playerScale = clamp(width / 840, .84, compactLandscape ? 1.24 : 1.5) * (1 - cameraPull * .075);

        for (const particle of particles) {
          if (particle.x === 0 && particle.y <= 0) {
            particle.x = playerX + (Math.random() - .5) * 45 * playerScale;
            particle.y = playerY + 29 * playerScale;
          }
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.vx *= particle.drag;
          particle.vy *= .996;
          particle.life -= dt;
          effects.circle(particle.x, particle.y, particle.size * clamp(particle.life * 1.7, .12, 1)).fill({ color: particle.color, alpha: clamp(particle.life * .72, 0, .48) });
        }
        for (let index = particles.length - 1; index >= 0; index -= 1) if (particles[index].life <= 0) particles.splice(index, 1);

        drawRearCar(vehicles, playerX, playerY, playerScale, steer * (drifting ? -.23 : -.08), carColor, accentColor, boosting || boostFlash > .68, braking);

        if (speed > 64) {
          const count = Math.floor((24 + speedRatio * 40 + cameraPull * 36) * quality.particleScale);
          for (let line = 0; line < count; line += 1) {
            const seed = modulo(line * 101 + nowPerf * (1.65 + speedRatio * 3), width);
            const fromY = horizon + modulo(line * 59 + nowPerf * (2.1 + speedRatio * 4.2), height - horizon);
            const outward = (seed - width / 2) * (.055 + cameraPull * .11);
            const length = 30 + speedRatio * 70 + cameraPull * 100;
            foreground.moveTo(seed, fromY).lineTo(seed + outward, fromY + length).stroke({ color: line % 3 === 0 ? 0xb779ff : 0xa6efff, width: 1 + line % 3, alpha: .08 + speedRatio * .13 + cameraPull * .18 });
          }
          const edgeAlpha = .03 + speedRatio * .04 + cameraPull * .12;
          polygon(foreground, [{ x: 0, y: 0 }, { x: width * .16, y: horizon }, { x: width * .22, y: height }, { x: 0, y: height }], 0x22d3ee, edgeAlpha);
          polygon(foreground, [{ x: width, y: 0 }, { x: width * .84, y: horizon }, { x: width * .78, y: height }, { x: width, y: height }], 0xa855f7, edgeAlpha);
        }

        for (const drop of rain) {
          drop.y = modulo(drop.y + drop.speed * dt * (1 + speedRatio * 1.25 + cameraPull), height + 70);
          drop.x = modulo(drop.x - drop.speed * dt * (.16 + steer * .035) + width + 80, width + 80);
          foreground.moveTo(drop.x, drop.y).lineTo(drop.x - drop.length * (.38 + cameraPull * .4), drop.y + drop.length * (1.05 + speedRatio * 1.05 + cameraPull)).stroke({ color: 0xbcecff, width: 1 + (drop.length % 4 === 0 ? 1 : 0), alpha: .13 + speedRatio * .14 + cameraPull * .13 });
        }
        if (boostFlash > 0) foreground.rect(0, 0, width, height).fill({ color: 0x67e8f9, alpha: boostFlash * .035 });

        if (audioRig) {
          const audioNow = audioRig.context.currentTime;
          const audible = mutedRef.current || pausedRef.current || !racing ? 0 : 1;
          audioRig.master.gain.setTargetAtTime(audible * .68, audioNow, .07);
          audioRig.engine.frequency.setTargetAtTime(86 + speedRatio * 280 + cameraPull * 85, audioNow, .035);
          audioRig.engineBass.frequency.setTargetAtTime(42 + speedRatio * 118 + cameraPull * 28, audioNow, .05);
          audioRig.filter.frequency.setTargetAtTime(420 + speedRatio * 2200 + cameraPull * 1250, audioNow, .045);
          audioRig.engineGain.gain.setTargetAtTime(audible * (.03 + speedRatio * .075 + cameraPull * .055), audioNow, .055);
          audioRig.bassGain.gain.setTargetAtTime(audible * (.022 + speedRatio * .035), audioNow, .065);
          audioRig.windGain.gain.setTargetAtTime(audible * Math.max(0, speedRatio - .3) * (.11 + cameraPull * .16), audioNow, .055);
        }

        if (nowPerf - lastTelemetry > 85 && racing) {
          lastTelemetry = nowPerf;
          callbacksRef.current.onTelemetry({ x: lane * 11, z: distance, speed, heading: steer * (drifting ? -.23 : -.08), checkpoint, nitro, drifting });
        }
        if (nowPerf - lastHud > 60) {
          lastHud = nowPerf;
          const rivalZ = rivalState?.z ?? 0;
          const countdownValue = adjustedStart - now;
          const progress = Math.min(100, distance / TRACK_LENGTH * 100);
          setHud({
            speed: Math.round(speed * 3.6),
            progress,
            rivalProgress: Math.min(100, rivalZ / TRACK_LENGTH * 100),
            nitro,
            elapsed: Math.max(0, now - adjustedStart),
            position: rivalState && rivalZ > distance ? 2 : 1,
            gap: Math.round(distance - rivalZ),
            driftCombo,
            driftScore,
            event: now < eventUntil ? eventText : "",
            countdown: countdownValue > 2200 ? "3" : countdownValue > 1400 ? "2" : countdownValue > 600 ? "1" : countdownValue > -350 ? "GO!" : "",
            district: inTunnel ? "NEON TUNNEL" : onBridge ? "SKYLINE BRIDGE" : progress < 38 ? "MIDNIGHT GRID" : progress < 70 ? "RAIN DISTRICT" : "FINAL SPRINT",
            boosting,
          });
        }
      });
    });

    return () => {
      disposed = true;
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      host.removeEventListener("pointerdown", unlockAudio);
      if (audioRig) {
        try { audioRig.engine.stop(); audioRig.engineBass.stop(); audioRig.wind.stop(); } catch { /* sources were already stopped */ }
        void audioRig.context.close();
      }
      if (app.renderer) app.destroy({ removeView: true }, { children: true });
    };
  }, [vehicleId]);

  const togglePause = () => { if (active) setPaused((value) => !value); };

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#030711]">
      <div ref={hostRef} className="absolute inset-0 [&_canvas]:block" />

      <div className="pointer-events-none absolute inset-x-2 top-[58px] z-20 mx-auto max-w-[1040px] sm:inset-x-16 sm:top-3">
        <div className="rounded-2xl border border-cyan-100/15 bg-[#030811]/84 px-3 py-2 shadow-[0_14px_55px_rgba(0,0,0,.5)] backdrop-blur-xl sm:px-4">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <div><p className="text-[7px] font-black uppercase tracking-[.2em] text-white/38">Position</p><p className="text-xl font-black italic text-cyan-200 sm:text-2xl">{hud.position}<span className="text-xs text-white/35">/2</span></p></div>
            <div className="min-w-0">
              <div className="flex justify-between text-[7px] font-black uppercase tracking-[.16em]"><span className="text-cyan-200">YOU {hud.progress.toFixed(0)}%</span><span className="text-white/48">Race progress</span><span className="text-fuchsia-200" title={opponentName}>RIVAL {hud.rivalProgress.toFixed(0)}%</span></div>
              <div className="relative mt-1.5 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-400 to-fuchsia-400 shadow-[0_0_14px_#22d3ee]" style={{ width: `${hud.progress}%` }} /><span className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_white]" style={{ left: `calc(${hud.progress}% - 4px)` }} /></div>
            </div>
            <div className="text-right"><p className="text-[7px] font-black uppercase tracking-[.2em] text-white/38">Rival gap</p><p className={`text-sm font-black sm:text-base ${hud.gap >= 0 ? "text-emerald-200" : "text-rose-200"}`}>{hud.gap >= 0 ? "+" : ""}{hud.gap}m</p></div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 border-t border-white/[.07] pt-1.5 sm:grid-cols-6">{[
            { label: "Time", value: formatRaceTime(hud.elapsed) },
            { label: "Entry", value: `${entryCredits.toLocaleString()} CR` },
            { label: "Reward", value: `${possibleReward.toLocaleString()} CR` },
            { label: "Objective", value: "FINISH P1" },
            { label: "Difficulty", value: difficulty },
            { label: "Level", value: `LV ${level}` },
          ].map((item) => <div key={item.label} className="min-w-0 rounded-md bg-white/[.035] px-1.5 py-1"><p className="text-[6px] font-black uppercase tracking-widest text-white/38">{item.label}</p><p className="mt-0.5 truncate text-[8px] font-black uppercase text-white/82">{item.value}</p></div>)}</div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-[148px] left-3 z-20 w-32 rounded-xl border border-white/10 bg-black/62 p-2.5 backdrop-blur-xl sm:bottom-5 sm:left-5 sm:w-44">
        <div className="flex items-end justify-between"><div><p className="text-[7px] font-black uppercase tracking-[.2em] text-white/38">Nitro</p><p className={`mt-1 text-sm font-black ${hud.nitro > 98 ? "animate-pulse text-amber-200" : "text-cyan-100"}`}>{Math.round(hud.nitro)}%</p></div><Flame className={`h-5 w-5 ${hud.boosting ? "text-white drop-shadow-[0_0_12px_#22d3ee]" : "text-cyan-300"}`} /></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full bg-gradient-to-r ${hud.nitro > 98 ? "from-amber-400 to-white" : "from-blue-500 to-cyan-200"} shadow-[0_0_12px_#22d3ee]`} style={{ width: `${hud.nitro}%` }} /></div>
        <p className="mt-2 truncate text-[7px] font-black uppercase tracking-wider text-cyan-100">{hud.district}</p>
      </div>

      <div className="pointer-events-none absolute bottom-[148px] right-3 z-20 rounded-xl border border-white/10 bg-black/62 px-3 py-2 text-right backdrop-blur-xl sm:bottom-5 sm:right-5">
        <p className={`text-4xl font-black italic tabular-nums sm:text-6xl ${hud.boosting ? "text-cyan-100 drop-shadow-[0_0_18px_#22d3ee]" : "text-white"}`}>{hud.speed}</p>
        <p className="text-[8px] font-black uppercase tracking-[.24em] text-cyan-200">KM/H</p>
        <p className="mt-1 text-[8px] font-black uppercase text-white/48">Drift {hud.driftCombo ? `×${hud.driftCombo}` : "—"} · {hud.driftScore.toLocaleString()}</p>
      </div>

      <button onClick={togglePause} className="game-safe-top absolute right-3 z-30 grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-black/55 text-white/80 backdrop-blur-xl" aria-label={paused ? "Resume race" : "Pause race"}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
      {paused && <div className="absolute inset-0 z-40 grid place-items-center bg-[#02050a]/72 backdrop-blur-md"><div className="rounded-[2rem] border border-cyan-200/20 bg-[#06111d]/95 p-8 text-center shadow-2xl"><Pause className="mx-auto h-9 w-9 text-cyan-200" /><h2 className="mt-4 text-4xl font-black italic">RACE PAUSED</h2><p className="mt-2 text-xs text-white/45">Camera, engine and race timer are held.</p><button onClick={togglePause} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-7 py-3 text-[10px] font-black uppercase tracking-widest text-[#03131a]"><Play className="h-4 w-4" /> Resume</button></div></div>}
      {hud.countdown && <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center"><span key={hud.countdown} className="animate-countdown-pop text-[clamp(5rem,17vw,12rem)] font-black italic tracking-[-.08em] text-white drop-shadow-[0_0_45px_rgba(34,211,238,.9)]">{hud.countdown}</span></div>}
      {hud.event && <div className="pointer-events-none absolute inset-x-0 top-[37%] z-20 text-center"><p key={hud.event} className="animate-countdown-pop text-[clamp(1.7rem,5vw,4.5rem)] font-black italic tracking-[-.05em] text-white drop-shadow-[0_0_30px_rgba(34,211,238,.85)]">{hud.event}</p></div>}
      {hud.boosting && <div className="pointer-events-none absolute inset-x-0 top-[29%] z-10 text-center"><p className="text-[8px] font-black uppercase tracking-[.55em] text-cyan-100/72">NITRO OVERDRIVE</p></div>}

      <div className="game-safe-bottom absolute inset-x-3 z-30 flex items-end justify-between sm:hidden">
        <div className="grid grid-cols-2 gap-2"><TouchButton control="left" controlRef={touchRef}><ArrowLeft /><span>Left</span></TouchButton><TouchButton control="right" controlRef={touchRef}><ArrowRight /><span>Right</span></TouchButton><TouchButton control="brake" controlRef={touchRef}><ArrowDown /><span>Brake</span></TouchButton><TouchButton control="accelerate" controlRef={touchRef}><ArrowUp /><span>Gas</span></TouchButton></div>
        <div className="flex gap-2"><TouchButton control="drift" controlRef={touchRef} className="!h-16 !w-16"><RotateCcw className="h-5 w-5" /><span>Drift</span></TouchButton><TouchButton control="nitro" controlRef={touchRef} className="!h-16 !w-16 !border-cyan-300/55 !bg-cyan-300/20"><Flame className="h-5 w-5 text-cyan-100" /><span>Nitro</span></TouchButton></div>
      </div>
      <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/48 px-4 py-2 text-[8px] font-black uppercase tracking-[.16em] text-white/48 backdrop-blur sm:flex"><Gauge className="h-3.5 w-3.5 text-cyan-300" /> Auto-throttle · Arrows steer · Space drift · Shift nitro</div>
    </div>
  );
}
