"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  LinesMesh,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import {
  TOWER_ARENAS,
  TOWER_CANNONS,
  TOWER_CASTLES,
  TOWER_PROJECTILE_SKINS,
  towerProjectileById,
  type TowerProjectileId,
  type TowerSide,
} from "@/lib/tower-clash/constants";
import {
  impactDamage,
  launchProjectile,
  predictTowerTrajectory,
  shotOrigin,
  stepProjectile,
  type ProjectileState,
  type TowerShotInput,
} from "@/lib/tower-clash/physics";
import { getGameRenderQuality, type GameRenderQuality } from "@/lib/gamePerformance";

export type TowerShotReport = {
  shooter: TowerSide;
  damage: number;
  critical: boolean;
  directHit: boolean;
  hitPart: string | null;
  destroyedParts: number;
  flightMs: number;
  impact: { x: number; y: number; z: number };
  projectileId: TowerProjectileId;
  powerShot: boolean;
};

export type TowerClashArenaHandle = {
  reset: () => void;
  shoot: (input: TowerShotInput) => boolean;
};

type Props = {
  interactive: boolean;
  showGuide: boolean;
  angle: number;
  power: number;
  wind: number;
  projectileId: TowerProjectileId;
  cannonId: string;
  castleId: string;
  arenaId: string;
  projectileSkinId: string;
  onAimChange: (angle: number) => void;
  onPowerChange: (power: number) => void;
  onShotStart: () => void;
  onShotComplete: (report: TowerShotReport) => void;
  onSound: (kind: "launch" | "explosion" | "critical" | "collapse" | "wind", intensity: number) => void;
};

type CastleBlock = {
  id: string;
  side: TowerSide;
  mesh: Mesh;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  hp: number;
  maxHp: number;
  critical: boolean;
};

type DebrisPiece = { mesh: Mesh; velocity: Vector3; spin: Vector3; life: number; smoke: boolean };
type ActiveShot = { input: TowerShotInput; requestedAt: number; launchedAt: number | null; state: ProjectileState | null; mesh: Mesh | null; trail: Mesh[] };
type SceneParts = {
  scene: Scene;
  camera: ArcRotateCamera;
  playerBarrel: TransformNode;
  aiBarrel: TransformNode;
  guide: LinesMesh;
  blocks: CastleBlock[];
  debris: DebrisPiece[];
  rain: Mesh[];
};

function color(value: string) {
  return Color3.FromHexString(value);
}

function material(scene: Scene, name: string, value: string, roughness = .75, metallic = 0) {
  const result = new PBRMaterial(name, scene);
  result.albedoColor = color(value);
  result.roughness = roughness;
  result.metallic = metallic;
  return result;
}

function glowMaterial(scene: Scene, name: string, value: string, alpha = 1) {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = color(value).scale(.08);
  result.emissiveColor = color(value);
  result.alpha = alpha;
  result.disableLighting = true;
  return result;
}

function addCastle(
  scene: Scene,
  shadows: ShadowGenerator,
  side: TowerSide,
  centerX: number,
  style: (typeof TOWER_CASTLES)[number],
  blocks: CastleBlock[],
) {
  const stone = material(scene, `${side}-stone`, style.stone, .92, .03);
  const darkStone = material(scene, `${side}-dark-stone`, Color3.FromHexString(style.stone).scale(.63).toHexString(), .96);
  const roof = material(scene, `${side}-roof`, style.roof, .72, .12);
  const banner = glowMaterial(scene, `${side}-banner`, style.banner, .92);
  const direction = side === "PLAYER" ? 1 : -1;

  const createBlock = (id: string, x: number, y: number, z: number, width: number, height: number, depth: number, critical = false, specialMaterial?: PBRMaterial) => {
    const mesh = MeshBuilder.CreateBox(`${side}-${id}`, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    mesh.material = specialMaterial ?? (Math.round(y * 10) % 2 ? stone : darkStone);
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh);
    blocks.push({ id, side, mesh, x, y, z, width, height, depth, hp: critical ? 26 : 18, maxHp: critical ? 26 : 18, critical });
    return mesh;
  };

  for (let row = 0; row < 3; row++) {
    for (let column = -2; column <= 2; column++) {
      createBlock(`wall-${row}-${column}`, centerX + column * 1.04, .55 + row * .92, 0, 1, .86, 1.35, row === 2 && column === 0);
    }
  }
  for (const towerOffset of [-3.05, 3.05]) {
    for (let row = 0; row < 4; row++) createBlock(`tower-${towerOffset}-${row}`, centerX + towerOffset, .58 + row * .98, 0, 1.28, .92, 1.58, row === 3);
    const roofMesh = MeshBuilder.CreateCylinder(`${side}-tower-roof-${towerOffset}`, { height: 1.1, diameterTop: .08, diameterBottom: 1.72, tessellation: 4 }, scene);
    roofMesh.position.set(centerX + towerOffset, 4.65, 0);
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.material = roof;
    shadows.addShadowCaster(roofMesh);
    blocks.push({ id: `tower-crown-${towerOffset}`, side, mesh: roofMesh, x: centerX + towerOffset, y: 4.65, z: 0, width: 1.5, height: 1.1, depth: 1.5, hp: 20, maxHp: 20, critical: true });
  }
  const keep = createBlock("keep", centerX, 3.85, 0, 2.35, 1.65, 1.65, true, stone);
  const battlementMaterial = material(scene, `${side}-battlements`, color(style.stone).scale(1.08).toHexString(), .9);
  for (let offset = -2.5; offset <= 2.5; offset += 1) createBlock(`crenel-${offset}`, centerX + offset, 3.28, 0, .52, .48, 1.44, false, battlementMaterial);
  const gate = MeshBuilder.CreateBox(`${side}-gate`, { width: 1.05, height: 1.42, depth: 1.4 }, scene);
  gate.position.set(centerX + direction * .02, .71, -.03);
  gate.material = material(scene, `${side}-gate-material`, "#22160e", .78, .08);
  const bannerPole = MeshBuilder.CreateCylinder(`${side}-banner-pole`, { height: 2.2, diameter: .07, tessellation: 10 }, scene);
  bannerPole.position.set(centerX, 5.25, 0);
  bannerPole.material = material(scene, `${side}-pole`, "#cbd5e1", .3, .75);
  const flag = MeshBuilder.CreatePlane(`${side}-flag`, { width: 1.35, height: .68 }, scene);
  flag.position.set(centerX + direction * .68, 5.72, 0);
  flag.rotation.y = Math.PI / 2;
  flag.material = banner;
  shadows.addShadowCaster(keep);
}

function addCannon(scene: Scene, shadows: ShadowGenerator, side: TowerSide, style: (typeof TOWER_CANNONS)[number]) {
  const x = side === "PLAYER" ? -10.65 : 10.65;
  const root = new TransformNode(`${side}-cannon-root`, scene);
  root.position.set(x, 1.02, 0);
  const bodyMaterial = material(scene, `${side}-cannon-body`, style.body, .58, .34);
  const metalMaterial = material(scene, `${side}-cannon-metal`, style.metal, .3, .84);
  const accentMaterial = glowMaterial(scene, `${side}-cannon-accent`, style.accent);
  const carriage = MeshBuilder.CreateBox(`${side}-carriage`, { width: 1.8, height: .42, depth: 1.25 }, scene);
  carriage.position.set(x, .57, 0);
  carriage.material = bodyMaterial;
  shadows.addShadowCaster(carriage);
  for (const z of [-.68, .68]) {
    const wheel = MeshBuilder.CreateCylinder(`${side}-wheel-${z}`, { height: .18, diameter: .78, tessellation: 20 }, scene);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, .46, z);
    wheel.material = metalMaterial;
    shadows.addShadowCaster(wheel);
  }
  const barrel = MeshBuilder.CreateCylinder(`${side}-barrel`, { height: 2.85, diameterTop: .38, diameterBottom: .62, tessellation: 24 }, scene);
  barrel.position.y = 1.42;
  barrel.material = metalMaterial;
  barrel.parent = root;
  shadows.addShadowCaster(barrel);
  const muzzle = MeshBuilder.CreateTorus(`${side}-muzzle`, { diameter: .62, thickness: .13, tessellation: 24 }, scene);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.y = 2.82;
  muzzle.material = accentMaterial;
  muzzle.parent = root;
  return root;
}

function createEnvironment(scene: Scene, arenaId: string, castleId: string, cannonId: string, quality: GameRenderQuality): SceneParts {
  const arena = TOWER_ARENAS.find((item) => item.id === arenaId) ?? TOWER_ARENAS[0];
  const castle = TOWER_CASTLES.find((item) => item.id === castleId) ?? TOWER_CASTLES[0];
  const cannon = TOWER_CANNONS.find((item) => item.id === cannonId) ?? TOWER_CANNONS[0];
  scene.clearColor = Color4.FromColor3(color(arena.sky), 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = arena.environment === "DESERT" ? .012 : .018;
  scene.fogColor = color(arena.fog).scale(.65);
  scene.ambientColor = color(arena.fog).scale(.22);

  const camera = new ArcRotateCamera("siege-camera", -Math.PI / 2, 1.19, 36, new Vector3(0, 2.35, 0), scene);
  camera.fov = .66;
  camera.lowerRadiusLimit = 25;
  camera.upperRadiusLimit = 42;
  camera.inputs.clear();

  const ambient = new HemisphericLight("siege-ambient", new Vector3(0, 1, -.25), scene);
  ambient.intensity = arena.environment === "DESERT" ? .78 : .46;
  ambient.diffuse = arena.environment === "DESERT" ? new Color3(1, .7, .48) : new Color3(.42, .57, .8);
  ambient.groundColor = color(arena.ground).scale(.4);
  const moon = new DirectionalLight("siege-key", new Vector3(-.32, -.78, .42), scene);
  moon.position = new Vector3(12, 22, -12);
  moon.intensity = arena.environment === "BATTLEFIELD" ? 1.55 : 1.1;
  moon.diffuse = color(arena.accent);
  const shadows = new ShadowGenerator(quality.lowPower ? 768 : 1536, moon);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 22;

  const ground = MeshBuilder.CreateGround("siege-ground", { width: 52, height: 18, subdivisions: 18 }, scene);
  ground.material = material(scene, "siege-ground-material", arena.ground, 1);
  ground.receiveShadows = true;
  const ravine = MeshBuilder.CreateGround("ravine", { width: 15, height: 12 }, scene);
  ravine.position.y = .018;
  ravine.material = material(scene, "ravine-material", arena.environment === "DESERT" ? "#3f1e12" : "#0a1117", .93);

  const mountainMaterial = material(scene, "mountain-material", color(arena.ground).scale(.58).toHexString(), 1);
  for (let index = 0; index < 14; index++) {
    const peak = MeshBuilder.CreateCylinder(`peak-${index}`, { height: 5 + index % 4 * 1.8, diameterTop: 0, diameterBottom: 7 + index % 3, tessellation: 5 }, scene);
    peak.position.set(-25 + index * 4, 1.4 + index % 3, 6.5 + (index % 2) * 2.4);
    peak.rotation.y = index * .71;
    peak.material = mountainMaterial;
  }

  if (arena.environment === "NIGHT_RAIN" || arena.environment === "MOUNTAINS") {
    const moonDisc = MeshBuilder.CreateSphere("moon", { diameter: 4.2, segments: 24 }, scene);
    moonDisc.position.set(-13, 13, 9);
    moonDisc.material = glowMaterial(scene, "moon-material", arena.environment === "MOUNTAINS" ? "#dff8ff" : "#9fd8ff", .75);
  }
  if (arena.environment === "BATTLEFIELD") {
    for (const x of [-7, -2, 3, 8]) {
      const fire = MeshBuilder.CreateSphere(`distant-fire-${x}`, { diameter: .42, segments: 10 }, scene);
      fire.position.set(x, .45, 4.2);
      fire.material = glowMaterial(scene, `distant-fire-material-${x}`, "#ff5a24");
      const light = new PointLight(`fire-light-${x}`, fire.position, scene);
      light.diffuse = color("#ff7a2f");
      light.intensity = 3;
      light.range = 5;
    }
  }

  const blocks: CastleBlock[] = [];
  addCastle(scene, shadows, "PLAYER", -14, castle, blocks);
  const enemyStyle = TOWER_CASTLES[(TOWER_CASTLES.indexOf(castle) + 1) % TOWER_CASTLES.length];
  addCastle(scene, shadows, "AI", 14, enemyStyle, blocks);
  const playerBarrel = addCannon(scene, shadows, "PLAYER", cannon);
  const enemyCannon = TOWER_CANNONS[Math.min(TOWER_CANNONS.length - 1, TOWER_CANNONS.indexOf(cannon) + 1)];
  const aiBarrel = addCannon(scene, shadows, "AI", enemyCannon);

  const guide = MeshBuilder.CreateDashedLines("trajectory-guide", { points: [Vector3.Zero(), new Vector3(.01, .01, 0)], dashSize: .28, gapSize: .18, dashNb: 40, updatable: true }, scene);
  guide.color = color(arena.accent);
  const rain: Mesh[] = [];
  if (arena.environment === "NIGHT_RAIN") {
    const rainMaterial = glowMaterial(scene, "rain-material", "#9bdcff", .28);
    for (let index = 0; index < Math.round(90 * quality.particleScale); index++) {
      const drop = MeshBuilder.CreateBox(`rain-${index}`, { width: .018, height: .48, depth: .018 }, scene);
      drop.position.set((index * 7.31 % 44) - 22, (index * 3.77 % 14) + 1, (index * 5.13 % 14) - 7);
      drop.rotation.z = -.12;
      drop.material = rainMaterial;
      rain.push(drop);
    }
  }
  new GlowLayer("siege-glow", scene, { blurKernelSize: quality.lowPower ? 24 : 40 }).intensity = quality.lowPower ? .42 : .7;
  const pipeline = new DefaultRenderingPipeline("siege-pipeline", true, scene, [camera]);
  pipeline.samples = quality.lowPower ? 1 : 2;
  pipeline.fxaaEnabled = !quality.lowPower;
  pipeline.bloomEnabled = !quality.lowPower;
  pipeline.bloomThreshold = .62;
  pipeline.bloomWeight = .32;
  pipeline.bloomKernel = 64;
  pipeline.imageProcessing.contrast = 1.22;
  pipeline.imageProcessing.exposure = 1.08;
  return { scene, camera, playerBarrel, aiBarrel, guide, blocks, debris: [], rain };
}

function setBarrelAngle(root: TransformNode, side: TowerSide, angle: number, recoil = 0) {
  const radians = angle * Math.PI / 180;
  root.rotation.z = side === "PLAYER" ? radians - Math.PI / 2 : Math.PI / 2 - radians;
  root.position.y = 1.02 - recoil;
}

function resetBlocks(blocks: CastleBlock[]) {
  for (const block of blocks) {
    block.hp = block.maxHp;
    block.mesh.setEnabled(true);
    block.mesh.position.set(block.x, block.y, block.z);
    block.mesh.rotation.set(0, block.id.includes("crown") ? Math.PI / 4 : 0, 0);
    block.mesh.scaling.setAll(1);
  }
}

function addDebris(parts: SceneParts, position: Vector3, source: Mesh, count: number, force: number) {
  for (let index = 0; index < count; index++) {
    const piece = MeshBuilder.CreateBox(`debris-${performance.now()}-${index}`, { size: .22 + Math.random() * .32 }, parts.scene);
    piece.position.copyFrom(position);
    piece.material = source.material;
    const angle = Math.random() * Math.PI * 2;
    parts.debris.push({
      mesh: piece,
      velocity: new Vector3(Math.cos(angle) * force * (.6 + Math.random()), 2.5 + Math.random() * force, Math.sin(angle) * force * .55),
      spin: new Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5),
      life: 1.2 + Math.random() * 1.3,
      smoke: false,
    });
  }
}

function addExplosion(parts: SceneParts, position: Vector3, projectileId: TowerProjectileId, critical: boolean) {
  const projectile = towerProjectileById(projectileId);
  const flash = MeshBuilder.CreateSphere(`flash-${performance.now()}`, { diameter: critical ? 2.8 : 1.8, segments: 12 }, parts.scene);
  flash.position.copyFrom(position);
  flash.material = glowMaterial(parts.scene, `flash-material-${performance.now()}`, projectile.glow, .95);
  parts.debris.push({ mesh: flash, velocity: Vector3.Zero(), spin: Vector3.Zero(), life: .34, smoke: true });
  for (let index = 0; index < 18; index++) {
    const spark = MeshBuilder.CreateSphere(`spark-${performance.now()}-${index}`, { diameter: .07 + Math.random() * .08, segments: 6 }, parts.scene);
    spark.position.copyFrom(position);
    spark.material = glowMaterial(parts.scene, `spark-material-${performance.now()}-${index}`, index % 3 ? projectile.glow : "#ffffff");
    const angle = Math.random() * Math.PI * 2;
    const force = 3 + Math.random() * (critical ? 7 : 4.5);
    parts.debris.push({ mesh: spark, velocity: new Vector3(Math.cos(angle) * force, 2 + Math.random() * force, Math.sin(angle) * force), spin: Vector3.Zero(), life: .6 + Math.random() * .6, smoke: false });
  }
  for (let index = 0; index < 7; index++) {
    const smoke = MeshBuilder.CreateSphere(`smoke-${performance.now()}-${index}`, { diameter: .42 + Math.random() * .45, segments: 8 }, parts.scene);
    smoke.position.copyFrom(position).addInPlace(new Vector3((Math.random() - .5) * .8, Math.random() * .4, (Math.random() - .5) * .6));
    smoke.material = glowMaterial(parts.scene, `smoke-material-${performance.now()}-${index}`, index < 2 ? "#ff6a24" : "#242b35", index < 2 ? .72 : .45);
    parts.debris.push({ mesh: smoke, velocity: new Vector3((Math.random() - .5) * .45, .8 + Math.random(), (Math.random() - .5) * .35), spin: Vector3.Zero(), life: 1.4 + Math.random(), smoke: true });
  }
}

export const TowerClashArena = forwardRef<TowerClashArenaHandle, Props>(function TowerClashArena(props, forwardedRef) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const partsRef = useRef<SceneParts | null>(null);
  const propsRef = useRef(props);
  const shotRef = useRef<ActiveShot | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; angle: number; power: number } | null>(null);

  useEffect(() => { propsRef.current = props; }, [props]);

  useImperativeHandle(forwardedRef, () => ({
    reset: () => {
      if (partsRef.current) resetBlocks(partsRef.current.blocks);
      shotRef.current = null;
    },
    shoot: (input) => {
      if (shotRef.current || !partsRef.current) return false;
      shotRef.current = { input, requestedAt: performance.now(), launchedAt: null, state: null, mesh: null, trail: [] };
      propsRef.current.onShotStart();
      return true;
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const quality = getGameRenderQuality();
    const engine = new Engine(canvas, quality.antialias, { antialias: quality.antialias, adaptToDeviceRatio: false, powerPreference: "high-performance" });
    engine.setHardwareScalingLevel(1 / quality.resolution);
    const scene = new Scene(engine);
    const parts = createEnvironment(scene, props.arenaId, props.castleId, props.cannonId, quality);
    partsRef.current = parts;
    let lastFrame = performance.now();
    let lastGuide = "";

    const finishShot = (active: ActiveShot, position: Vector3, hitBlock: CastleBlock | null) => {
      if (!active.state) return;
      const projectile = towerProjectileById(active.input.projectileId);
      const shotTiming = active.input.timing ?? 1;
      const critical = Boolean(hitBlock?.critical && Math.abs(position.y - hitBlock.y) < hitBlock.height * .45 && shotTiming >= .72);
      const directHit = Boolean(hitBlock);
      let destroyedParts = 0;
      const targets = parts.blocks.filter((block) => block.side !== active.input.shooter && block.mesh.isEnabled());
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const block of targets) {
        const distance = Vector3.Distance(position, block.mesh.position);
        nearestDistance = Math.min(nearestDistance, Math.max(0, distance - Math.max(block.width, block.height) * .45));
        if (distance > projectile.radius + Math.max(block.width, block.height) * .55) continue;
        const blockDamage = impactDamage(active.input.projectileId, Math.max(0, distance - .2), block === hitBlock, critical && block === hitBlock, Boolean(active.input.powerShot), shotTiming);
        block.hp -= blockDamage;
        block.mesh.scaling.scaleInPlace(Math.max(.84, 1 - blockDamage / 220));
        if (block.hp <= 0) {
          block.mesh.setEnabled(false);
          destroyedParts += 1;
          addDebris(parts, block.mesh.position.clone(), block.mesh, critical ? 9 : 6, critical ? 6 : 4.2);
          const above = targets.filter((candidate) => candidate.mesh.isEnabled() && candidate.y > block.y + .5 && Math.abs(candidate.x - block.x) < block.width * .7).sort((left, right) => left.y - right.y)[0];
          if (above && critical) {
            above.hp -= 8;
            above.mesh.rotation.z += (Math.random() - .5) * .18;
          }
        } else {
          block.mesh.rotation.z += (Math.random() - .5) * .05;
        }
      }
      const damage = nearestDistance <= projectile.radius
        ? impactDamage(active.input.projectileId, directHit ? 0 : nearestDistance, directHit, critical, Boolean(active.input.powerShot), shotTiming)
        : 0;
      addExplosion(parts, position, active.input.projectileId, critical);
      propsRef.current.onSound(critical ? "critical" : "explosion", critical ? 1 : .82);
      if (destroyedParts) propsRef.current.onSound("collapse", Math.min(1, destroyedParts * .3));
      active.mesh?.dispose();
      active.trail.forEach((mesh) => mesh.dispose());
      shotRef.current = null;
      const resetCameraTimer = window.setTimeout(() => {
        if (disposed) return;
        parts.camera.setTarget(new Vector3(0, 2.35, 0));
        parts.camera.radius = 36;
      }, 580);
      void resetCameraTimer;
      propsRef.current.onShotComplete({
        shooter: active.input.shooter,
        damage,
        critical,
        directHit,
        hitPart: hitBlock?.id ?? null,
        destroyedParts,
        flightMs: Math.round(active.state.elapsed * 1000),
        impact: { x: position.x, y: position.y, z: position.z },
        projectileId: active.input.projectileId,
        powerShot: Boolean(active.input.powerShot),
      });
    };

    engine.runRenderLoop(() => {
      if (disposed) return;
      const now = performance.now();
      const active = shotRef.current;
      const activeState = active?.state;
      const nearCastle = Boolean(activeState && Math.abs(activeState.x) > 8.6);
      const timeScale = nearCastle && (active?.input.powerShot || Math.abs((activeState?.y ?? 0) - 3.4) < 2.2) ? .38 : 1;
      const delta = Math.min(.032, Math.max(.001, (now - lastFrame) / 1000)) * timeScale;
      lastFrame = now;
      const playerAngle = propsRef.current.angle;
      setBarrelAngle(parts.playerBarrel, "PLAYER", playerAngle, active?.input.shooter === "PLAYER" && active.launchedAt && now - active.launchedAt < 180 ? .16 : 0);

      const guideKey = `${propsRef.current.angle.toFixed(2)}-${propsRef.current.power.toFixed(3)}-${propsRef.current.wind.toFixed(1)}-${propsRef.current.projectileId}-${propsRef.current.showGuide}`;
      if (guideKey !== lastGuide) {
        lastGuide = guideKey;
        parts.guide.setEnabled(propsRef.current.showGuide && !active);
        if (propsRef.current.showGuide && !active) {
          const points = predictTowerTrajectory({ shooter: "PLAYER", angle: propsRef.current.angle, power: propsRef.current.power, projectileId: propsRef.current.projectileId }, propsRef.current.wind)
            .slice(0, 34)
            .map((point) => new Vector3(point.x, point.y, point.z));
          if (points.length > 1) MeshBuilder.CreateDashedLines("trajectory-guide", { points, dashSize: .28, gapSize: .18, dashNb: 40, instance: parts.guide });
        }
      }

      if (active && active.launchedAt === null) {
        const windup = now - active.requestedAt;
        const barrel = active.input.shooter === "PLAYER" ? parts.playerBarrel : parts.aiBarrel;
        setBarrelAngle(barrel, active.input.shooter, active.input.angle, Math.max(0, .12 - windup / 1800));
        if (windup >= 260) {
          active.launchedAt = now;
          active.state = launchProjectile(active.input, shotOrigin(active.input));
          const projectile = towerProjectileById(active.input.projectileId);
          const skin = TOWER_PROJECTILE_SKINS.find((item) => item.id === propsRef.current.projectileSkinId) ?? TOWER_PROJECTILE_SKINS[0];
          const ball = MeshBuilder.CreateSphere(`projectile-${now}`, { diameter: active.input.powerShot ? .62 : .46, segments: 16 }, scene);
          ball.material = glowMaterial(scene, `projectile-material-${now}`, active.input.powerShot ? skin.tint : projectile.color);
          ball.position.set(active.state.x, active.state.y, active.state.z);
          active.mesh = ball;
          propsRef.current.onSound("launch", active.input.powerShot ? 1 : .74);
        }
      }

      if (active?.state && active.mesh) {
        const substeps = 3;
        let impact: { position: Vector3; block: CastleBlock | null } | null = null;
        for (let index = 0; index < substeps && !impact; index++) {
          stepProjectile(active.state, delta / substeps, propsRef.current.wind, active.input.projectileId);
          const targetBlocks = parts.blocks.filter((block) => block.side !== active.input.shooter && block.mesh.isEnabled());
          const hit = targetBlocks.find((block) => Math.abs(active.state!.x - block.x) <= block.width / 2 + .2 && Math.abs(active.state!.y - block.y) <= block.height / 2 + .2 && Math.abs(active.state!.z - block.z) <= block.depth / 2 + .2);
          if (hit) impact = { position: new Vector3(active.state.x, active.state.y, active.state.z), block: hit };
          else if (active.state.y <= .22 || Math.abs(active.state.x) > 20.5) impact = { position: new Vector3(active.state.x, Math.max(.2, active.state.y), active.state.z), block: null };
        }
        active.mesh.position.set(active.state.x, active.state.y, active.state.z);
        active.mesh.rotation.x += delta * 9;
        active.mesh.rotation.z += delta * 13;
        if (Math.floor(active.state.elapsed * 24) > active.trail.length && active.trail.length < 80) {
          const trail = MeshBuilder.CreateSphere(`trail-${now}`, { diameter: active.input.powerShot ? .22 : .12, segments: 6 }, scene);
          trail.position.copyFrom(active.mesh.position);
          trail.material = glowMaterial(scene, `trail-material-${now}`, towerProjectileById(active.input.projectileId).glow, .48);
          active.trail.push(trail);
        }
        active.trail.forEach((mesh, index) => { mesh.scaling.setAll(Math.max(.08, index / Math.max(1, active.trail.length))); });
        parts.camera.setTarget(Vector3.Lerp(parts.camera.target, active.mesh.position, .085));
        parts.camera.radius += (22 - parts.camera.radius) * .04;
        if (impact) finishShot(active, impact.position, impact.block);
      }

      for (let index = parts.debris.length - 1; index >= 0; index--) {
        const item = parts.debris[index];
        item.life -= delta;
        item.velocity.y -= (item.smoke ? -.25 : 8.8) * delta;
        item.mesh.position.addInPlace(item.velocity.scale(delta));
        item.mesh.rotation.x += item.spin.x * delta;
        item.mesh.rotation.y += item.spin.y * delta;
        item.mesh.rotation.z += item.spin.z * delta;
        if (item.smoke) item.mesh.scaling.scaleInPlace(1 + delta * .55);
        if (item.mesh.material instanceof StandardMaterial) item.mesh.material.alpha = Math.max(0, Math.min(item.mesh.material.alpha, item.life));
        if (item.life <= 0 || item.mesh.position.y < -.5) {
          item.mesh.dispose();
          parts.debris.splice(index, 1);
        }
      }
      for (const drop of parts.rain) {
        drop.position.y -= delta * 13;
        drop.position.x -= delta * 1.5;
        if (drop.position.y < 0) {
          drop.position.y = 14;
          drop.position.x = (drop.position.x + 31) % 44 - 22;
        }
      }
      scene.render();
    });

    const resize = () => engine.resize();
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      partsRef.current = null;
      scene.dispose();
      engine.dispose();
    };
  }, [props.arenaId, props.cannonId, props.castleId, props.projectileSkinId]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full touch-none outline-none ${props.interactive ? "cursor-crosshair" : "cursor-default"}`}
      onPointerDown={(event) => {
        if (!props.interactive) return;
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, angle: props.angle, power: props.power };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !props.interactive) return;
        props.onAimChange(Math.max(16, Math.min(76, drag.angle - (event.clientY - drag.y) * .18)));
        props.onPowerChange(Math.max(.32, Math.min(1, drag.power + (event.clientX - drag.x) / 420)));
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      aria-label="Interactive 3D Tower Clash battlefield"
    />
  );
});
