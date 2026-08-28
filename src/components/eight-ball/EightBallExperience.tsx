"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  CircleDot,
  Coins,
  Crown,
  Crosshair,
  Gauge,
  Loader2,
  Lock,
  Medal,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
  Pause,
  Play,
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { gameplayRequest } from "@/lib/gameplayClient";
import {
  BALL_SKINS,
  POOL_ACHIEVEMENTS,
  POOL_CUES,
  POOL_MISSIONS,
  POOL_TABLES,
  POOL_TIERS,
  ballGroup,
  oppositeGroup,
  poolTierById,
  type BallGroup,
  type PoolTurn,
} from "@/lib/eight-ball/constants";
import { planAiShot, type PoolBallState, type SpinInput } from "@/lib/eight-ball/physics";
import type { EightBallArenaHandle, PoolShotReport } from "@/components/eight-ball/EightBallArena";
import { SimpleGameLobby } from "@/components/games/SimpleGameLobby";
import { preloadGameRenderer, useIdleGamePreload } from "@/lib/gamePerformance";
import { triggerGameCinematic } from "@/lib/gameCinematics";

const EightBallArena = dynamic(() => import("@/components/eight-ball/EightBallArena").then((module) => module.EightBallArena), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-[#03050a]"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" /><p className="mt-3 text-[9px] font-black uppercase tracking-[.3em] text-white/35">Polishing the table</p></div></div>,
});
const preloadEightBallArena = () => preloadGameRenderer(EightBallArena);

type Phase = "lobby" | "authorizing" | "versus" | "playing" | "settling" | "result" | "error";
type PoolProfile = {
  level: number;
  xp: number;
  rank: string;
  rankPoints: number;
  wins: number;
  losses: number;
  winStreak: number;
  bestWinStreak: number;
  ballsPotted: number;
  bankShots: number;
  breakAndRuns: number;
  fouls: number;
  bestClearanceMs: number | null;
  selectedCueId: string;
  selectedTableId: string;
  selectedBallSkinId: string;
  daily: { pots: number; banks: number; wins: number };
};
type PoolSession = { token: string; playerId: string; username: string; profile: PoolProfile; error?: string };
type PoolOpponent = { id: string; username: string; rank: string; level: number; winStreak: number; isBot: true };
type PoolMatch = { matchId: string; tierId: string; startAt: number; environmentSeed: number; opponent: PoolOpponent; aiFavored: boolean };
type PoolResult = {
  winnerId: string;
  winnerName: string;
  xpAwarded: number;
  creditsAwarded: number;
  rankDelta: number;
  durationMs: number;
  profile: PoolProfile;
};

const previewProfile: PoolProfile = {
  level: 1, xp: 0, rank: "Bronze III", rankPoints: 0, wins: 0, losses: 0, winStreak: 0,
  bestWinStreak: 0, ballsPotted: 0, bankShots: 0, breakAndRuns: 0, fouls: 0, bestClearanceMs: null,
  selectedCueId: "house", selectedTableId: "emerald", selectedBallSkinId: "tournament",
  daily: { pots: 0, banks: 0, wins: 0 },
};

function remainingForGroup(balls: PoolBallState[], group: BallGroup | null) {
  return group ? balls.filter((ball) => !ball.pocketed && ballGroup(ball.number) === group).map((ball) => ball.number) : [];
}

function groupLabel(group: BallGroup | null) {
  return group === "SOLIDS" ? "Solids 1–7" : group === "STRIPES" ? "Stripes 9–15" : "Open table";
}

function formatDuration(milliseconds: number | null) {
  if (!milliseconds) return "—";
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeAngle(angle: number) {
  let result = angle % (Math.PI * 2);
  if (result > Math.PI) result -= Math.PI * 2;
  if (result < -Math.PI) result += Math.PI * 2;
  return result;
}

export function EightBallExperience() {
  useIdleGamePreload(preloadEightBallArena);
  const router = useRouter();
  const wallet = useWallet();
  const arenaRef = useRef<EightBallArenaHandle | null>(null);
  const timersRef = useRef<number[]>([]);
  const audioRef = useRef<{ context: AudioContext; ambient: AudioBufferSourceNode } | null>(null);
  const rulesRef = useRef<{ turn: PoolTurn; playerGroup: BallGroup | null; aiGroup: BallGroup | null; startedAt: number; playerFouls: number; openingBreak: boolean }>({ turn: "PLAYER", playerGroup: null, aiGroup: null, startedAt: 0, playerFouls: 0, openingBreak: true });
  const statsRef = useRef({ shots: 0, ballsPotted: 0, bankShots: 0, trickShots: 0, fouls: 0, maxRun: 0, currentRun: 0 });
  const [phase, setPhase] = useState<Phase>("lobby");
  const [tierId, setTierId] = useState("pro");
  const [session, setSession] = useState<PoolSession | null>(null);
  const [match, setMatch] = useState<PoolMatch | null>(null);
  const [opponent, setOpponent] = useState<PoolOpponent | null>(null);
  const [result, setResult] = useState<PoolResult | null>(null);
  const [turn, setTurnState] = useState<PoolTurn>("PLAYER");
  const [playerGroup, setPlayerGroupState] = useState<BallGroup | null>(null);
  const [aiGroup, setAiGroupState] = useState<BallGroup | null>(null);
  const [snapshot, setSnapshot] = useState<PoolBallState[]>([]);
  const [aimAngle, setAimAngle] = useState(0);
  const [power, setPower] = useState(.64);
  const [spin, setSpin] = useState<SpinInput>({ x: 0, y: 0 });
  const [shotInMotion, setShotInMotion] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [ballInHand, setBallInHand] = useState(false);
  const [placement, setPlacement] = useState({ x: 0, z: -1.35 });
  const [message, setMessage] = useState("Drag across the table to aim");
  const [countdown, setCountdown] = useState("3");
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [matchElapsed, setMatchElapsed] = useState(0);
  const [fouls, setFouls] = useState(0);
  const [error, setError] = useState("");
  const [cueId, setCueId] = useState("house");
  const [tableId, setTableId] = useState("emerald");
  const [ballSkinId, setBallSkinId] = useState("tournament");
  const [displayStats, setDisplayStats] = useState({ ballsPotted: 0, bankShots: 0, maxRun: 0 });
  const tier = useMemo(() => poolTierById(tierId), [tierId]);
  const profile = session?.profile ?? previewProfile;
  const playerName = session?.username?.toUpperCase() ?? (wallet.user.role === "USER" ? wallet.user.username.toUpperCase() : "YOU");
  const aiName = opponent?.username ?? "Mira Vale";

  useEffect(() => {
    if ((phase !== "playing" && phase !== "settling") || !rulesRef.current.startedAt) return;
    const tick = () => setMatchElapsed(Math.max(0, Date.now() - rulesRef.current.startedAt));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  const setTurn = (value: PoolTurn) => {
    rulesRef.current.turn = value;
    setTurnState(value);
  };
  const setGroups = (player: BallGroup | null, ai: BallGroup | null) => {
    rulesRef.current.playerGroup = player;
    rulesRef.current.aiGroup = ai;
    setPlayerGroupState(player);
    setAiGroupState(ai);
  };

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    if (audioRef.current) {
      audioRef.current.ambient.stop();
      void audioRef.current.context.close();
    }
  }, []);

  useEffect(() => {
    if (phase !== "versus" || !match) return;
    const tick = () => {
      const remaining = match.startAt - Date.now();
      setCountdown(remaining > 2100 ? "3" : remaining > 1300 ? "2" : remaining > 500 ? "1" : "BREAK!");
      if (remaining <= 0) {
        setPhase("playing");
        setMessage("Your break · aim for a legal opening shot");
      }
    };
    tick();
    const timer = window.setInterval(tick, 80);
    return () => window.clearInterval(timer);
  }, [match, phase]);

  useEffect(() => {
    if (wallet.user.role !== "USER" || session) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/eight-ball/session", { method: "POST", credentials: "same-origin" })
        .then(async (response) => response.ok ? response.json() as Promise<PoolSession> : null)
        .then((payload) => {
          if (!payload) return;
          setSession(payload);
          setCueId(payload.profile.selectedCueId);
          setTableId(payload.profile.selectedTableId);
          setBallSkinId(payload.profile.selectedBallSkinId);
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
    const length = context.sampleRate * 3;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = (Math.random() * 2 - 1) * .12;
    const ambient = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    gain.gain.value = .016;
    ambient.buffer = buffer;
    ambient.loop = true;
    ambient.connect(filter).connect(gain).connect(context.destination);
    ambient.start();
    audioRef.current = { context, ambient };
  };

  const playSound = useCallback((kind: "cue" | "collision" | "rail" | "pocket", intensity: number) => {
    if (muted || !audioRef.current) return;
    const { context } = audioRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "cue" ? "triangle" : kind === "pocket" ? "sine" : "square";
    const frequency = kind === "cue" ? 116 : kind === "collision" ? 620 : kind === "rail" ? 260 : 82;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * .45), context.currentTime + .08);
    gain.gain.setValueAtTime(Math.max(.008, intensity * (kind === "pocket" ? .1 : .045)), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + (kind === "pocket" ? .32 : .1));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (kind === "pocket" ? .34 : .11));
  }, [muted]);

  const resetMatchState = (found: PoolMatch) => {
    arenaRef.current?.reset();
    const next = arenaRef.current?.getSnapshot() ?? [];
    setSnapshot(next);
    rulesRef.current = { turn: "PLAYER", playerGroup: null, aiGroup: null, startedAt: found.startAt, playerFouls: 0, openingBreak: true };
    statsRef.current = { shots: 0, ballsPotted: 0, bankShots: 0, trickShots: 0, fouls: 0, maxRun: 0, currentRun: 0 };
    setDisplayStats({ ballsPotted: 0, bankShots: 0, maxRun: 0 });
    setFouls(0);
    setMatchElapsed(0);
    setTurnState("PLAYER");
    setPlayerGroupState(null);
    setAiGroupState(null);
    setAimAngle(0);
    setPower(.72);
    setSpin({ x: 0, y: 0 });
    setShotInMotion(false);
    setAiThinking(false);
    setBallInHand(false);
    setResult(null);
    setError("");
  };

  const startMatch = async () => {
    ensureAudio();
    if (wallet.user.role !== "USER") {
      router.push(`/login?next=${encodeURIComponent(`/play/eight-ball?tier=${tierId}`)}`);
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
        const response = await fetch("/api/eight-ball/session", { method: "POST", credentials: "same-origin" });
        const payload = await response.json() as PoolSession;
        if (!response.ok) throw new Error(payload.error || "Pool session authorization failed.");
        authorized = payload;
        setSession(payload);
      }
      const started = await gameplayRequest<{ match: PoolMatch }>("eight-ball", {
        action: "START", tierId, cueId, tableId, ballSkinId, excludeOpponentName: opponent?.username,
      });
      const found = started.match;
      setMatch(found); setOpponent(found.opponent); resetMatchState(found); setPhase("versus");
      triggerGameCinematic({ kind: "versus", game: "8 BALL CASH ARENA", kicker: `${tier.name.toUpperCase()} · FIRST BREAK`, left: authorized.username, leftMeta: authorized.profile.rank, right: found.opponent.username, rightMeta: found.opponent.rank, accent: "#22d3ee", accent2: "#fb7185", icon: "target", durationMs: 3400 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enter the Cash Arena.");
      setPhase("error");
    }
  };

  const placeForAi = () => {
    const positions = [[0, -1.38], [-.5, -1.42], [.5, -1.35], [0, -.85], [-.72, -.7]];
    for (const [x, z] of positions) if (arenaRef.current?.placeCueBall(x, z)) return;
  };

  const finishGame = async (winner: PoolTurn) => {
    if (!match || !session) return;
    setPhase("settling");
    setMessage(winner === "PLAYER" ? "Eight ball down · verifying your victory" : `${aiName} closes the rack`);
    try {
      const settled = await gameplayRequest<{ result: PoolResult }>("eight-ball", {
        action: "FINISH", matchId: match.matchId, winner, stats: statsRef.current,
      });
      setResult(settled.result);
      setSession((current) => current ? { ...current, profile: settled.result.profile } : current);
      triggerGameCinematic({ kind: settled.result.winnerId === session.playerId ? "win" : "loss", game: "8 BALL CASH ARENA", kicker: "RACK COMPLETE", center: settled.result.winnerId === session.playerId ? "TABLE CLEARED" : "GAME OVER", accent: "#22d3ee", accent2: "#fbbf24", icon: "target", durationMs: 2200 });
      setPhase("result"); setShotInMotion(false); setAiThinking(false); void wallet.refreshWallet();
      if (!muted && audioRef.current) playSound(settled.result.winnerId === session.playerId ? "pocket" : "rail", 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The pool result could not be verified.");
      setPhase("error");
    }
  };

  const takeAiShot = (needsPlacement: boolean) => {
    setAiThinking(true);
    setMessage(needsPlacement ? `${aiName} has ball in hand` : `${aiName} is reading the table`);
    const thinkTimer = window.setTimeout(() => {
      if (needsPlacement) placeForAi();
      const balls = arenaRef.current?.getSnapshot() ?? [];
      const group = rulesRef.current.aiGroup;
      const canShootEight = Boolean(group && remainingForGroup(balls, group).length === 0);
      const plan = planAiShot(balls, group, canShootEight, Boolean(match?.aiFavored));
      setAimAngle(plan.angle);
      setPower(plan.power);
      setSpin(plan.spin);
      setMessage(plan.bank ? `${aiName} lines up a safety bank` : `${aiName} targets ${plan.targetNumber === 8 ? "the eight ball" : `ball ${plan.targetNumber ?? "contact"}`}`);
      const strokeTimer = window.setTimeout(() => {
        setAiThinking(false);
        arenaRef.current?.shoot({ ...plan, cinematic: plan.targetNumber === 8 });
      }, 780);
      timersRef.current.push(strokeTimer);
    }, 880);
    timersRef.current.push(thinkTimer);
  };

  const handleShotComplete = (report: PoolShotReport) => {
    setShotInMotion(false);
    const shooter = rulesRef.current.turn;
    const other: PoolTurn = shooter === "PLAYER" ? "AI" : "PLAYER";
    const openingBreak = rulesRef.current.openingBreak;
    const balls = arenaRef.current?.getSnapshot() ?? [];
    setSnapshot(balls);
    let shooterGroup = shooter === "PLAYER" ? rulesRef.current.playerGroup : rulesRef.current.aiGroup;
    const preShotGroupRemaining = shooterGroup
      ? balls.filter((ball) => ballGroup(ball.number) === shooterGroup && (!ball.pocketed || report.pocketed.includes(ball.number))).length
      : 0;
    const firstHitGroup = report.firstHit === null ? null : ballGroup(report.firstHit);
    const legalFirstHit = report.firstHit !== null && (shooterGroup ? (preShotGroupRemaining === 0 ? report.firstHit === 8 : firstHitGroup === shooterGroup) : report.firstHit !== 8);
    const objectPots = report.pocketed.filter((number) => number > 0 && number !== 8);
    const regularRailFoul = objectPots.length === 0 && !report.pocketed.includes(8) && report.railHits === 0;
    const illegalBreak = openingBreak && objectPots.length === 0 && !report.pocketed.includes(8) && report.railHits < 4;
    const foul = report.cuePocketed || !legalFirstHit || (openingBreak ? illegalBreak : regularRailFoul);
    if (!shooterGroup && !openingBreak && !foul && objectPots.length > 0) {
      shooterGroup = ballGroup(objectPots[0]);
      if (shooterGroup) {
        if (shooter === "PLAYER") setGroups(shooterGroup, oppositeGroup(shooterGroup));
        else setGroups(oppositeGroup(shooterGroup), shooterGroup);
      }
    }
    const eightPotted = report.pocketed.includes(8);
    const ownPots = objectPots.filter((number) => shooterGroup ? ballGroup(number) === shooterGroup : true);
    if (shooter === "PLAYER") {
      statsRef.current.shots += 1;
      const creditedPots = openingBreak && eightPotted ? 0 : ownPots.length;
      statsRef.current.ballsPotted += creditedPots;
      statsRef.current.bankShots += report.bankShot && creditedPots ? 1 : 0;
      statsRef.current.trickShots += report.collisionCount >= 3 && creditedPots ? 1 : 0;
      statsRef.current.fouls += foul ? 1 : 0;
      statsRef.current.currentRun = foul || creditedPots === 0 ? 0 : statsRef.current.currentRun + creditedPots;
      statsRef.current.maxRun = Math.max(statsRef.current.maxRun, statsRef.current.currentRun);
      setDisplayStats({
        ballsPotted: statsRef.current.ballsPotted,
        bankShots: statsRef.current.bankShots,
        maxRun: statsRef.current.maxRun,
      });
      if (foul) { rulesRef.current.playerFouls += 1; setFouls(rulesRef.current.playerFouls); }
    }
    if (eightPotted && openingBreak) {
      arenaRef.current?.reset();
      setSnapshot(arenaRef.current?.getSnapshot() ?? []);
      setGroups(null, null);
      rulesRef.current.openingBreak = true;
      const nextTurn = foul ? other : shooter;
      setTurn(nextTurn);
      setSpin({ x: 0, y: 0 });
      setBallInHand(false);
      setMessage(`Eight on the break · re-racked for ${nextTurn === "PLAYER" ? "you" : "AI"}`);
      if (nextTurn === "AI") takeAiShot(false);
      return;
    }
    rulesRef.current.openingBreak = false;
    if (eightPotted) {
      const legalEight = Boolean(shooterGroup && preShotGroupRemaining === 0 && !foul);
      finishGame(legalEight ? shooter : other);
      return;
    }
    const keepsTurn = !foul && ownPots.length > 0;
    const nextTurn = keepsTurn ? shooter : other;
    setTurn(nextTurn);
    setSpin({ x: 0, y: 0 });
    setBallInHand(foul && nextTurn === "PLAYER");
    setMessage(foul ? `${shooter === "PLAYER" ? "Foul" : `${aiName} fouls`} · ${nextTurn === "PLAYER" ? "place the cue ball" : `ball in hand for ${aiName}`}` : keepsTurn ? `${shooter === "PLAYER" ? "Great pot" : `${aiName} stays at the table`}` : `${nextTurn === "PLAYER" ? "Your turn" : `${aiName}'s turn`}`);
    if (nextTurn === "AI") takeAiShot(foul);
  };

  const shoot = () => {
    if (phase !== "playing" || turn !== "PLAYER" || shotInMotion || ballInHand) return;
    const balls = arenaRef.current?.getSnapshot() ?? [];
    const cinematic = Boolean(playerGroup && remainingForGroup(balls, playerGroup).length === 0);
    arenaRef.current?.shoot({ angle: aimAngle, power, spin, cinematic });
  };

  const confirmPlacement = () => {
    if (!arenaRef.current?.placeCueBall(placement.x, placement.z)) {
      setMessage("That position overlaps another ball · choose a clear spot");
      return;
    }
    setBallInHand(false);
    setSnapshot(arenaRef.current.getSnapshot());
    setMessage("Ball placed · line up your shot");
  };

  const spinPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, -((event.clientY - rect.top) / rect.height * 2 - 1)));
    const length = Math.max(1, Math.hypot(x, y));
    setSpin({ x: x / length, y: y / length });
  };

  useEffect(() => {
    if (phase !== "playing") return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft" || event.code === "KeyA") setAimAngle((value) => normalizeAngle(value - .025));
      if (event.code === "ArrowRight" || event.code === "KeyD") setAimAngle((value) => normalizeAngle(value + .025));
      if (event.code === "ArrowUp" || event.code === "KeyW") setPower((value) => Math.min(1, value + .025));
      if (event.code === "ArrowDown" || event.code === "KeyS") setPower((value) => Math.max(.12, value - .025));
      if (event.code === "Space") { event.preventDefault(); shoot(); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  const rematch = () => {
    setPhase("authorizing");
    setResult(null);
    void startMatch();
  };
  const backToLobby = () => {
    setPhase("lobby");
    setMatch(null);
    setOpponent(null);
    setResult(null);
    setError("");
  };

  const playerRemaining = snapshot.length ? remainingForGroup(snapshot, playerGroup) : [];
  const aiRemaining = snapshot.length ? remainingForGroup(snapshot, aiGroup) : [];
  const playerWon = Boolean(result && result.winnerId === session?.playerId);
  const xpFloor = (profile.level - 1) * 1800;
  const xpProgress = Math.min(100, Math.max(0, (profile.xp - xpFloor) / 1800 * 100));

  if (String(phase) === "lobby") {
    return (
      <SimpleGameLobby
        name="8 Ball"
        image="/images/games/eight-ball.webp"
        imageAlt="Black 8-ball and cue ball on a pool table"
        tiers={POOL_TIERS.map((item) => ({ id: item.id, name: item.name, entry: item.entry, reward: item.reward }))}
        selectedId={tierId}
        onSelect={setTierId}
        onPlay={() => void startMatch()}
        howTo={["Choose an amount", "Aim the cue and choose power", "Pot your group, then the 8-ball"]}
        error={error}
      />
    );
  }

  return (
    <div className="game-screen fixed inset-0 z-[100] overflow-hidden bg-[#02040a] text-white selection:bg-cyan-300 selection:text-[#031018]">
      <EightBallArena
        ref={arenaRef}
        interactive={phase === "playing" && turn === "PLAYER" && !shotInMotion && !ballInHand && !paused}
        showGuide={phase === "playing" && !shotInMotion && !ballInHand && !paused}
        aimAngle={aimAngle}
        power={power}
        spin={spin}
        cueId={cueId}
        tableId={tableId}
        ballSkinId={ballSkinId}
        onAimChange={(value) => setAimAngle(normalizeAngle(value))}
        onShotStart={() => { setShotInMotion(true); setMessage(turn === "PLAYER" ? "Cue released" : `${aiName} shoots`); }}
        onShotComplete={handleShotComplete}
        onSound={playSound}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,3,8,.72),transparent_23%,transparent_68%,rgba(1,3,8,.88))]" />

      <header className="game-safe-top pointer-events-none absolute inset-x-0 z-30 flex items-center justify-between px-3 sm:px-6">
        <button onClick={() => phase === "lobby" ? router.push("/play") : backToLobby()} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/48 text-white/75 backdrop-blur-xl" aria-label="Leave 8 Ball Cash Arena"><ArrowLeft className="h-4 w-4" /></button>
        <div className="flex items-center gap-2 rounded-full border border-cyan-200/20 bg-black/50 px-4 py-2 text-[8px] font-black uppercase tracking-[.22em] text-cyan-100 backdrop-blur-xl"><CircleDot className="h-3.5 w-3.5 text-cyan-300" /> 8 Ball Cash Arena <span className="hidden text-white/25 sm:inline">· Midnight Lounge</span></div>
        <div className="pointer-events-auto flex gap-2"><button onClick={() => setPaused((value) => !value)} disabled={phase !== "playing"} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/48 text-white/75 backdrop-blur-xl disabled:opacity-35" aria-label={paused ? "Resume pool match" : "Pause pool match"}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button><button onClick={() => setMuted((value) => !value)} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/48 text-white/75 backdrop-blur-xl" aria-label="Toggle pool audio">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button></div>
      </header>

      {(phase === "playing" || phase === "settling") && (
        <div className="pointer-events-none absolute inset-x-3 top-[66px] z-30 mx-auto max-w-[920px] rounded-2xl border border-white/10 bg-[#041019]/78 px-3 py-2.5 shadow-2xl backdrop-blur-xl sm:top-[78px] sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><p className={`text-[8px] font-black uppercase tracking-[.18em] ${turn === "PLAYER" ? "text-cyan-300" : "text-white/35"}`}>YOU · {groupLabel(playerGroup)} · {playerGroup ? playerRemaining.length : 7} LEFT</p><div className="mt-1.5 flex gap-1">{(playerGroup ? [1,2,3,4,5,6,7].map((n) => playerGroup === "STRIPES" ? n + 8 : n) : [1,2,3,4,5,6,7]).map((number) => <span key={number} className={`h-3 w-3 rounded-full border border-white/20 ${playerGroup && !playerRemaining.includes(number) ? "opacity-20" : "bg-cyan-300/70"}`} />)}</div></div>
            <div className="shrink-0 text-center"><p className="text-[7px] font-black uppercase tracking-[.25em] text-amber-200">{turn === "PLAYER" ? "Your table" : aiThinking ? "Rival thinking" : "Rival turn"}</p><p className="mt-1 text-sm font-black text-white sm:text-lg"><span className="text-cyan-200">YOU {playerGroup ? 7 - playerRemaining.length : 0}</span> — {aiGroup ? 7 - aiRemaining.length : 0} RIVAL</p></div>
            <div className="min-w-0 text-right"><p className={`text-[8px] font-black uppercase tracking-[.18em] ${turn === "AI" ? "text-violet-300" : "text-white/35"}`}>RIVAL · {groupLabel(aiGroup)} · {aiGroup ? aiRemaining.length : 7} LEFT</p><div className="mt-1.5 flex justify-end gap-1">{(aiGroup ? [1,2,3,4,5,6,7].map((n) => aiGroup === "STRIPES" ? n + 8 : n) : [9,10,11,12,13,14,15]).map((number) => <span key={number} className={`h-3 w-3 rounded-full border border-white/20 ${aiGroup && !aiRemaining.includes(number) ? "opacity-20" : "bg-violet-300/70"}`} />)}</div></div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-8">{[
            { label: "Timer", value: formatDuration(matchElapsed) },
            { label: "Entry", value: `${tier.entry.toLocaleString()} CR` },
            { label: "Reward", value: `${tier.reward.toLocaleString()} CR` },
            { label: "Turn", value: turn === "PLAYER" ? "YOU" : "AI" },
            { label: "Fouls", value: String(fouls) },
            { label: "Target", value: playerGroup ? groupLabel(playerGroup) : "OPEN" },
            { label: "Power", value: `${Math.round(power * 100)}%` },
            { label: "Level", value: `LV ${profile.level} · EXPERT` },
          ].map((item) => <div key={item.label} className="rounded-md border border-white/[.07] bg-black/30 px-2 py-1"><p className="text-[5px] font-black uppercase tracking-widest text-white/30">{item.label}</p><p className="mt-0.5 truncate text-[7px] font-black uppercase text-white/80">{item.value}</p></div>)}</div>
        </div>
      )}

      {paused && phase === "playing" && <div className="absolute inset-0 z-50 grid place-items-center bg-[#02040a]/78 backdrop-blur-md"><div className="rounded-[2rem] border border-cyan-200/20 bg-[#06111d]/95 p-8 text-center"><Pause className="mx-auto h-9 w-9 text-cyan-200" /><h2 className="mt-4 text-4xl font-black italic">MATCH PAUSED</h2><p className="mt-2 text-xs text-white/45">Aim and shot controls are locked.</p><button onClick={() => setPaused(false)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-7 py-3 text-[10px] font-black uppercase tracking-widest text-[#03131a]"><Play className="h-4 w-4" /> Resume</button></div></div>}

      {phase === "playing" && (
        <>
          <div className="pointer-events-none absolute inset-x-4 bottom-[184px] z-30 text-center sm:bottom-[156px]"><span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/60 px-4 py-2 text-[8px] font-black uppercase tracking-[.18em] text-white/65 backdrop-blur"><Crosshair className="h-3.5 w-3.5 text-cyan-300" />{message}</span></div>
          {ballInHand ? (
            <div className="game-safe-bottom absolute left-1/2 z-40 w-[min(94vw,610px)] -translate-x-1/2 rounded-2xl border border-amber-200/25 bg-[#0a0b0d]/92 p-4 shadow-2xl backdrop-blur-xl"><div className="flex items-center justify-between"><div><p className="text-[8px] font-black uppercase tracking-[.22em] text-amber-200">Ball in hand</p><p className="mt-1 text-xs text-white/55">Choose exact cue-ball placement</p></div><Target className="h-5 w-5 text-amber-300" /></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-[8px] font-black uppercase tracking-wider text-white/40">Left / right<input type="range" min="-1.05" max="1.05" step="0.01" value={placement.x} onChange={(event) => setPlacement((value) => ({ ...value, x: Number(event.target.value) }))} className="game-range mt-1 w-full accent-amber-300" /></label><label className="text-[8px] font-black uppercase tracking-wider text-white/40">Head / foot<input type="range" min="-2.15" max="2.15" step="0.01" value={placement.z} onChange={(event) => setPlacement((value) => ({ ...value, z: Number(event.target.value) }))} className="game-range mt-1 w-full accent-amber-300" /></label></div><button onClick={confirmPlacement} className="mt-3 min-h-12 w-full rounded-xl bg-amber-300 py-3 text-[9px] font-black uppercase tracking-[.16em] text-[#1b1002]">Place cue ball</button></div>
          ) : (
            <div className="game-safe-bottom absolute inset-x-3 z-40 mx-auto flex max-w-[980px] items-end gap-2 sm:gap-3">
              <div className="hidden w-32 rounded-2xl border border-white/10 bg-black/62 p-3 backdrop-blur-xl sm:block"><p className="text-[7px] font-black uppercase tracking-[.2em] text-white/35">Aim angle</p><p className="mt-1 text-xl font-black text-cyan-200">{Math.round(normalizeAngle(aimAngle) * 180 / Math.PI)}°</p><p className="mt-1 text-[7px] text-white/30">Drag table · A / D</p></div>
              <div className="flex-1 rounded-2xl border border-white/10 bg-black/78 p-3 backdrop-blur-xl"><div className="flex items-center justify-between"><p className="text-[7px] font-black uppercase tracking-[.2em] text-white/35">Cue power</p><b className="text-xs text-amber-200">{Math.round(power * 100)}%</b></div><input aria-label="Cue power" type="range" min="0.12" max="1" step="0.01" value={power} onChange={(event) => setPower(Number(event.target.value))} disabled={turn !== "PLAYER" || shotInMotion} className="game-range mt-1 w-full accent-cyan-300" /><div className="game-compact-stats mt-1 flex justify-between text-[6px] font-black uppercase tracking-widest text-white/25"><span>Touch</span><span>Controlled</span><span>Break</span></div></div>
              <div onPointerDown={spinPointer} onPointerMove={(event) => { if (event.buttons) spinPointer(event); }} className="relative h-[82px] w-[82px] shrink-0 touch-none rounded-full border-2 border-white/25 bg-[radial-gradient(circle_at_38%_32%,#fff,#cbd5e1_55%,#64748b)] shadow-[inset_-8px_-10px_18px_rgba(0,0,0,.35),0_10px_30px_rgba(0,0,0,.45)] sm:h-[92px] sm:w-[92px]" aria-label="Cue ball spin control"><span className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full border border-white bg-cyan-400 shadow-[0_0_10px_#22d3ee]" style={{ transform: `translate(calc(-50% + ${spin.x * 28}px), calc(-50% - ${spin.y * 28}px))` }} /><span className="absolute inset-x-0 bottom-1 text-center text-[6px] font-black uppercase tracking-wider text-black/45">Spin</span></div>
              <button onClick={shoot} disabled={turn !== "PLAYER" || shotInMotion} className="group h-[82px] min-w-[92px] rounded-2xl border border-cyan-200/55 bg-gradient-to-b from-cyan-300 to-cyan-500 px-4 text-[11px] font-black uppercase tracking-[.16em] text-[#03131b] shadow-[0_0_35px_rgba(34,211,238,.28)] disabled:cursor-not-allowed disabled:opacity-40 sm:h-[92px] sm:min-w-[150px]"><Zap className="mx-auto mb-1 h-5 w-5" />Shoot</button>
            </div>
          )}
        </>
      )}

      {phase === "lobby" && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-[linear-gradient(90deg,rgba(2,4,10,.96),rgba(2,4,10,.8)_54%,rgba(2,4,10,.28))] px-4 pb-16 pt-20 sm:px-7 lg:px-12">
          <div className="mx-auto grid min-h-full max-w-[1450px] items-center gap-8 py-7 xl:grid-cols-[1fr_420px]">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.24em] text-cyan-100"><CircleDot className="h-3.5 w-3.5 text-cyan-300" /> New premium single-player game</div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[.5em] text-violet-300">Own the table</p>
              <h1 className="mt-2 text-[clamp(4.2rem,10vw,9.2rem)] font-black italic leading-[.72] tracking-[-.085em]">8 BALL<br /><span className="bg-gradient-to-r from-cyan-200 via-white to-violet-300 bg-clip-text text-transparent">CASH ARENA</span></h1>
              <p className="mt-6 max-w-2xl text-base font-semibold leading-7 text-white/68 sm:text-lg">True aim, power, spin, banks and cue-ball placement. No matchmaking—your expert CPU rival is ready now.</p>
              <div className="mt-6 flex flex-wrap gap-2">{[{ icon: Gauge, label: "Real physics" }, { icon: CircleDot, label: "Expert CPU" }, { icon: ShieldCheck, label: "Advanced difficulty" }, { icon: Sparkles, label: "Premium 2D" }].map(({ icon: Icon, label }) => <span key={label} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[8px] font-black uppercase tracking-[.14em] text-white/60"><Icon className="h-3 w-3 text-cyan-300" />{label}</span>)}</div>

              <div className="mt-7 max-w-3xl rounded-2xl border border-white/10 bg-black/58 p-4 backdrop-blur-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-white/35">Choose a credit table</p><p className="mt-1 text-xs font-bold text-white/70">Entry, possible reward and rules are locked before the break</p></div><Coins className="h-5 w-5 text-amber-300" /></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{POOL_TIERS.map((item) => <button key={item.id} onClick={() => setTierId(item.id)} className={`rounded-xl border p-3 text-left transition ${tierId === item.id ? "border-cyan-300/60 bg-cyan-300/12 shadow-[0_0_24px_rgba(34,211,238,.12)]" : "border-white/10 bg-white/[.03] hover:border-white/25"}`}><p className="text-[7px] font-black uppercase tracking-widest text-white/40">{item.name}</p><p className="mt-2 text-lg font-black text-white">{item.entry.toLocaleString()} <small className="text-[7px] text-white/35">ENTRY</small></p><p className="mt-1 text-[8px] font-black text-amber-200">{item.reward.toLocaleString()} CR possible reward</p></button>)}</div><div className="mt-4 grid gap-2 text-[8px] font-bold leading-5 text-white/48 sm:grid-cols-2"><p>• Standard 8-ball · open table until a legal group is claimed</p><p>• Hit your group first · pot or contact a rail after impact</p><p>• Scratch or illegal contact gives the opponent ball in hand</p><p>• Clear your group, then legally pocket the 8 ball to win</p></div></div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row"><button onClick={() => void startMatch()} disabled={wallet.user.role === "USER" && wallet.balance < tier.entry} className="group inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-100/60 bg-gradient-to-r from-cyan-300 to-blue-500 px-8 py-4 text-[11px] font-black uppercase tracking-[.16em] text-[#02111b] shadow-[0_0_42px_rgba(34,211,238,.25)] disabled:opacity-45"><CircleDot className="h-4 w-4" />{wallet.user.role === "USER" ? `Play for ${tier.entry.toLocaleString()} CR` : "Sign in to play"}<ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" /></button><div className="rounded-xl border border-white/10 bg-black/45 px-5 py-3 text-[8px] leading-5 text-white/40"><b className="block text-white/70">Selected: {tier.room}</b>Fictional CPU rival · possible reward {tier.reward.toLocaleString()} CR · virtual credits only</div></div>
            </div>

            <aside className="space-y-3">
              <div className="rounded-[1.5rem] border border-white/10 bg-[#07101b]/82 p-5 shadow-2xl backdrop-blur-xl"><div className="flex items-center justify-between"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-amber-300">{profile.rank}</p><h2 className="mt-1 text-xl font-black">{playerName}</h2><p className="mt-1 text-[9px] text-white/35">Level {profile.level} · {profile.xp.toLocaleString()} XP</p></div><div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-200/20 bg-cyan-300/10"><Medal className="h-7 w-7 text-cyan-300" /></div></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${xpProgress}%` }} /></div><div className="mt-4 grid grid-cols-4 gap-2">{[{ label: "Wins", value: profile.wins }, { label: "Potted", value: profile.ballsPotted }, { label: "Banks", value: profile.bankShots }, { label: "Streak", value: profile.winStreak }].map((stat) => <div key={stat.label} className="rounded-xl border border-white/[.07] bg-white/[.035] p-2 text-center"><p className="text-sm font-black">{stat.value}</p><p className="mt-1 text-[6px] font-black uppercase tracking-widest text-white/35">{stat.label}</p></div>)}</div><p className="mt-3 text-[8px] text-white/35">Personal best clearance · <b className="text-cyan-200">{formatDuration(profile.bestClearanceMs)}</b></p></div>
              <div className="rounded-2xl border border-white/10 bg-black/62 p-4 backdrop-blur"><p className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-violet-300"><Target className="h-4 w-4" /> Daily missions</p><div className="mt-3 space-y-2">{POOL_MISSIONS.map((mission, index) => { const current = [profile.daily.pots, profile.daily.banks, profile.daily.wins][index]; return <div key={mission.id}><div className="flex justify-between text-[8px]"><span className="font-bold text-white/60">{mission.description}</span><b className="text-amber-200">{current}/{mission.target}</b></div><div className="mt-1 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-violet-400" style={{ width: `${Math.min(100, current / mission.target * 100)}%` }} /></div></div>; })}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/62 p-4 backdrop-blur"><p className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-amber-200"><Crown className="h-4 w-4" /> Equipment & unlocks</p><div className="mt-3 grid grid-cols-3 gap-2"><label className="text-[7px] font-black uppercase text-white/35">Cue<select value={cueId} onChange={(event) => setCueId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1220] p-2 text-white">{POOL_CUES.map((item) => <option key={item.id} value={item.id} disabled={profile.level < item.level}>{profile.level < item.level ? `Lv ${item.level} · ` : ""}{item.name}</option>)}</select></label><label className="text-[7px] font-black uppercase text-white/35">Table<select value={tableId} onChange={(event) => setTableId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1220] p-2 text-white">{POOL_TABLES.map((item) => <option key={item.id} value={item.id} disabled={profile.level < item.level}>{profile.level < item.level ? `Lv ${item.level} · ` : ""}{item.name}</option>)}</select></label><label className="text-[7px] font-black uppercase text-white/35">Balls<select value={ballSkinId} onChange={(event) => setBallSkinId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1220] p-2 text-white">{BALL_SKINS.map((item) => <option key={item.id} value={item.id} disabled={profile.level < item.level}>{profile.level < item.level ? `Lv ${item.level} · ` : ""}{item.name}</option>)}</select></label></div></div>
              <Link href="/leaderboard" className="flex items-center justify-between rounded-2xl border border-cyan-300/15 bg-cyan-300/[.05] px-4 py-3 text-[8px] font-black uppercase tracking-widest text-cyan-200">View pool leaderboard <Trophy className="h-4 w-4" /></Link>
            </aside>
          </div>
        </div>
      )}

      {phase === "authorizing" && <div className="absolute inset-0 z-40 grid place-items-center bg-[#02040a]/82 px-5 backdrop-blur-md"><div className="text-center"><div className="relative mx-auto grid h-24 w-24 place-items-center rounded-full border border-cyan-300/25"><span className="absolute inset-3 animate-spin rounded-full border border-transparent border-t-cyan-300 border-r-violet-400" /><CircleDot className="h-8 w-8 text-cyan-200" /></div><p className="mt-5 text-[9px] font-black uppercase tracking-[.32em] text-cyan-300">Racking instantly</p><h2 className="mt-2 text-3xl font-black italic">PREPARING EXPERT AI</h2><p className="mt-2 text-xs text-white/40">No matchmaking · no waiting room</p></div></div>}

      {phase === "versus" && match && <div className="absolute inset-0 z-40 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(20,83,105,.26),rgba(1,3,8,.88)_62%)] px-5 backdrop-blur-sm"><div className="w-full max-w-4xl text-center"><p className="text-[9px] font-black uppercase tracking-[.4em] text-cyan-300">{tier.room} · rack ready</p><div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-5"><div><div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl border border-cyan-200/20 bg-cyan-300/10 text-2xl font-black text-cyan-200">{playerName.slice(0,2)}</div><h2 className="mt-4 text-2xl font-black">{playerName}</h2><p className="mt-1 text-[8px] font-black uppercase tracking-widest text-amber-200">{profile.rank}</p></div><div><p className="text-5xl font-black italic text-white/18">VS</p><p key={countdown} className="mt-5 animate-countdown-pop text-4xl font-black text-white">{countdown}</p></div><div><div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl border border-violet-200/20 bg-violet-300/10"><Bot className="h-10 w-10 text-violet-200" /></div><h2 className="mt-4 text-2xl font-black">{aiName}</h2><p className="mt-1 text-[8px] font-black uppercase tracking-widest text-violet-200">CPU rival · {opponent?.rank}</p></div></div><div className="mx-auto mt-7 w-fit rounded-full border border-amber-200/20 bg-amber-300/[.08] px-5 py-2 text-[8px] font-black uppercase tracking-[.18em] text-amber-100">Entry {tier.entry.toLocaleString()} CR · possible reward {tier.reward.toLocaleString()} CR</div></div></div>}

      {phase === "settling" && <div className="absolute inset-0 z-40 grid place-items-center bg-black/58 backdrop-blur-sm"><div className="rounded-[2rem] border border-white/12 bg-[#07101b]/95 p-8 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" /><h2 className="mt-4 text-3xl font-black italic">FINAL SHOT VERIFIED</h2><p className="mt-2 text-xs text-white/40">Updating credits, XP, rank and missions…</p></div></div>}

      {phase === "result" && result && <div className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-[#010308]/82 px-4 py-16 backdrop-blur-md"><div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/12 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,.2),transparent_37%),rgba(4,9,17,.96)] p-7 text-center shadow-[0_40px_120px_rgba(0,0,0,.7)] sm:p-10"><div className={`mx-auto grid h-20 w-20 place-items-center rounded-3xl border ${playerWon ? "border-amber-200/30 bg-amber-300/10" : "border-violet-200/20 bg-violet-300/10"}`}>{playerWon ? <Trophy className="h-10 w-10 text-amber-300" /> : <Bot className="h-10 w-10 text-violet-300" />}</div><p className="mt-5 text-[9px] font-black uppercase tracking-[.34em] text-cyan-300">Rack complete · {formatDuration(result.durationMs)}</p><h2 className="mt-2 text-5xl font-black italic tracking-[-.06em] sm:text-7xl">{playerWon ? "TABLE CLEARED" : `${aiName} TAKES THE RACK`}</h2><p className="mt-3 text-sm text-white/45">{playerWon ? "A legal eight-ball finish. That table was yours." : "Study the angles, adjust the spin, and run it back instantly."}</p><div className="mt-6 grid grid-cols-3 gap-2">{[{ label: "Potted", value: displayStats.ballsPotted }, { label: "Banks", value: displayStats.bankShots }, { label: "Best run", value: displayStats.maxRun }].map((stat) => <div key={stat.label} className="rounded-xl border border-white/[.08] bg-white/[.035] py-3"><p className="text-2xl font-black">{stat.value}</p><p className="mt-1 text-[7px] font-black uppercase tracking-widest text-white/35">{stat.label}</p></div>)}</div><div className="mt-5 flex flex-wrap justify-center gap-4 text-[9px] font-black uppercase tracking-widest"><span className="text-cyan-200">+{result.xpAwarded} XP</span><span className={result.rankDelta >= 0 ? "text-emerald-300" : "text-rose-300"}>{result.rankDelta >= 0 ? "+" : ""}{result.rankDelta} RP</span>{result.creditsAwarded > 0 && <span className="text-amber-200">+{result.creditsAwarded.toLocaleString()} CR</span>}</div><div className="mt-7 grid gap-2 sm:grid-cols-2"><button onClick={rematch} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-500 px-6 py-4 text-[11px] font-black uppercase tracking-[.16em] text-[#02111a] shadow-[0_0_35px_rgba(34,211,238,.25)]"><RotateCcw className="h-4 w-4" /> Play again</button><button onClick={backToLobby} className="rounded-xl border border-white/15 bg-white/[.04] px-6 py-4 text-[9px] font-black uppercase tracking-[.16em] text-white/70">Arena lobby</button></div><div className="mt-5 grid grid-cols-6 gap-1">{POOL_ACHIEVEMENTS.map((achievement) => <div key={achievement.id} title={achievement.description} className="rounded-lg border border-white/[.06] bg-white/[.025] py-2 text-center"><span className="text-sm text-amber-200">{achievement.icon}</span><p className="mt-1 hidden text-[5px] font-black uppercase text-white/25 sm:block">{achievement.name}</p></div>)}</div></div></div>}

      {phase === "error" && <div className="absolute inset-0 z-50 grid place-items-center bg-[#02040a]/88 px-5 backdrop-blur-md"><div className="w-full max-w-md rounded-[1.5rem] border border-rose-300/20 bg-[#13090d]/94 p-7 text-center"><Lock className="mx-auto h-8 w-8 text-rose-300" /><h2 className="mt-4 text-2xl font-black italic">TABLE UNAVAILABLE</h2><p className="mt-3 text-xs leading-6 text-white/55">{error || "The match could not start."}</p><button onClick={backToLobby} className="mt-6 rounded-xl border border-white/15 bg-white/[.06] px-6 py-3 text-[9px] font-black uppercase tracking-widest">Back to lobby</button></div></div>}
      {error && phase === "lobby" && <div className="absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-rose-300/25 bg-black/80 px-5 py-2 text-[8px] font-bold text-rose-100">{error}</div>}
    </div>
  );
}
