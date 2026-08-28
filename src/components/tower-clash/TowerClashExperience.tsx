"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bomb,
  Bot,
  Castle,
  ChevronRight,
  Coins,
  Crown,
  Crosshair,
  Loader2,
  Lock,
  Medal,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Wind,
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { gameplayRequest } from "@/lib/gameplayClient";
import {
  TOWER_ACHIEVEMENTS,
  TOWER_ARENAS,
  TOWER_CANNONS,
  TOWER_CASTLES,
  TOWER_MISSIONS,
  TOWER_PROJECTILES,
  TOWER_PROJECTILE_SKINS,
  TOWER_TIERS,
  towerProjectileById,
  towerTierById,
  type TowerProjectileId,
  type TowerSide,
} from "@/lib/tower-clash/constants";
import { nextWind, planTowerAiShot } from "@/lib/tower-clash/physics";
import { SimpleGameLobby } from "@/components/games/SimpleGameLobby";
import type { TowerClashArenaHandle, TowerShotReport } from "@/components/tower-clash/TowerClashArena";
import { preloadGameRenderer, useIdleGamePreload } from "@/lib/gamePerformance";
import { triggerGameCinematic } from "@/lib/gameCinematics";

const TowerClashArena = dynamic(() => import("@/components/tower-clash/TowerClashArena").then((module) => module.TowerClashArena), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-[#050506]">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-300" />
        <p className="mt-3 text-[9px] font-black uppercase tracking-[.3em] text-white/35">Raising the battlefield</p>
      </div>
    </div>
  ),
});
const preloadTowerClashArena = () => preloadGameRenderer(TowerClashArena);

type Phase = "lobby" | "authorizing" | "versus" | "playing" | "settling" | "result" | "error";
type TowerProfile = {
  level: number;
  xp: number;
  rank: string;
  rankPoints: number;
  wins: number;
  losses: number;
  winStreak: number;
  bestWinStreak: number;
  castlesDestroyed: number;
  damageDealt: number;
  criticalHits: number;
  projectilesFired: number;
  abilitiesUsed: number;
  bestVictoryMs: number | null;
  highestDamageShot: number;
  selectedCannonId: string;
  selectedProjectileSkinId: string;
  selectedCastleId: string;
  selectedArenaId: string;
  daily: { damage: number; criticals: number; wins: number };
};
type TowerSession = { token: string; playerId: string; username: string; profile: TowerProfile; error?: string };
type TowerOpponent = { id: string; username: string; title: string; rank: string; level: number; isBot: true };
type TowerMatch = { matchId: string; tierId: string; startAt: number; environmentSeed: number; opponent: TowerOpponent; aiFavored: boolean };
type TowerResult = { winnerId: string; winnerName: string; xpAwarded: number; creditsAwarded: number; rankDelta: number; durationMs: number; profile: TowerProfile };
type BattleStats = { shots: number; hits: number; damageDealt: number; criticalHits: number; partsDestroyed: number; abilitiesUsed: number; maxDamage: number };

const previewProfile: TowerProfile = {
  level: 1,
  xp: 0,
  rank: "Rookie",
  rankPoints: 0,
  wins: 0,
  losses: 0,
  winStreak: 0,
  bestWinStreak: 0,
  castlesDestroyed: 0,
  damageDealt: 0,
  criticalHits: 0,
  projectilesFired: 0,
  abilitiesUsed: 0,
  bestVictoryMs: null,
  highestDamageShot: 0,
  selectedCannonId: "oak-breaker",
  selectedProjectileSkinId: "forged",
  selectedCastleId: "highland-keep",
  selectedArenaId: "moonfall",
  daily: { damage: 0, criticals: 0, wins: 0 },
};

function emptyStats(): BattleStats {
  return { shots: 0, hits: 0, damageDealt: 0, criticalHits: 0, partsDestroyed: 0, abilitiesUsed: 0, maxDamage: 0 };
}

function formatDuration(milliseconds: number | null) {
  if (!milliseconds) return "—";
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function HealthBar({ label, health, maximum, enemy = false }: { label: string; health: number; maximum: number; enemy?: boolean }) {
  const percentage = Math.max(0, Math.min(100, health / maximum * 100));
  return (
    <div className={`min-w-0 flex-1 ${enemy ? "text-right" : ""}`}>
      <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-[.16em]">
        <span className={enemy ? "order-2 text-rose-200" : "text-cyan-200"}>{label}</span>
        <span className="text-white/45">{Math.ceil(health)} / {maximum}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full border border-white/10 bg-black/55">
        <div className={`h-full transition-[width] duration-700 ${enemy ? "ml-auto bg-gradient-to-l from-rose-400 to-orange-400" : "bg-gradient-to-r from-cyan-300 to-emerald-300"}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function TowerClashExperience() {
  useIdleGamePreload(preloadTowerClashArena);
  const router = useRouter();
  const wallet = useWallet();
  const arenaRef = useRef<TowerClashArenaHandle | null>(null);
  const timersRef = useRef<number[]>([]);
  const turnRef = useRef<TowerSide>("PLAYER");
  const healthRef = useRef({ player: 100, ai: 90, playerMax: 100, aiMax: 90 });
  const abilityRef = useRef({ player: 0, ai: 0 });
  const statsRef = useRef<BattleStats>(emptyStats());
  const audioRef = useRef<{ context: AudioContext; drone: OscillatorNode; gain: GainNode } | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [tierId, setTierId] = useState("warfront");
  const [session, setSession] = useState<TowerSession | null>(null);
  const [match, setMatch] = useState<TowerMatch | null>(null);
  const [opponent, setOpponent] = useState<TowerOpponent | null>(null);
  const [result, setResult] = useState<TowerResult | null>(null);
  const [turn, setTurnState] = useState<TowerSide>("PLAYER");
  const [playerHealth, setPlayerHealth] = useState(100);
  const [aiHealth, setAiHealth] = useState(110);
  const [playerMaxHealth, setPlayerMaxHealth] = useState(100);
  const [aiMaxHealth, setAiMaxHealth] = useState(110);
  const [playerAbility, setPlayerAbility] = useState(0);
  const [aiAbility, setAiAbility] = useState(0);
  const [powerShotArmed, setPowerShotArmed] = useState(false);
  const [angle, setAngle] = useState(43);
  const [power, setPower] = useState(.7);
  const [timing, setTiming] = useState(.5);
  const [wind, setWind] = useState(0);
  const [turnNumber, setTurnNumber] = useState(0);
  const [projectileId, setProjectileId] = useState<TowerProjectileId>("iron-shot");
  const [shotInMotion, setShotInMotion] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [message, setMessage] = useState("Drag the battlefield to tune angle and power");
  const [countdown, setCountdown] = useState("3");
  const [lastDamage, setLastDamage] = useState<{ side: TowerSide; amount: number; critical: boolean; key: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [cannonId, setCannonId] = useState("oak-breaker");
  const [castleId, setCastleId] = useState("highland-keep");
  const [arenaId, setArenaId] = useState("moonfall");
  const [projectileSkinId, setProjectileSkinId] = useState("forged");
  const [displayStats, setDisplayStats] = useState<BattleStats>(emptyStats());

  const tier = useMemo(() => towerTierById(tierId), [tierId]);
  const profile = session?.profile ?? previewProfile;
  const playerName = session?.username?.toUpperCase() ?? (wallet.user.role === "USER" ? wallet.user.username.toUpperCase() : "YOUR KINGDOM");
  const bossName = opponent?.username ?? tier.boss;
  const availableProjectiles = useMemo(() => TOWER_PROJECTILES.filter((item) => profile.level >= item.level), [profile.level]);
  const playerWon = Boolean(result && result.winnerId === session?.playerId);
  const xpFloor = (profile.level - 1) * 2000;
  const xpProgress = Math.max(0, Math.min(100, (profile.xp - xpFloor) / 2000 * 100));

  const setBattleTurn = (next: TowerSide) => {
    turnRef.current = next;
    setTurnState(next);
  };

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    if (audioRef.current) {
      audioRef.current.drone.stop();
      void audioRef.current.context.close();
    }
  }, []);

  useEffect(() => {
    if (phase !== "versus" || !match) return;
    const tick = () => {
      const remaining = match.startAt - Date.now();
      setCountdown(remaining > 2000 ? "3" : remaining > 1200 ? "2" : remaining > 420 ? "1" : "FIRE!");
      if (remaining <= 0) {
        setPhase("playing");
        setMessage("Your opening salvo · read the wind");
      }
    };
    tick();
    const timer = window.setInterval(tick, 70);
    return () => window.clearInterval(timer);
  }, [match, phase]);

  useEffect(() => {
    if (wallet.user.role !== "USER" || session) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/tower-clash/session", { method: "POST", credentials: "same-origin" })
        .then(async (response) => response.ok ? response.json() as Promise<TowerSession> : null)
        .then((payload) => {
          if (!payload) return;
          setSession(payload);
          setCannonId(payload.profile.selectedCannonId);
          setCastleId(payload.profile.selectedCastleId);
          setArenaId(payload.profile.selectedArenaId);
          setProjectileSkinId(payload.profile.selectedProjectileSkinId);
        })
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session, wallet.user.role]);

  const ensureAudio = () => {
    if (audioRef.current || muted || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const drone = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    drone.type = "sawtooth";
    drone.frequency.value = 46;
    filter.type = "lowpass";
    filter.frequency.value = 150;
    gain.gain.value = .018;
    drone.connect(filter).connect(gain).connect(context.destination);
    drone.start();
    audioRef.current = { context, drone, gain };
  };

  const playSound = useCallback((kind: "launch" | "explosion" | "critical" | "collapse" | "wind", intensity: number) => {
    if (muted || !audioRef.current) return;
    const { context } = audioRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "critical" ? "sawtooth" : kind === "explosion" || kind === "collapse" ? "square" : "triangle";
    const frequency = kind === "launch" ? 92 : kind === "explosion" ? 46 : kind === "critical" ? 260 : kind === "collapse" ? 58 : 180;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, frequency * .28), context.currentTime + (kind === "critical" ? .42 : .22));
    gain.gain.setValueAtTime(Math.max(.008, intensity * (kind === "explosion" ? .105 : .062)), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + (kind === "critical" ? .52 : .28));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (kind === "critical" ? .55 : .3));
  }, [muted]);

  const resetBattle = (found: TowerMatch) => {
    arenaRef.current?.reset();
    const foundTier = towerTierById(found.tierId);
    const nextWindValue = nextWind(found.environmentSeed, 0);
    healthRef.current = { player: 100, ai: foundTier.bossHealth, playerMax: 100, aiMax: foundTier.bossHealth };
    abilityRef.current = { player: 0, ai: 0 };
    statsRef.current = emptyStats();
    setDisplayStats(emptyStats());
    setPlayerHealth(100);
    setAiHealth(foundTier.bossHealth);
    setPlayerMaxHealth(100);
    setAiMaxHealth(foundTier.bossHealth);
    setPlayerAbility(0);
    setAiAbility(0);
    setPowerShotArmed(false);
    setBattleTurn("PLAYER");
    setTurnNumber(0);
    setWind(nextWindValue);
    setAngle(43);
    setPower(.7);
    setTiming(.5);
    setProjectileId("iron-shot");
    setShotInMotion(false);
    setAiThinking(false);
    setResult(null);
    setLastDamage(null);
    setError("");
  };

  const startBattle = async () => {
    ensureAudio();
    if (wallet.user.role !== "USER") {
      router.push(`/login?next=${encodeURIComponent(`/play/tower-clash?tier=${tierId}`)}`);
      return;
    }
    if (wallet.balance < tier.entry) {
      setError(`You need ${tier.entry.toLocaleString()} credits to enter ${tier.name}.`);
      return;
    }
    setPhase("authorizing");
    setError("");
    try {
      let authorized = session;
      if (!authorized) {
        const response = await fetch("/api/tower-clash/session", { method: "POST", credentials: "same-origin" });
        const payload = await response.json() as TowerSession;
        if (!response.ok) throw new Error(payload.error || "Tower Clash authorization failed.");
        authorized = payload;
        setSession(payload);
      }
      const started = await gameplayRequest<{ match: TowerMatch }>("tower-clash", {
        action: "START", tierId, cannonId, castleId, arenaId, projectileSkinId, excludeOpponentName: opponent?.username,
      });
      const found = started.match;
      setMatch(found); setOpponent(found.opponent); setTierId(found.tierId); resetBattle(found); setPhase("versus");
      triggerGameCinematic({ kind: "versus", game: "TOWER CLASH", kicker: `${tier.name.toUpperCase()} · SIEGE`, left: authorized.username, leftMeta: "YOUR STRONGHOLD", right: found.opponent.username, rightMeta: found.opponent.rank, accent: "#fb923c", accent2: "#f43f5e", icon: "swords", durationMs: 3400 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enter the royal battlefield.");
      setPhase("error");
    }
  };

  const finishBattle = async (winner: TowerSide) => {
    if (!match || !session) return;
    setPhase("settling");
    setMessage(winner === "PLAYER" ? "Enemy stronghold destroyed" : "Your final tower has fallen");
    try {
      const settled = await gameplayRequest<{ result: TowerResult }>("tower-clash", {
        action: "FINISH", matchId: match.matchId, winner, stats: statsRef.current,
      });
      setResult(settled.result);
      setSession((current) => current ? { ...current, profile: settled.result.profile } : current);
      triggerGameCinematic({ kind: settled.result.winnerId === session.playerId ? "win" : "loss", game: "TOWER CLASH", kicker: "SIEGE COMPLETE", center: settled.result.winnerId === session.playerId ? "FORTRESS DOWN" : "TOWER FALLEN", accent: "#fb923c", accent2: "#f43f5e", icon: "swords", durationMs: 2200 });
      setPhase("result"); setShotInMotion(false); setAiThinking(false); void wallet.refreshWallet();
      playSound(settled.result.winnerId === session.playerId ? "critical" : "collapse", 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The battle result could not be verified.");
      setPhase("error");
    }
  };

  const takeAiShot = (nextTurnNumber: number, nextWindValue: number, aiHealthAfterHit: number) => {
    setAiThinking(true);
    const enraged = aiHealthAfterHit <= healthRef.current.aiMax * .5;
    setMessage(enraged ? `${bossName} enters ENRAGED phase` : `${bossName} calculates a counter-siege`);
    const timer = window.setTimeout(() => {
      const currentTier = towerTierById(match?.tierId ?? tierId);
      const projectileChoices: TowerProjectileId[] = currentTier.id === "frontier"
        ? ["iron-shot", "blast-core"]
        : currentTier.id === "warfront"
          ? ["iron-shot", "blast-core", "fire-orb"]
          : ["blast-core", "fire-orb", "cluster-shell", "royal-bomb"];
      const plan = planTowerAiShot({
        wind: nextWindValue,
        targetY: 2.4 + Math.random() * 2,
        accuracy: Math.min(.94, currentTier.accuracy + (enraged ? .08 : 0) + nextTurnNumber * .006),
        favored: Boolean(match?.aiFavored),
        availableProjectiles: projectileChoices,
        abilityReady: abilityRef.current.ai >= 100,
      });
      setAngle(plan.angle);
      setPower(plan.power);
      setProjectileId(plan.projectileId);
      setMessage(`${bossName} loads ${towerProjectileById(plan.projectileId).name}${plan.powerShot ? " · BOSS POWER" : ""}`);
      const fireTimer = window.setTimeout(() => {
        if (plan.powerShot) {
          abilityRef.current.ai = 0;
          setAiAbility(0);
        }
        setAiThinking(false);
        arenaRef.current?.shoot({ shooter: "AI", angle: plan.angle, power: plan.power, projectileId: plan.projectileId, powerShot: plan.powerShot, timing: match?.aiFavored ? .92 : .74 });
      }, 900);
      timersRef.current.push(fireTimer);
    }, 850);
    timersRef.current.push(timer);
  };

  const handleShotComplete = (report: TowerShotReport) => {
    setShotInMotion(false);
    const nextTurnNumber = turnNumber + 1;
    setTurnNumber(nextTurnNumber);
    const target = report.shooter === "PLAYER" ? "AI" : "PLAYER";
    const currentHealth = target === "AI" ? healthRef.current.ai : healthRef.current.player;
    const nextHealth = Math.max(0, currentHealth - report.damage);
    if (target === "AI") {
      healthRef.current.ai = nextHealth;
      setAiHealth(nextHealth);
    } else {
      healthRef.current.player = nextHealth;
      setPlayerHealth(nextHealth);
    }
    const meterSide = report.shooter === "PLAYER" ? "player" : "ai";
    const nextMeter = Math.min(100, abilityRef.current[meterSide] + (report.directHit ? 22 + report.damage * 1.25 : 12));
    abilityRef.current[meterSide] = nextMeter;
    if (meterSide === "player") setPlayerAbility(nextMeter);
    else setAiAbility(nextMeter);
    setLastDamage({ side: target, amount: report.damage, critical: report.critical, key: Date.now() });

    if (report.shooter === "PLAYER") {
      statsRef.current.shots += 1;
      statsRef.current.hits += report.damage > 0 ? 1 : 0;
      statsRef.current.damageDealt += report.damage;
      statsRef.current.criticalHits += report.critical ? 1 : 0;
      statsRef.current.partsDestroyed += report.destroyedParts;
      statsRef.current.abilitiesUsed += report.powerShot ? 1 : 0;
      statsRef.current.maxDamage = Math.max(statsRef.current.maxDamage, report.damage);
      setDisplayStats({ ...statsRef.current });
    }
    if (nextHealth <= 0) {
      const finishTimer = window.setTimeout(() => finishBattle(report.shooter), 1150);
      timersRef.current.push(finishTimer);
      return;
    }
    const nextTurn: TowerSide = report.shooter === "PLAYER" ? "AI" : "PLAYER";
    const nextWindValue = nextWind(match?.environmentSeed ?? 1, nextTurnNumber);
    setWind(nextWindValue);
    setBattleTurn(nextTurn);
    setMessage(report.directHit
      ? `${report.critical ? "CRITICAL HIT" : "Impact"} · ${report.damage} damage${report.destroyedParts ? ` · ${report.destroyedParts} structures collapsed` : ""}`
      : "Missed the walls · adjust for wind and range");
    if (nextTurn === "AI") takeAiShot(nextTurnNumber, nextWindValue, nextHealth);
    else {
      setAngle(43);
      setPower(.7);
      setProjectileId("iron-shot");
    }
  };

  const fire = () => {
    if (phase !== "playing" || turn !== "PLAYER" || shotInMotion) return;
    const powerShot = powerShotArmed && playerAbility >= 100;
    const releaseQuality = Math.max(0, 1 - Math.abs(timing - .5) * 2);
    const fired = arenaRef.current?.shoot({ shooter: "PLAYER", angle, power, projectileId, powerShot, timing: releaseQuality });
    if (fired && powerShot) {
      abilityRef.current.player = 0;
      setPlayerAbility(0);
      setPowerShotArmed(false);
    }
  };

  useEffect(() => {
    if (phase !== "playing" || turn !== "PLAYER" || shotInMotion) return;
    const timer = window.setInterval(() => setTiming((Math.sin(performance.now() / 255) + 1) / 2), 45);
    return () => window.clearInterval(timer);
  }, [phase, shotInMotion, turn]);

  useEffect(() => {
    if (phase !== "playing" || turn !== "PLAYER") return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.code === "ArrowUp" || event.code === "KeyW") setAngle((value) => Math.min(76, value + 1));
      if (event.code === "ArrowDown" || event.code === "KeyS") setAngle((value) => Math.max(16, value - 1));
      if (event.code === "ArrowRight" || event.code === "KeyD") setPower((value) => Math.min(1, value + .02));
      if (event.code === "ArrowLeft" || event.code === "KeyA") setPower((value) => Math.max(.32, value - .02));
      if (event.code === "Space") { event.preventDefault(); fire(); }
      const number = Number(event.key);
      if (number >= 1 && number <= availableProjectiles.length) setProjectileId(availableProjectiles[number - 1].id);
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  const rematch = () => {
    setPhase("authorizing");
    setResult(null);
    void startBattle();
  };

  const backToLobby = () => {
    setPhase("lobby");
    setMatch(null);
    setOpponent(null);
    setResult(null);
    setError("");
  };

  if (String(phase) === "lobby") {
    return (
      <SimpleGameLobby
        name="Tower Clash"
        image="/images/games/tower-clash.webp"
        imageAlt="Two castle towers with a cannonball flying between them"
        tiers={TOWER_TIERS.map((item) => ({ id: item.id, name: item.name, entry: item.entry, reward: item.reward }))}
        selectedId={tierId}
        onSelect={(id) => {
          setTierId(id);
          setArenaId(towerTierById(id).arena);
        }}
        onPlay={() => void startBattle()}
        howTo={["Choose an amount", "Set angle and power", "Bring down the rival tower first"]}
        error={error}
      />
    );
  }

  return (
    <div className="game-screen fixed inset-0 z-[100] overflow-hidden bg-[#050405] text-white selection:bg-orange-300 selection:text-[#1a0902]">
      <TowerClashArena
        ref={arenaRef}
        interactive={phase === "playing" && turn === "PLAYER" && !shotInMotion}
        showGuide={phase === "playing" && turn === "PLAYER" && !shotInMotion}
        angle={angle}
        power={power}
        wind={wind}
        projectileId={projectileId}
        cannonId={cannonId}
        castleId={castleId}
        arenaId={arenaId}
        projectileSkinId={projectileSkinId}
        onAimChange={setAngle}
        onPowerChange={setPower}
        onShotStart={() => { setShotInMotion(true); setMessage(turn === "PLAYER" ? "Cannon fired" : `${bossName} fires`); }}
        onShotComplete={handleShotComplete}
        onSound={playSound}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,2,2,.65),transparent_24%,transparent_67%,rgba(3,2,2,.88))]" />

      <header className="game-safe-top pointer-events-none absolute inset-x-0 z-30 flex items-center justify-between px-3 sm:px-6">
        <button onClick={() => phase === "lobby" ? router.push("/play") : backToLobby()} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/48 text-white/75 backdrop-blur-xl" aria-label="Leave Tower Clash"><ArrowLeft className="h-4 w-4" /></button>
        <div className="flex items-center gap-2 rounded-full border border-orange-200/20 bg-black/50 px-4 py-2 text-[8px] font-black uppercase tracking-[.22em] text-orange-100 backdrop-blur-xl"><Castle className="h-3.5 w-3.5 text-orange-300" /> Tower Clash <span className="hidden text-white/25 sm:inline">· Royal Siege</span></div>
        <button onClick={() => setMuted((value) => !value)} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/48 text-white/75 backdrop-blur-xl" aria-label="Toggle battle audio">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
      </header>

      {(phase === "playing" || phase === "settling") && (
        <div className="pointer-events-none absolute inset-x-3 top-[66px] z-30 mx-auto max-w-[980px] rounded-2xl border border-white/10 bg-[#100b09]/78 px-3 py-3 shadow-2xl backdrop-blur-xl sm:top-[78px] sm:px-5">
          <div className="flex items-center gap-3 sm:gap-6">
            <HealthBar label={playerName} health={playerHealth} maximum={playerMaxHealth} />
            <div className="shrink-0 text-center"><p className="text-[7px] font-black uppercase tracking-[.2em] text-amber-200">{aiThinking ? "Boss aiming" : `Volley ${turnNumber + 1}`}</p><Swords className="mx-auto mt-1 h-5 w-5 text-white/65" /><p className="mt-1 text-[6px] font-black uppercase tracking-widest text-rose-200">CPU skill {Math.round(aiAbility)}%</p></div>
            <HealthBar label={bossName} health={aiHealth} maximum={aiMaxHealth} enemy />
          </div>
        </div>
      )}

      {lastDamage && phase === "playing" && (
        <div key={lastDamage.key} className={`pointer-events-none absolute top-[34%] z-40 animate-drift-pop text-center ${lastDamage.side === "AI" ? "left-[72%]" : "left-[27%]"}`}>
          <p className={`text-4xl font-black italic ${lastDamage.critical ? "text-amber-200 drop-shadow-[0_0_20px_#fb923c]" : "text-white"}`}>-{lastDamage.amount}</p>
          <p className="text-[8px] font-black uppercase tracking-[.22em] text-white/55">{lastDamage.critical ? "Critical breach" : lastDamage.amount ? "Castle damage" : "Miss"}</p>
        </div>
      )}

      {phase === "playing" && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-[138px] z-30 -translate-x-1/2 sm:top-[152px]">
            <div className="flex items-center gap-2 rounded-full border border-white/12 bg-black/58 px-4 py-2 text-[8px] font-black uppercase tracking-[.16em] text-white/65 backdrop-blur-xl">
              <Wind className={`h-4 w-4 ${wind >= 0 ? "text-cyan-300" : "rotate-180 text-violet-300"}`} />
              Wind {Math.abs(wind).toFixed(1)} {wind >= 0 ? "→" : "←"}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-4 bottom-[198px] z-30 text-center sm:bottom-[172px]"><span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/62 px-4 py-2 text-[8px] font-black uppercase tracking-[.16em] text-white/65 backdrop-blur"><Crosshair className="h-3.5 w-3.5 text-orange-300" />{message}</span></div>
          <div className="game-safe-bottom absolute inset-x-2 z-40 mx-auto max-w-[1050px] rounded-2xl border border-white/10 bg-black/82 p-2.5 shadow-2xl backdrop-blur-xl sm:inset-x-4 sm:p-3">
            <div className="mb-2 flex items-center gap-2 px-1"><span className="shrink-0 text-[7px] font-black uppercase tracking-[.16em] text-white/35">Release timing</span><div className="relative h-1.5 flex-1 overflow-visible rounded-full bg-gradient-to-r from-rose-500/35 via-amber-300/80 to-rose-500/35"><span className="absolute left-1/2 top-1/2 h-3 w-[12%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/55 bg-amber-200/16" /><span className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_#fff]" style={{ left: `${timing * 100}%` }} /></div><b className={`w-12 text-right text-[7px] font-black uppercase ${Math.abs(timing - .5) < .1 ? "text-amber-200" : "text-white/35"}`}>{Math.abs(timing - .5) < .1 ? "Perfect" : "Time it"}</b></div>
            <div className="flex gap-2 overflow-x-auto pb-2 sm:justify-center">
              {availableProjectiles.map((projectile, index) => (
                <button key={projectile.id} onClick={() => setProjectileId(projectile.id)} disabled={turn !== "PLAYER" || shotInMotion} className={`min-w-[104px] rounded-xl border px-3 py-2 text-left transition ${projectileId === projectile.id ? "border-orange-300/60 bg-orange-300/12" : "border-white/10 bg-white/[.035]"}`}>
                  <p className="text-[7px] font-black uppercase tracking-widest text-white/35">{index + 1} · {projectile.damage} DMG</p>
                  <p className="mt-1 text-[9px] font-black text-white">{projectile.name}</p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[150px_1fr_1fr_150px]">
              <div className="hidden rounded-xl border border-white/10 bg-white/[.035] p-3 sm:block"><p className="text-[7px] font-black uppercase tracking-widest text-white/35">Royal power</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-400" style={{ width: `${playerAbility}%` }} /></div><p className="mt-1 text-[8px] font-black text-amber-200">{Math.round(playerAbility)}%</p></div>
              <label className="rounded-xl border border-white/10 bg-white/[.035] p-3 text-[7px] font-black uppercase tracking-widest text-white/35">Angle <b className="float-right text-orange-200">{Math.round(angle)}°</b><input aria-label="Cannon angle" type="range" min="16" max="76" step="1" value={angle} onChange={(event) => setAngle(Number(event.target.value))} disabled={turn !== "PLAYER" || shotInMotion} className="game-range mt-1 w-full accent-orange-400" /></label>
              <label className="rounded-xl border border-white/10 bg-white/[.035] p-3 text-[7px] font-black uppercase tracking-widest text-white/35">Power <b className="float-right text-cyan-200">{Math.round(power * 100)}%</b><input aria-label="Cannon power" type="range" min=".32" max="1" step=".01" value={power} onChange={(event) => setPower(Number(event.target.value))} disabled={turn !== "PLAYER" || shotInMotion} className="game-range mt-1 w-full accent-cyan-300" /></label>
              <div className="flex gap-2">
                <button onClick={() => setPowerShotArmed((value) => !value)} disabled={playerAbility < 100 || turn !== "PLAYER" || shotInMotion} className={`hidden h-[62px] rounded-xl border px-3 text-[8px] font-black uppercase tracking-wider sm:block ${powerShotArmed ? "border-amber-200 bg-amber-300 text-[#1b0c02]" : "border-amber-200/25 bg-amber-300/10 text-amber-200 disabled:opacity-35"}`}><Sparkles className="mx-auto mb-1 h-4 w-4" />Power</button>
                <button onClick={fire} disabled={turn !== "PLAYER" || shotInMotion} className="h-[62px] min-w-[94px] rounded-xl border border-orange-200/50 bg-gradient-to-b from-orange-300 to-rose-500 px-4 text-[10px] font-black uppercase tracking-[.14em] text-[#210803] shadow-[0_0_32px_rgba(251,113,133,.24)] disabled:opacity-40 sm:min-w-[116px]"><Bomb className="mx-auto mb-1 h-4 w-4" />Fire</button>
              </div>
            </div>
          </div>
        </>
      )}

      {phase === "lobby" && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-[linear-gradient(90deg,rgba(5,3,3,.97),rgba(5,3,3,.84)_54%,rgba(5,3,3,.24))] px-4 pb-16 pt-20 sm:px-7 lg:px-12">
          <div className="mx-auto grid min-h-full max-w-[1450px] items-center gap-8 py-7 xl:grid-cols-[1fr_420px]">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/20 bg-orange-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.24em] text-orange-100"><Castle className="h-3.5 w-3.5 text-orange-300" /> Premium 3D destruction battle</div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[.5em] text-rose-300">Aim. Fire. Conquer.</p>
              <h1 className="mt-2 text-[clamp(4.1rem,10vw,9rem)] font-black italic leading-[.72] tracking-[-.085em]">TOWER<br /><span className="bg-gradient-to-r from-orange-200 via-rose-300 to-violet-300 bg-clip-text text-transparent">CLASH</span></h1>
              <p className="mt-6 max-w-2xl text-base font-semibold leading-7 text-white/68 sm:text-lg">Command a siege cannon with real angle, power and wind. Shatter a CPU rival's fortress piece by piece—instantly, with no matchmaking.</p>
              <div className="mt-6 flex flex-wrap gap-2">{[{ icon: Bomb, label: "Destruction physics" }, { icon: Swords, label: "Expert CPU" }, { icon: Wind, label: "Dynamic wind" }, { icon: Sparkles, label: "Cinematic battles" }].map(({ icon: Icon, label }) => <span key={label} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[8px] font-black uppercase tracking-[.14em] text-white/60"><Icon className="h-3 w-3 text-orange-300" />{label}</span>)}</div>

              <div className="mt-7 max-w-3xl rounded-2xl border border-white/10 bg-black/62 p-4 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-white/35">Choose a credit battlefield</p><p className="mt-1 text-xs font-bold text-white/70">Entry, possible reward and battle rules lock before deployment</p></div><Coins className="h-5 w-5 text-amber-300" /></div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">{TOWER_TIERS.map((item) => <button key={item.id} onClick={() => { setTierId(item.id); setArenaId(item.arena); }} className={`rounded-xl border p-3 text-left transition ${tierId === item.id ? "border-orange-300/60 bg-orange-300/12 shadow-[0_0_24px_rgba(251,146,60,.12)]" : "border-white/10 bg-white/[.03] hover:border-white/25"}`}><p className="text-[7px] font-black uppercase tracking-widest text-white/40">{item.name}</p><p className="mt-2 text-lg font-black text-white">{item.entry.toLocaleString()} <small className="text-[7px] text-white/35">ENTRY</small></p><p className="mt-1 text-[8px] font-black text-amber-200">{item.reward.toLocaleString()} CR possible reward</p><p className="mt-2 text-[7px] font-black uppercase text-rose-300">Boss · {item.boss}</p></button>)}</div>
                <div className="mt-4 grid gap-2 text-[8px] font-bold leading-5 text-white/48 sm:grid-cols-2"><p>• Alternate cannon volleys until one castle reaches zero health</p><p>• Wind changes every turn and affects projectile travel</p><p>• Angle, power, projectile choice and timing decide damage</p><p>• Rewards are granted only for server-recorded completed victories</p></div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => void startBattle()} disabled={wallet.user.role === "USER" && wallet.balance < tier.entry} className="group inline-flex items-center justify-center gap-2 rounded-xl border border-orange-100/60 bg-gradient-to-r from-orange-300 to-rose-500 px-8 py-4 text-[11px] font-black uppercase tracking-[.16em] text-[#210803] shadow-[0_0_42px_rgba(251,113,133,.25)] disabled:opacity-45"><Swords className="h-4 w-4" />{wallet.user.role === "USER" ? `Battle for ${tier.entry.toLocaleString()} CR` : "Sign in to battle"}<ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" /></button>
                <div className="rounded-xl border border-white/10 bg-black/45 px-5 py-3 text-[8px] leading-5 text-white/40"><b className="block text-white/70">Selected: {tier.name}</b>Fictional CPU rival · possible reward {tier.reward.toLocaleString()} CR · virtual credits only</div>
              </div>
            </div>

            <aside className="space-y-3">
              <div className="rounded-[1.5rem] border border-white/10 bg-[#130d0b]/84 p-5 shadow-2xl backdrop-blur-xl"><div className="flex items-center justify-between"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-amber-300">{profile.rank}</p><h2 className="mt-1 text-xl font-black">{playerName}</h2><p className="mt-1 text-[9px] text-white/35">Level {profile.level} · {profile.xp.toLocaleString()} XP</p></div><div className="grid h-14 w-14 place-items-center rounded-2xl border border-orange-200/20 bg-orange-300/10"><Crown className="h-7 w-7 text-orange-300" /></div></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-orange-400 to-rose-400" style={{ width: `${xpProgress}%` }} /></div><div className="mt-4 grid grid-cols-4 gap-2">{[{ label: "Wins", value: profile.wins }, { label: "Castles", value: profile.castlesDestroyed }, { label: "Criticals", value: profile.criticalHits }, { label: "Streak", value: profile.winStreak }].map((stat) => <div key={stat.label} className="rounded-xl border border-white/[.07] bg-white/[.035] p-2 text-center"><p className="text-sm font-black">{stat.value}</p><p className="mt-1 text-[6px] font-black uppercase tracking-widest text-white/35">{stat.label}</p></div>)}</div><p className="mt-3 text-[8px] text-white/35">Personal best victory · <b className="text-orange-200">{formatDuration(profile.bestVictoryMs)}</b> · record shot <b className="text-rose-200">{profile.highestDamageShot}</b></p></div>
              <div className="rounded-2xl border border-white/10 bg-black/62 p-4 backdrop-blur"><p className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-violet-300"><Target className="h-4 w-4" /> Daily missions</p><div className="mt-3 space-y-2">{TOWER_MISSIONS.map((mission, index) => { const current = [profile.daily.damage, profile.daily.criticals, profile.daily.wins][index]; return <div key={mission.id}><div className="flex justify-between text-[8px]"><span className="font-bold text-white/60">{mission.description}</span><b className="text-amber-200">{Math.min(current, mission.target)}/{mission.target}</b></div><div className="mt-1 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-violet-400" style={{ width: `${Math.min(100, current / mission.target * 100)}%` }} /></div></div>; })}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/62 p-4 backdrop-blur"><p className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-amber-200"><Medal className="h-4 w-4" /> Arsenal & stronghold</p><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[7px] font-black uppercase text-white/35">Cannon<select value={cannonId} onChange={(event) => setCannonId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#160e0c] p-2 text-white">{TOWER_CANNONS.map((item) => <option key={item.id} value={item.id} disabled={profile.level < item.level}>{profile.level < item.level ? `Lv ${item.level} · ` : ""}{item.name}</option>)}</select></label><label className="text-[7px] font-black uppercase text-white/35">Castle<select value={castleId} onChange={(event) => setCastleId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#160e0c] p-2 text-white">{TOWER_CASTLES.map((item) => <option key={item.id} value={item.id} disabled={profile.level < item.level}>{profile.level < item.level ? `Lv ${item.level} · ` : ""}{item.name}</option>)}</select></label><label className="text-[7px] font-black uppercase text-white/35">Arena<select value={arenaId} onChange={(event) => setArenaId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#160e0c] p-2 text-white">{TOWER_ARENAS.map((item) => <option key={item.id} value={item.id} disabled={profile.level < item.level}>{profile.level < item.level ? `Lv ${item.level} · ` : ""}{item.name}</option>)}</select></label><label className="text-[7px] font-black uppercase text-white/35">Payload skin<select value={projectileSkinId} onChange={(event) => setProjectileSkinId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#160e0c] p-2 text-white">{TOWER_PROJECTILE_SKINS.map((item) => <option key={item.id} value={item.id} disabled={profile.level < item.level}>{profile.level < item.level ? `Lv ${item.level} · ` : ""}{item.name}</option>)}</select></label></div></div>
              <Link href="/leaderboard" className="flex items-center justify-between rounded-2xl border border-orange-300/15 bg-orange-300/[.05] px-4 py-3 text-[8px] font-black uppercase tracking-widest text-orange-200">View siege leaderboard <Trophy className="h-4 w-4" /></Link>
            </aside>
          </div>
        </div>
      )}

      {phase === "authorizing" && <div className="absolute inset-0 z-40 grid place-items-center bg-[#050303]/84 px-5 backdrop-blur-md"><div className="text-center"><div className="relative mx-auto grid h-24 w-24 place-items-center rounded-full border border-orange-300/25"><span className="absolute inset-3 animate-spin rounded-full border border-transparent border-t-orange-300 border-r-rose-400" /><Castle className="h-8 w-8 text-orange-200" /></div><p className="mt-5 text-[9px] font-black uppercase tracking-[.32em] text-orange-300">Deploying instantly</p><h2 className="mt-2 text-3xl font-black italic">SUMMONING BOSS AI</h2><p className="mt-2 text-xs text-white/40">No matchmaking · no waiting room</p></div></div>}

      {phase === "versus" && match && <div className="absolute inset-0 z-40 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(127,29,29,.28),rgba(3,2,3,.9)_64%)] px-5 backdrop-blur-sm"><div className="w-full max-w-4xl text-center"><p className="text-[9px] font-black uppercase tracking-[.4em] text-orange-300">{tier.name} · armies deployed</p><div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-5"><div><div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl border border-cyan-200/20 bg-cyan-300/10 text-2xl font-black text-cyan-200">{playerName.slice(0,2)}</div><h2 className="mt-4 text-2xl font-black">{playerName}</h2><p className="mt-1 text-[8px] font-black uppercase tracking-widest text-amber-200">{profile.rank}</p></div><div><p className="text-5xl font-black italic text-white/18">VS</p><p key={countdown} className="mt-5 animate-countdown-pop text-4xl font-black text-white">{countdown}</p></div><div><div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl border border-rose-200/20 bg-rose-300/10"><Bot className="h-10 w-10 text-rose-200" /></div><h2 className="mt-4 text-2xl font-black">{bossName}</h2><p className="mt-1 text-[8px] font-black uppercase tracking-widest text-rose-200">CPU rival · {opponent?.title}</p></div></div><div className="mx-auto mt-7 w-fit rounded-full border border-amber-200/20 bg-amber-300/[.08] px-5 py-2 text-[8px] font-black uppercase tracking-[.18em] text-amber-100">Entry {tier.entry.toLocaleString()} CR · possible reward {tier.reward.toLocaleString()} CR</div></div></div>}

      {phase === "settling" && <div className="absolute inset-0 z-40 grid place-items-center bg-black/58 backdrop-blur-sm"><div className="rounded-[2rem] border border-white/12 bg-[#160d0b]/95 p-8 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-300" /><h2 className="mt-4 text-3xl font-black italic">BATTLE VERIFIED</h2><p className="mt-2 text-xs text-white/40">Updating credits, XP, rank and missions…</p></div></div>}

      {phase === "result" && result && <div className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-[#030203]/84 px-4 py-16 backdrop-blur-md"><div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/12 bg-[radial-gradient(circle_at_50%_0%,rgba(251,146,60,.2),transparent_37%),rgba(15,8,7,.97)] p-7 text-center shadow-[0_40px_120px_rgba(0,0,0,.75)] sm:p-10"><div className={`mx-auto grid h-20 w-20 place-items-center rounded-3xl border ${playerWon ? "border-amber-200/30 bg-amber-300/10" : "border-rose-200/20 bg-rose-300/10"}`}>{playerWon ? <Crown className="h-10 w-10 text-amber-300" /> : <Shield className="h-10 w-10 text-rose-300" />}</div><p className="mt-5 text-[9px] font-black uppercase tracking-[.34em] text-orange-300">Battle complete · {formatDuration(result.durationMs)}</p><h2 className="mt-2 text-5xl font-black italic tracking-[-.06em] sm:text-7xl">{playerWon ? "CASTLE CONQUERED" : "YOUR TOWER FALLS"}</h2><p className="mt-3 text-sm text-white/45">{playerWon ? "The enemy banner is down. Your siege strategy broke the stronghold." : "Adjust for the wind, target weak points, and launch an instant counter-siege."}</p><div className="mt-6 grid grid-cols-4 gap-2">{[{ label: "Damage", value: displayStats.damageDealt }, { label: "Criticals", value: displayStats.criticalHits }, { label: "Collapsed", value: displayStats.partsDestroyed }, { label: "Best hit", value: displayStats.maxDamage }].map((stat) => <div key={stat.label} className="rounded-xl border border-white/[.08] bg-white/[.035] py-3"><p className="text-xl font-black">{stat.value}</p><p className="mt-1 text-[6px] font-black uppercase tracking-widest text-white/35">{stat.label}</p></div>)}</div><div className="mt-5 flex flex-wrap justify-center gap-4 text-[9px] font-black uppercase tracking-widest"><span className="text-orange-200">+{result.xpAwarded} XP</span><span className={result.rankDelta >= 0 ? "text-emerald-300" : "text-rose-300"}>{result.rankDelta >= 0 ? "+" : ""}{result.rankDelta} RP</span>{result.creditsAwarded > 0 && <span className="text-amber-200">+{result.creditsAwarded.toLocaleString()} CR</span>}</div><div className="mt-7 grid gap-2 sm:grid-cols-2"><button onClick={rematch} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-300 to-rose-500 px-6 py-4 text-[11px] font-black uppercase tracking-[.16em] text-[#210803] shadow-[0_0_35px_rgba(251,113,133,.25)]"><RotateCcw className="h-4 w-4" /> Play again</button><button onClick={backToLobby} className="rounded-xl border border-white/15 bg-white/[.04] px-6 py-4 text-[9px] font-black uppercase tracking-[.16em] text-white/70">Battle lobby</button></div><div className="mt-5 grid grid-cols-6 gap-1">{TOWER_ACHIEVEMENTS.map((achievement) => <div key={achievement.id} title={achievement.description} className="rounded-lg border border-white/[.06] bg-white/[.025] py-2 text-center"><span className="text-sm text-amber-200">{achievement.icon}</span><p className="mt-1 hidden text-[5px] font-black uppercase text-white/25 sm:block">{achievement.name}</p></div>)}</div></div></div>}

      {phase === "error" && <div className="absolute inset-0 z-50 grid place-items-center bg-[#050303]/9 px-5 backdrop-blur-md"><div className="w-full max-w-md rounded-[1.5rem] border border-rose-300/20 bg-[#17090a]/96 p-7 text-center"><Lock className="mx-auto h-8 w-8 text-rose-300" /><h2 className="mt-4 text-2xl font-black italic">BATTLEFIELD UNAVAILABLE</h2><p className="mt-3 text-xs leading-6 text-white/55">{error || "The battle could not start."}</p><button onClick={backToLobby} className="mt-6 rounded-xl border border-white/15 bg-white/[.06] px-6 py-3 text-[9px] font-black uppercase tracking-widest">Back to lobby</button></div></div>}
      {error && phase === "lobby" && <div className="absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-rose-300/25 bg-black/80 px-5 py-2 text-[8px] font-bold text-rose-100">{error}</div>}
    </div>
  );
}
