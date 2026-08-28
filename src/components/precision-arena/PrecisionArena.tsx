"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { ARCHERY_ARROWS, ARCHERY_BOWS, ARCHERY_COSMETICS, ARCHERY_ENVIRONMENTS, ARCHERY_TARGETS, type ArcherySide } from "@/lib/precision-arena/constants";
import { flightTimeToDistance, guidePoints, obstacleCollision, scoreArcheryShot, targetPosition, trajectoryPoint, type ArcheryImpact, type ArcheryShotInput } from "@/lib/precision-arena/physics";
import { getGameRenderQuality } from "@/lib/gamePerformance";

export type ArcheryShotReport = ArcheryImpact & {
  shooter: ArcherySide;
  blocked: boolean;
  bonusTarget: boolean;
  comboEligible: boolean;
};

export type PrecisionArenaHandle = {
  shoot: (shot: { shooter: ArcherySide; angle: number; power: number; finalArrow?: boolean }) => boolean;
  reset: () => void;
  getTargetClock: () => number;
};

type Props = {
  environmentId: string;
  bowId: string;
  arrowId: string;
  targetId: string;
  cosmeticId: string;
  windKmh: number;
  distance: number;
  targetY: number;
  targetVelocity: number;
  obstacleHeight?: number;
  bonusTargetY?: number;
  angle: number;
  power: number;
  active: boolean;
  turn: ArcherySide;
  reducedMotion?: boolean;
  onAimChange: (angle: number, power: number) => void;
  onRelease: (angle: number, power: number) => void;
  onShotComplete: (report: ArcheryShotReport) => void;
};

type Flight = {
  shooter: ArcherySide;
  input: ArcheryShotInput;
  impact: ArcheryImpact;
  visualImpact: ArcheryImpact;
  elapsed: number;
  duration: number;
  fullFlight: number;
  blocked: boolean;
  obstacleTime: number;
  bonusTarget: boolean;
  finalArrow: boolean;
  complete: boolean;
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; size: number; color: number };

function itemById<T extends { id: string }>(items: readonly T[], id: string) {
  return items.find((item) => item.id === id) ?? items[0];
}

function drawEnvironment(graphics: Graphics, width: number, height: number, environmentId: string) {
  const arena = itemById(ARCHERY_ENVIRONMENTS, environmentId);
  const horizon = height * .59;
  graphics.clear().rect(0, 0, width, height).fill(arena.sky);
  graphics.rect(0, horizon * .5, width, horizon * .5).fill({ color: arena.horizon, alpha: .38 });
  const night = arena.id === "moonlit-forest" || arena.id === "neon-rooftop";
  graphics.circle(width * .79, height * .18, Math.min(width, height) * .075).fill({ color: night ? 0xe5edff : 0xffe4a3, alpha: .88 });
  graphics.circle(width * .79, height * .18, Math.min(width, height) * .12).fill({ color: arena.accent, alpha: .06 });

  for (let index = 0; index < 8; index += 1) {
    const x = width * (index / 7);
    const peak = horizon - height * (.12 + (index % 3) * .055);
    graphics.moveTo(x - width * .16, horizon).lineTo(x, peak).lineTo(x + width * .18, horizon).fill({ color: arena.far, alpha: .84 });
  }
  for (let index = 0; index < 7; index += 1) {
    const x = width * (index / 6) + width * .03;
    graphics.moveTo(x - width * .18, horizon + height * .09).lineTo(x, horizon - height * (.035 + (index % 2) * .07)).lineTo(x + width * .2, horizon + height * .09).fill({ color: arena.near, alpha: .94 });
  }

  if (arena.id === "japanese-temple") {
    graphics.rect(width * .62, horizon - height * .12, width * .16, height * .19).fill(0x2d1721);
    graphics.moveTo(width * .58, horizon - height * .12).lineTo(width * .82, horizon - height * .12).lineTo(width * .76, horizon - height * .2).lineTo(width * .64, horizon - height * .2).fill(0x6a2035);
    graphics.rect(width * .685, horizon - height * .28, width * .014, height * .16).fill(0x281117);
    graphics.rect(width * .75, horizon - height * .28, width * .014, height * .16).fill(0x281117);
    graphics.moveTo(width * .65, horizon - height * .28).lineTo(width * .8, horizon - height * .28).lineTo(width * .76, horizon - height * .35).lineTo(width * .69, horizon - height * .35).fill(0x7b2940);
  } else if (arena.id === "neon-rooftop") {
    for (let index = 0; index < 12; index += 1) {
      const buildingWidth = width / 11;
      const buildingHeight = height * (.14 + (index % 4) * .04);
      const x = index * buildingWidth;
      graphics.rect(x, horizon - buildingHeight, buildingWidth * .84, buildingHeight).fill(0x0a0b20);
      for (let floor = 0; floor < 5; floor += 1) graphics.rect(x + 8, horizon - buildingHeight + 10 + floor * 17, 4, 8).fill({ color: index % 2 ? 0x24e7ff : 0xff42cc, alpha: .64 });
    }
  } else if (arena.id === "castle-battlefield") {
    graphics.rect(width * .64, horizon - height * .14, width * .18, height * .2).fill(0x333b41);
    graphics.rect(width * .62, horizon - height * .22, width * .065, height * .28).fill(0x434b52);
    graphics.rect(width * .79, horizon - height * .22, width * .065, height * .28).fill(0x434b52);
    for (let index = 0; index < 7; index += 1) graphics.rect(width * (.62 + index * .032), horizon - height * .24, width * .018, height * .04).fill(0x525b62);
  } else if (arena.id === "desert-kingdom") {
    graphics.rect(width * .67, horizon - height * .12, width * .12, height * .18).fill(0x87452b);
    graphics.circle(width * .73, horizon - height * .12, width * .06).fill(0xd17b48);
    graphics.rect(width * .722, horizon - height * .25, width * .016, height * .13).fill(0x8b472c);
  }

  graphics.moveTo(0, height * .76).lineTo(width * .22, height * .69).lineTo(width * .52, height * .76).lineTo(width, height * .69).lineTo(width, height).lineTo(0, height).fill(arena.ground);
  graphics.rect(0, height * .79, width, height * .21).fill({ color: 0x050a0b, alpha: .28 });

  for (let index = 0; index < 15; index += 1) {
    const x = (index / 14) * width;
    const trunkHeight = height * (.08 + (index % 3) * .022);
    graphics.rect(x, height * .72 - trunkHeight, 3, trunkHeight).fill({ color: 0x171a16, alpha: .72 });
    graphics.circle(x, height * .72 - trunkHeight, 11 + index % 4 * 3).fill({ color: arena.near, alpha: .88 });
  }
}

function drawArcher(graphics: Graphics, originX: number, baseline: number, angle: number, power: number, bowId: string, cosmeticId: string, active: boolean) {
  const bow = itemById(ARCHERY_BOWS, bowId);
  const cosmetic = itemById(ARCHERY_COSMETICS, cosmeticId);
  const radians = -angle * Math.PI / 180;
  const draw = active ? power * 17 : 5;
  graphics.clear();
  graphics.circle(originX - 35, baseline - 112, 18).fill(0xeabf9d);
  graphics.moveTo(originX - 48, baseline - 104).lineTo(originX - 22, baseline - 104).lineTo(originX - 16, baseline - 52).lineTo(originX - 57, baseline - 52).fill(cosmetic.cloth);
  graphics.moveTo(originX - 48, baseline - 54).lineTo(originX - 59, baseline).lineTo(originX - 45, baseline).lineTo(originX - 31, baseline - 52).fill(0x18212a);
  graphics.moveTo(originX - 25, baseline - 54).lineTo(originX - 15, baseline).lineTo(originX, baseline).lineTo(originX - 13, baseline - 61).fill(0x111923);
  graphics.moveTo(originX - 31, baseline - 91).lineTo(originX + 2, baseline - 76).stroke({ color: 0xeabf9d, width: 7, cap: "round" });
  graphics.circle(originX - 36, baseline - 118, 19).stroke({ color: cosmetic.accent, width: 4, alpha: .8 });
  const bowX = originX;
  const bowY = baseline - 76;
  const normalX = Math.sin(radians);
  const normalY = -Math.cos(radians);
  const directionX = Math.cos(radians);
  const directionY = Math.sin(radians);
  const topX = bowX + normalX * 44;
  const topY = bowY + normalY * 44;
  const bottomX = bowX - normalX * 44;
  const bottomY = bowY - normalY * 44;
  graphics.moveTo(topX, topY).quadraticCurveTo(bowX + directionX * 17, bowY + directionY * 17, bottomX, bottomY).stroke({ color: bow.body, width: 6, cap: "round" });
  const stringX = bowX - directionX * draw;
  const stringY = bowY - directionY * draw;
  graphics.moveTo(topX, topY).lineTo(stringX, stringY).lineTo(bottomX, bottomY).stroke({ color: bow.string, width: 1.6, alpha: .9 });
  graphics.moveTo(stringX - directionX * 9, stringY - directionY * 9).lineTo(bowX + directionX * 44, bowY + directionY * 44).stroke({ color: bow.accent, width: 2.2 });
}

function drawTarget(graphics: Graphics, x: number, y: number, scale: number, targetId: string, bonus = false) {
  const target = itemById(ARCHERY_TARGETS, targetId);
  const radius = bonus ? scale * 1.35 : scale * 3.5;
  graphics.clear();
  graphics.rect(x - 3, y + radius, 6, scale * 4.3).fill(0x4b3528);
  graphics.rect(x - radius * .72, y + radius + scale * 4, radius * 1.44, 5).fill(0x32251e);
  graphics.circle(x + 5, y + 6, radius + 4).fill({ color: 0x000000, alpha: .28 });
  graphics.circle(x, y, radius).fill(0xf7f2de).stroke({ color: 0x3b2a24, width: 3 });
  graphics.circle(x, y, radius * .72).fill(target.outer);
  graphics.circle(x, y, radius * .5).fill(target.middle);
  graphics.circle(x, y, radius * .27).fill(target.center);
  graphics.circle(x, y, radius * .09).fill(0xfff4ba);
  if (bonus) graphics.circle(x, y, radius + 7).stroke({ color: 0xffe86a, width: 2, alpha: .9 });
}

function drawObstacle(graphics: Graphics, x: number, baseline: number, height: number, scale: number) {
  graphics.clear();
  if (height <= 0) return;
  const top = baseline - 76 - height * scale;
  graphics.rect(x - 26, top, 52, baseline - top).fill(0x3d2d25).stroke({ color: 0xc49a67, width: 2 });
  for (let y = top + 12; y < baseline; y += 15) graphics.moveTo(x - 24, y).lineTo(x + 24, y).stroke({ color: 0x1d1714, width: 1, alpha: .5 });
  graphics.moveTo(x - 31, top + 6).lineTo(x, top - 19).lineTo(x + 31, top + 6).fill(0x71452c);
}

export const PrecisionArena = forwardRef<PrecisionArenaHandle, Props>(function PrecisionArena(props, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const targetClockRef = useRef(0);
  const propsRef = useRef(props);
  const readyRef = useRef(false);
  const resetKeyRef = useRef(0);

  useEffect(() => { propsRef.current = props; }, [props]);

  useImperativeHandle(ref, () => ({
    shoot(shot) {
      if (!readyRef.current || flightRef.current) return false;
      const current = propsRef.current;
      const input: ArcheryShotInput = {
        angle: shot.angle,
        power: shot.power,
        windKmh: current.windKmh,
        distance: current.distance,
        targetY: current.targetY,
        targetVelocity: current.targetVelocity,
        releaseDelay: targetClockRef.current,
      };
      const mainImpact = scoreArcheryShot(input);
      const bonusImpact = current.bonusTargetY === undefined ? null : scoreArcheryShot({ ...input, targetY: current.bonusTargetY, targetVelocity: -current.targetVelocity * .65 });
      const bonusTarget = Boolean(bonusImpact && bonusImpact.baseScore >= 70 && bonusImpact.baseScore > mainImpact.baseScore);
      const impact = bonusTarget && bonusImpact ? { ...bonusImpact, totalScore: bonusImpact.totalScore + 50 } : mainImpact;
      const obstacle = current.obstacleHeight ? obstacleCollision(input, current.distance * .52, current.obstacleHeight) : { hit: false, time: 0 };
      const fullFlight = flightTimeToDistance(input);
      flightRef.current = {
        shooter: shot.shooter,
        input,
        impact: obstacle.hit ? { ...impact, baseScore: 0, totalScore: 0, bullseye: false, perfect: false, longRange: false } : impact,
        visualImpact: impact,
        elapsed: 0,
        duration: obstacle.hit ? obstacle.time : fullFlight,
        fullFlight,
        blocked: obstacle.hit,
        obstacleTime: obstacle.time,
        bonusTarget,
        finalArrow: Boolean(shot.finalArrow),
        complete: false,
      };
      return true;
    },
    reset() {
      flightRef.current = null;
      targetClockRef.current = 0;
      resetKeyRef.current += 1;
    },
    getTargetClock() {
      return targetClockRef.current;
    },
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let dragging = false;
    let pointerId = -1;
    let aim = { angle: propsRef.current.angle, power: propsRef.current.power };
    const quality = getGameRenderQuality();
    const app = new Application();
    appRef.current = app;

    void app.init({ resizeTo: host, antialias: quality.antialias, autoDensity: true, resolution: quality.resolution, preference: "webgl", backgroundAlpha: 0, powerPreference: "high-performance" }).then(() => {
      if (disposed) { app.destroy({ removeView: true }, { children: true }); return; }
      host.appendChild(app.canvas);
      app.canvas.setAttribute("aria-label", "Precision Arena interactive 2D archery range");
      app.canvas.style.touchAction = "none";
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";

      const world = new Container();
      const environment = new Graphics();
      const clouds = new Graphics();
      const weather = new Graphics();
      const obstacle = new Graphics();
      const mainTarget = new Graphics();
      const bonusTarget = new Graphics();
      const archer = new Graphics();
      const guide = new Graphics();
      const trail = new Graphics();
      const arrow = new Graphics();
      const effects = new Graphics();
      world.addChild(environment, clouds, weather, obstacle, mainTarget, bonusTarget, archer, guide, trail, arrow, effects);
      app.stage.addChild(world);
      const particles: Particle[] = [];
      const weatherParticleCount = Math.max(18, Math.round(42 * quality.particleScale));
      let cachedSize = "";
      let environmentTime = 0;
      let lastResetKey = resetKeyRef.current;

      const metrics = () => {
        const width = app.screen.width;
        const height = app.screen.height;
        const baseline = height * .79;
        const originX = Math.max(92, width * .145);
        const targetX = width * .82;
        const xScale = (targetX - originX) / Math.max(1, propsRef.current.distance);
        const yScale = Math.max(12, Math.min(22, width / 44, height / 22));
        return { width, height, baseline, originX, targetX, xScale, yScale };
      };

      const pointerAim = (event: PointerEvent) => {
        const current = propsRef.current;
        if (!dragging || !current.active || current.turn !== "PLAYER" || flightRef.current) return;
        const rectangle = app.canvas.getBoundingClientRect();
        const scaleX = app.screen.width / rectangle.width;
        const scaleY = app.screen.height / rectangle.height;
        const pointX = (event.clientX - rectangle.left) * scaleX;
        const pointY = (event.clientY - rectangle.top) * scaleY;
        const { originX, baseline } = metrics();
        const bowY = baseline - 76;
        const dx = Math.max(12, pointX - originX);
        const dy = bowY - pointY;
        const nextAngle = Math.max(2, Math.min(68, Math.atan2(dy, dx) * 180 / Math.PI));
        const nextPower = Math.max(.42, Math.min(1, Math.hypot(dx, dy) / Math.max(170, app.screen.width * .3)));
        aim = { angle: nextAngle, power: nextPower };
        current.onAimChange(nextAngle, nextPower);
      };

      const onPointerDown = (event: PointerEvent) => {
        const current = propsRef.current;
        if (!current.active || current.turn !== "PLAYER" || flightRef.current) return;
        dragging = true;
        pointerId = event.pointerId;
        app.canvas.setPointerCapture(pointerId);
        pointerAim(event);
      };
      const onPointerMove = (event: PointerEvent) => pointerAim(event);
      const onPointerUp = (event: PointerEvent) => {
        if (!dragging || event.pointerId !== pointerId) return;
        dragging = false;
        if (app.canvas.hasPointerCapture(pointerId)) app.canvas.releasePointerCapture(pointerId);
        propsRef.current.onRelease(aim.angle, aim.power);
      };
      app.canvas.addEventListener("pointerdown", onPointerDown);
      app.canvas.addEventListener("pointermove", onPointerMove);
      app.canvas.addEventListener("pointerup", onPointerUp);
      app.canvas.addEventListener("pointercancel", onPointerUp);

      app.ticker.add((ticker) => {
        const dt = Math.min(.035, ticker.deltaMS / 1000);
        const current = propsRef.current;
        const arena = itemById(ARCHERY_ENVIRONMENTS, current.environmentId);
        const arrowStyle = itemById(ARCHERY_ARROWS, current.arrowId);
        const { width, height, baseline, originX, targetX, xScale, yScale } = metrics();
        const sizeKey = `${Math.round(width)}:${Math.round(height)}:${arena.id}`;
        if (sizeKey !== cachedSize) {
          cachedSize = sizeKey;
          drawEnvironment(environment, width, height, arena.id);
        }
        if (lastResetKey !== resetKeyRef.current) {
          lastResetKey = resetKeyRef.current;
          particles.length = 0;
          effects.clear();
          trail.clear();
          arrow.clear();
        }
        environmentTime += dt;
        targetClockRef.current += dt;
        const targetCenter = targetPosition(current.distance, current.targetY, current.targetVelocity, targetClockRef.current);
        const targetScreenY = baseline - 76 - targetCenter.y * yScale;
        drawTarget(mainTarget, targetX, targetScreenY, yScale, current.targetId);
        if (current.bonusTargetY !== undefined) {
          const bonusCenter = targetPosition(current.distance, current.bonusTargetY, -current.targetVelocity * .65, targetClockRef.current);
          drawTarget(bonusTarget, targetX - yScale * 5, baseline - 76 - bonusCenter.y * yScale, yScale, current.targetId, true);
        } else bonusTarget.clear();
        drawObstacle(obstacle, originX + (targetX - originX) * .52, baseline, current.obstacleHeight ?? 0, yScale);
        drawArcher(archer, originX, baseline, current.angle, current.power, current.bowId, current.cosmeticId, current.active && current.turn === "PLAYER" && !flightRef.current);

        clouds.clear();
        for (let index = 0; index < 5; index += 1) {
          const x = ((index * width * .27 + environmentTime * (7 + index * 1.5)) % (width + 180)) - 90;
          const y = height * (.11 + (index % 3) * .07);
          clouds.circle(x, y, 22).circle(x + 23, y + 5, 18).circle(x - 21, y + 7, 14).fill({ color: 0xffffff, alpha: arena.id === "moonlit-forest" || arena.id === "neon-rooftop" ? .08 : .18 });
        }

        weather.clear();
        const speed = current.windKmh * .8;
        for (let index = 0; index < weatherParticleCount; index += 1) {
          const phase = environmentTime * (arena.weather.includes("rain") ? 240 : arena.weather === "snow" ? 32 : 55) + index * 53;
          const x = ((index * 97 + phase * .31 + speed * environmentTime) % (width + 60)) - 30;
          const y = phase % (height + 30) - 15;
          if (arena.weather.includes("rain")) weather.moveTo(x, y).lineTo(x - 7 - speed * .08, y + 18).stroke({ color: arena.weather === "neon-rain" ? (index % 2 ? 0x4ce9ff : 0xff4ddd) : 0xd9edff, width: 1, alpha: .32 });
          else if (arena.weather === "snow") weather.circle(x, y, 1.5 + index % 3).fill({ color: 0xffffff, alpha: .58 });
          else if (arena.weather === "fireflies") weather.circle(x, height * .3 + y * .55, 1.5).fill({ color: 0xe8ff72, alpha: .25 + .45 * Math.abs(Math.sin(environmentTime * 2 + index)) });
          else weather.circle(x, y, 1 + index % 2).fill({ color: arena.weather === "petals" ? 0xffbad2 : arena.accent, alpha: .34 });
        }

        guide.clear();
        if (current.active && current.turn === "PLAYER" && !flightRef.current) {
          const input: ArcheryShotInput = { angle: current.angle, power: current.power, windKmh: current.windKmh, distance: current.distance, targetY: current.targetY, targetVelocity: current.targetVelocity };
          for (const [index, point] of guidePoints(input).entries()) guide.circle(originX + point.x * xScale, baseline - 76 - point.y * yScale, Math.max(1.2, 2.6 - index * .1)).fill({ color: index < 8 ? 0xe8ffff : arena.accent, alpha: .72 - index * .035 });
        }

        const flight = flightRef.current;
        if (flight) {
          const progress = flight.elapsed / Math.max(.01, flight.duration);
          const slow = !current.reducedMotion && flight.finalArrow && progress > .68 ? .34 : 1;
          flight.elapsed += dt * slow;
          const sampleTime = Math.min(flight.duration, flight.elapsed);
          const point = trajectoryPoint(flight.input, sampleTime);
          const arrowX = originX + point.x * xScale;
          const arrowY = baseline - 76 - point.y * yScale;
          const previous = trajectoryPoint(flight.input, Math.max(0, sampleTime - .025));
          const rotation = Math.atan2(-(point.y - previous.y) * yScale, (point.x - previous.x) * xScale);
          trail.moveTo(arrowX - Math.cos(rotation) * 8, arrowY - Math.sin(rotation) * 8).lineTo(arrowX - Math.cos(rotation) * 58, arrowY - Math.sin(rotation) * 58).stroke({ color: arrowStyle.trail, width: flight.finalArrow ? 4 : 2, alpha: flight.finalArrow ? .42 : .22 });
          arrow.clear().moveTo(arrowX - Math.cos(rotation) * 22, arrowY - Math.sin(rotation) * 22).lineTo(arrowX + Math.cos(rotation) * 16, arrowY + Math.sin(rotation) * 16).stroke({ color: arrowStyle.shaft, width: 3, cap: "round" });
          arrow.moveTo(arrowX + Math.cos(rotation) * 16, arrowY + Math.sin(rotation) * 16).lineTo(arrowX + Math.cos(rotation + .45) * 8, arrowY + Math.sin(rotation + .45) * 8).lineTo(arrowX + Math.cos(rotation - .45) * 8, arrowY + Math.sin(rotation - .45) * 8).fill(0xd5dde5);
          if (flight.elapsed >= flight.duration && !flight.complete) {
            flight.complete = true;
            const impactX = flight.blocked ? originX + current.distance * .52 * xScale : flight.bonusTarget ? targetX - yScale * 5 : targetX;
            const impactY = flight.blocked ? arrowY : baseline - 76 - flight.visualImpact.point.y * yScale;
            const burstColor = flight.impact.bullseye ? 0xffe45d : flight.bonusTarget ? 0xb4ff56 : arrowStyle.trail;
            const amount = Math.max(8, Math.round((flight.impact.bullseye ? 34 : flight.blocked ? 12 : 22) * quality.particleScale));
            for (let index = 0; index < amount; index += 1) {
              const radians = Math.PI * 2 * (index / amount) + Math.random() * .25;
              const speedValue = 35 + Math.random() * (flight.impact.bullseye ? 130 : 75);
              particles.push({ x: impactX, y: impactY, vx: Math.cos(radians) * speedValue, vy: Math.sin(radians) * speedValue, life: .55 + Math.random() * .6, size: 1 + Math.random() * 3, color: burstColor });
            }
            const report: ArcheryShotReport = { ...flight.impact, shooter: flight.shooter, blocked: flight.blocked, bonusTarget: flight.bonusTarget, comboEligible: flight.impact.baseScore >= 80 };
            window.setTimeout(() => {
              flightRef.current = null;
              trail.clear();
              arrow.clear();
              propsRef.current.onShotComplete(report);
            }, current.reducedMotion ? 120 : flight.impact.bullseye ? 620 : 360);
          }
        }

        effects.clear();
        for (let index = particles.length - 1; index >= 0; index -= 1) {
          const particle = particles[index];
          particle.life -= dt;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.vy += 80 * dt;
          if (particle.life <= 0) particles.splice(index, 1);
          else effects.circle(particle.x, particle.y, particle.size).fill({ color: particle.color, alpha: Math.min(1, particle.life * 1.5) });
        }
        const shake = flight?.complete && flight.impact.bullseye && !current.reducedMotion ? Math.sin(environmentTime * 95) * 4 * Math.max(0, 1 - (flight.elapsed - flight.duration) * 2) : 0;
        world.x = shake;
        world.y = shake * .4;
      });
      readyRef.current = true;
    });

    return () => {
      disposed = true;
      readyRef.current = false;
      flightRef.current = null;
      if (appRef.current === app && app.renderer) app.destroy({ removeView: true }, { children: true });
      appRef.current = null;
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0 overflow-hidden bg-[#071018] [&_canvas]:block" />;
});
