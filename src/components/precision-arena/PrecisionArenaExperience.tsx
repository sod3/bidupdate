"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Coins, Crosshair, Lock, Medal, RotateCcw, Sparkles, Target, Trophy, Volume2, VolumeX, Wind, Zap } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { gameplayRequest } from "@/lib/gameplayClient";
import {
  ARCHERY_ACHIEVEMENTS,
  ARCHERY_ARROWS,
  ARCHERY_BOWS,
  ARCHERY_COSMETICS,
  ARCHERY_ENVIRONMENTS,
  ARCHERY_MISSIONS,
  ARCHERY_TARGETS,
  ARCHERY_TIERS,
  archeryTierById,
  type ArcherySide,
} from "@/lib/precision-arena/constants";
import { nextArcheryRound, planArcheryAiShot } from "@/lib/precision-arena/physics";
import type { ArcheryShotReport, PrecisionArenaHandle } from "@/components/precision-arena/PrecisionArena";
import { SimpleGameLobby } from "@/components/games/SimpleGameLobby";
import { preloadGameRenderer, useIdleGamePreload } from "@/lib/gamePerformance";
import { HapticManager } from "@/game-engine";
import { triggerGameCinematic } from "@/lib/gameCinematics";

const PrecisionArena = dynamic(() => import("@/components/precision-arena/PrecisionArena").then((module) => module.PrecisionArena), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-[#061216]"><div className="text-center"><span className="mx-auto block h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-cyan-300 border-r-amber-200" /><p className="mt-4 text-[8px] font-black uppercase tracking-[.3em] text-white/35">Painting the range</p></div></div>,
});
const preloadPrecisionArena = () => preloadGameRenderer(PrecisionArena);

type Phase = "lobby" | "authorizing" | "versus" | "playing" | "settling" | "result" | "error";
type Profile = {
  level: number; xp: number; rank: string; rankPoints: number; wins: number; losses: number; winStreak: number; bestWinStreak: number;
  totalScore: number; bullseyes: number; perfectShots: number; longRangeShots: number; arrowsFired: number; bestDuelScore: number;
  selectedBowId: string; selectedArrowId: string; selectedTargetId: string; selectedCosmeticId: string; selectedEnvironmentId: string;
  unlockedAchievementIds: string[]; daily: { score: number; bullseyes: number; wins: number };
};
type Session = { token: string; playerId: string; username: string; profile: Profile; error?: string };
type Opponent = { id: string; username: string; title: string; rank: string; level: number; isBot: true };
type Match = { matchId: string; tierId: string; startAt: number; environmentSeed: number; opponent: Opponent; aiFavored: boolean };
type Result = { winnerId: string; winnerName: string; xpAwarded: number; creditsAwarded: number; rankDelta: number; durationMs: number; profile: Profile };
type Conditions = { distance: number; windKmh: number; targetY: number; targetVelocity: number };
type Stats = { score: number; bullseyes: number; perfectShots: number; longRangeShots: number; arrows: number; bestCombo: number };

const previewProfile: Profile = {
  level: 1, xp: 0, rank: "Rookie", rankPoints: 0, wins: 0, losses: 0, winStreak: 0, bestWinStreak: 0,
  totalScore: 0, bullseyes: 0, perfectShots: 0, longRangeShots: 0, arrowsFired: 0, bestDuelScore: 0,
  selectedBowId: "field-recurve", selectedArrowId: "cedar", selectedTargetId: "classic", selectedCosmeticId: "valley-scout", selectedEnvironmentId: "mountain-valley",
  unlockedAchievementIds: [], daily: { score: 0, bullseyes: 0, wins: 0 },
};

const emptyStats = (): Stats => ({ score: 0, bullseyes: 0, perfectShots: 0, longRangeShots: 0, arrows: 0, bestCombo: 0 });
const INITIAL_CONDITIONS: Conditions = { distance: 58, windKmh: 4, targetY: 3.6, targetVelocity: 0 };

function ScoreCard({ label, score, active, enemy = false }: { label: string; score: number; active: boolean; enemy?: boolean }) {
  return <div className={`min-w-0 flex-1 rounded-xl border px-3 py-2 backdrop-blur-xl transition ${active ? enemy ? "border-rose-300/35 bg-rose-400/10" : "border-cyan-200/35 bg-cyan-300/10" : "border-white/10 bg-black/35"}`}><p className={`text-[7px] font-black uppercase tracking-[.18em] ${enemy ? "text-rose-200" : "text-cyan-100"}`}>{label}</p><p className="mt-1 text-2xl font-black tabular-nums text-white sm:text-3xl">{score}</p></div>;
}

function formatDuration(value: number) {
  const seconds = Math.max(0, Math.round(value / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PrecisionArenaExperience() {
  useIdleGamePreload(preloadPrecisionArena);
  const router = useRouter();
  const wallet = useWallet();
  const arenaRef = useRef<PrecisionArenaHandle | null>(null);
  const timersRef = useRef<number[]>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const scoresRef = useRef({ player: 0, ai: 0, playerAccuracy: 0, aiAccuracy: 0 });
  const statsRef = useRef<Stats>(emptyStats());
  const comboRef = useRef(0);
  const roundRef = useRef(0);
  const turnRef = useRef<ArcherySide>("PLAYER");
  const matchRef = useRef<Match | null>(null);
  const conditionsRef = useRef<Conditions>(INITIAL_CONDITIONS);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [tierId, setTierId] = useState("valley");
  const [session, setSession] = useState<Session | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [round, setRound] = useState(0);
  const [turn, setTurn] = useState<ArcherySide>("PLAYER");
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [conditions, setConditions] = useState<Conditions>(INITIAL_CONDITIONS);
  const [angle, setAngle] = useState(7);
  const [power, setPower] = useState(.78);
  const [shotInMotion, setShotInMotion] = useState(false);
  const [countdown, setCountdown] = useState("3");
  const [message, setMessage] = useState("Drag across the range to aim and set power");
  const [callout, setCallout] = useState<{ text: string; sub?: string; key: number } | null>(null);
  const [lastScores, setLastScores] = useState<{ player: number[]; ai: number[] }>({ player: [], ai: [] });
  const [displayStats, setDisplayStats] = useState<Stats>(emptyStats());
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [bowId, setBowId] = useState("field-recurve");
  const [arrowId, setArrowId] = useState("cedar");
  const [targetId, setTargetId] = useState("classic");
  const [cosmeticId, setCosmeticId] = useState("valley-scout");
  const [environmentId, setEnvironmentId] = useState("mountain-valley");

  const tier = useMemo(() => archeryTierById(tierId), [tierId]);
  const profile = session?.profile ?? previewProfile;
  const playerName = session?.username?.toUpperCase() ?? (wallet.user.role === "USER" ? wallet.user.username.toUpperCase() : "YOU");
  const aiName = opponent?.username ?? tier.opponent;
  const playerWon = Boolean(result && result.winnerId === session?.playerId);
  const xpFloor = (profile.level - 1) * 1800;
  const xpProgress = Math.max(0, Math.min(100, (profile.xp - xpFloor) / 1800 * 100));
  const finalArrow = round === 4;
  const obstacleHeight = round >= 3 ? 1.7 + round * .36 : 0;
  const bonusTargetY = round === 2 ? 6.8 : undefined;

  const changeTurn = (side: ArcherySide) => { turnRef.current = side; setTurn(side); };
  const changeConditions = (next: Conditions) => { conditionsRef.current = next; setConditions(next); };
  const announce = (text: string, sub?: string) => setCallout({ text, sub, key: Date.now() });

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    if (audioRef.current) void audioRef.current.close();
  }, []);

  useEffect(() => {
    if (wallet.user.role !== "USER" || session) return;
    const timer = window.setTimeout(() => void fetch("/api/precision-arena/session", { method: "POST", credentials: "same-origin" }).then(async (response) => response.ok ? response.json() as Promise<Session> : null).then((payload) => {
      if (!payload) return;
      setSession(payload); setBowId(payload.profile.selectedBowId); setArrowId(payload.profile.selectedArrowId); setTargetId(payload.profile.selectedTargetId); setCosmeticId(payload.profile.selectedCosmeticId); setEnvironmentId(payload.profile.selectedEnvironmentId);
    }).catch(() => undefined), 0);
    return () => window.clearTimeout(timer);
  }, [session, wallet.user.role]);

  useEffect(() => {
    if (phase !== "versus" || !match) return;
    const tick = () => {
      const remaining = match.startAt - Date.now();
      setCountdown(remaining > 1800 ? "3" : remaining > 1050 ? "2" : remaining > 350 ? "1" : "DRAW!");
      if (remaining <= 0) { setPhase("playing"); setMessage("Drag → aim → set power → release"); }
    };
    tick();
    const timer = window.setInterval(tick, 60);
    return () => window.clearInterval(timer);
  }, [match, phase]);

  const ensureAudio = () => {
    if (audioRef.current || muted || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) audioRef.current = new AudioContextClass();
  };

  const playSound = useCallback((kind: "draw" | "release" | "impact" | "bullseye" | "miss") => {
    const context = audioRef.current;
    if (!context || muted) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "bullseye" ? "sine" : kind === "miss" ? "triangle" : "sawtooth";
    const frequency = kind === "draw" ? 96 : kind === "release" ? 220 : kind === "impact" ? 72 : kind === "bullseye" ? 520 : 125;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "bullseye" ? 880 : Math.max(42, frequency * .45), context.currentTime + .2);
    gain.gain.setValueAtTime(kind === "bullseye" ? .08 : .045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + (kind === "bullseye" ? .55 : .24));
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .58);
  }, [muted]);

  const resetDuel = (found: Match) => {
    arenaRef.current?.reset();
    scoresRef.current = { player: 0, ai: 0, playerAccuracy: 0, aiAccuracy: 0 };
    statsRef.current = emptyStats(); comboRef.current = 0; roundRef.current = 0; matchRef.current = found;
    setPlayerScore(0); setAiScore(0); setRound(0); changeTurn("PLAYER"); setLastScores({ player: [], ai: [] }); setDisplayStats(emptyStats());
    const foundTier = archeryTierById(found.tierId);
    const next = nextArcheryRound(found.environmentSeed, 0, foundTier.distance[0], foundTier.distance[1]);
    changeConditions(next); setAngle(7); setPower(.78); setShotInMotion(false); setResult(null); setCallout(null); setError("");
  };

  const startDuel = async () => {
    ensureAudio();
    if (wallet.user.role !== "USER") { router.push(`/login?next=${encodeURIComponent(`/play/precision-arena?tier=${tierId}`)}`); return; }
    if (wallet.balance < tier.entry) { setError(`You need ${tier.entry.toLocaleString()} credits to enter ${tier.name}.`); return; }
    setPhase("authorizing"); setError("");
    try {
      let authorized = session;
      if (!authorized) {
        const response = await fetch("/api/precision-arena/session", { method: "POST", credentials: "same-origin" });
        const payload = await response.json() as Session;
        if (!response.ok) throw new Error(payload.error || "Precision Arena authorization failed.");
        authorized = payload; setSession(payload);
      }
      const started = await gameplayRequest<{ match: Match }>("precision-arena", {
        action: "START", tierId, bowId, arrowId, targetId, cosmeticId, environmentId, excludeOpponentName: opponent?.username,
      });
      const found = started.match;
      setMatch(found); setOpponent(found.opponent); setTierId(found.tierId); resetDuel(found); setPhase("versus");
      triggerGameCinematic({ kind: "versus", game: "PRECISION ARENA", kicker: `${tier.name.toUpperCase()} · FIVE ARROWS`, left: authorized.username, leftMeta: authorized.profile.rank, right: found.opponent.username, rightMeta: found.opponent.title, accent: "#67e8f9", accent2: "#fbbf24", icon: "crosshair", durationMs: 3400 });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not enter Precision Arena."); setPhase("error"); }
  };

  const finishDuel = async (winner: ArcherySide) => {
    const currentMatch = matchRef.current;
    if (!currentMatch || !session) return;
    setPhase("settling");
    setMessage(winner === "PLAYER" ? "Victory score sent for verification" : "Rival score sent for verification");
    try {
      const settled = await gameplayRequest<{ result: Result }>("precision-arena", {
        action: "FINISH", matchId: currentMatch.matchId, winner,
        scores: { player: scoresRef.current.player, ai: scoresRef.current.ai },
        stats: statsRef.current,
      });
      setResult(settled.result);
      setSession((current) => current ? { ...current, profile: settled.result.profile } : current);
      triggerGameCinematic({ kind: settled.result.winnerId === session.playerId ? "win" : "loss", game: "PRECISION ARENA", kicker: "DUEL COMPLETE", center: settled.result.winnerId === session.playerId ? "BULLSEYE VICTORY" : "RANGE CLOSED", accent: "#67e8f9", accent2: "#fbbf24", icon: "crosshair", durationMs: 2200 });
      setPhase("result"); setShotInMotion(false); void wallet.refreshWallet();
      playSound(settled.result.winnerId === session.playerId ? "bullseye" : "miss");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The duel result could not be verified.");
      setPhase("error");
    }
  };

  const takeAiShot = () => {
    const currentTier = archeryTierById(matchRef.current?.tierId ?? tierId);
    changeTurn("AI");
    setMessage(`${aiName} reads the wind and target rhythm`);
    const timer = window.setTimeout(() => {
      const current = conditionsRef.current;
      const plan = planArcheryAiShot({ windKmh: current.windKmh, distance: current.distance, targetY: current.targetY, targetVelocity: current.targetVelocity, accuracy: currentTier.accuracy + roundRef.current * .018, favored: Boolean(matchRef.current?.aiFavored), targetPhase: arenaRef.current?.getTargetClock() ?? 0 });
      setAngle(plan.angle); setPower(plan.power);
      const fireTimer = window.setTimeout(() => {
        setShotInMotion(true); playSound("release");
        arenaRef.current?.shoot({ shooter: "AI", angle: plan.angle, power: plan.power, finalArrow: roundRef.current === 4 });
      }, 700);
      timersRef.current.push(fireTimer);
    }, 750);
    timersRef.current.push(timer);
  };

  const handleShotComplete = (report: ArcheryShotReport) => {
    setShotInMotion(false);
    const score = report.totalScore;
    if (report.shooter === "PLAYER") {
      scoresRef.current.player += score; scoresRef.current.playerAccuracy += report.radius; setPlayerScore(scoresRef.current.player);
      comboRef.current = report.comboEligible ? comboRef.current + 1 : 0;
      statsRef.current.score += score; statsRef.current.bullseyes += report.bullseye ? 1 : 0; statsRef.current.perfectShots += report.perfect ? 1 : 0; statsRef.current.longRangeShots += report.longRange ? 1 : 0; statsRef.current.arrows += 1; statsRef.current.bestCombo = Math.max(statsRef.current.bestCombo, comboRef.current); setDisplayStats({ ...statsRef.current });
      setLastScores((current) => ({ ...current, player: [...current.player, score] }));
    } else {
      scoresRef.current.ai += score; scoresRef.current.aiAccuracy += report.radius; setAiScore(scoresRef.current.ai);
      setLastScores((current) => ({ ...current, ai: [...current.ai, score] }));
    }
    playSound(report.bullseye ? "bullseye" : score ? "impact" : "miss");
    if (report.shooter === "PLAYER") HapticManager.pulse(report.bullseye || report.perfect ? "major" : score ? "success" : "failure");
    if (report.blocked) announce("OBSTACLE HIT", "Raise the arc");
    else if (report.bonusTarget) announce("BONUS TARGET!", `+${score}`);
    else if (report.perfect) announce("PERFECT SHOT!", `+${score}`);
    else if (report.bullseye) announce("BULLSEYE!", `+${score}`);
    else if (report.longRange) announce("LONG RANGE!", `+${score}`);
    else if (report.shooter === "PLAYER" && comboRef.current >= 2) announce(`COMBO ×${comboRef.current}`, `+${score}`);
    else announce(score ? `+${score}` : "MISS", report.shooter === "PLAYER" ? "Read the wind and adjust" : `${aiName} completes the shot`);

    if (report.shooter === "PLAYER") {
      const timer = window.setTimeout(takeAiShot, 760); timersRef.current.push(timer); return;
    }
    if (roundRef.current >= 4) {
      const playerWinsScore = scoresRef.current.player > scoresRef.current.ai;
      const playerWinsTieBreak = scoresRef.current.player === scoresRef.current.ai && scoresRef.current.playerAccuracy < scoresRef.current.aiAccuracy;
      const timer = window.setTimeout(() => finishDuel(playerWinsScore || playerWinsTieBreak ? "PLAYER" : "AI"), 1050); timersRef.current.push(timer); return;
    }
    const nextRound = roundRef.current + 1;
    roundRef.current = nextRound; setRound(nextRound);
    const currentTier = archeryTierById(matchRef.current?.tierId ?? tierId);
    changeConditions(nextArcheryRound(matchRef.current?.environmentSeed ?? 1, nextRound, currentTier.distance[0], currentTier.distance[1]));
    changeTurn("PLAYER"); setAngle(7); setPower(.78);
    setMessage(nextRound === 4 ? "FINAL ARROW · every point matters" : nextRound >= 3 ? "Clear the obstacle with a higher arc" : "Target speed increased · lead the movement");
    if (nextRound === 4) announce("FINAL ARROW", Math.abs(scoresRef.current.player - scoresRef.current.ai) <= 100 ? "SHOT TO WIN" : "Finish strong");
  };

  const releasePlayerArrow = (nextAngle: number, nextPower: number) => {
    if (phase !== "playing" || turnRef.current !== "PLAYER" || shotInMotion) return;
    ensureAudio(); HapticManager.pulse("impact"); setAngle(nextAngle); setPower(nextPower); setShotInMotion(true); playSound("release"); setMessage("Arrow in flight…");
    const fired = arenaRef.current?.shoot({ shooter: "PLAYER", angle: nextAngle, power: nextPower, finalArrow });
    if (!fired) setShotInMotion(false);
  };

  const rematch = () => {
    setPhase("authorizing"); setResult(null);
    void startDuel();
  };
  const backToLobby = () => {
    setPhase("lobby"); setMatch(null); setOpponent(null); setResult(null); setError("");
  };

  if (String(phase) === "lobby") {
    return (
      <SimpleGameLobby
        name="Precision Arena"
        image="/images/games/precision-arena.webp"
        imageAlt="Bow and arrow aimed at an archery target"
        tiers={ARCHERY_TIERS.map((item) => ({ id: item.id, name: item.name, entry: item.entry, reward: item.reward }))}
        selectedId={tierId}
        onSelect={(id) => {
          setTierId(id);
          setEnvironmentId(id === "legend" ? "neon-rooftop" : id === "temple" ? "japanese-temple" : "mountain-valley");
        }}
        onPlay={() => void startDuel()}
        howTo={["Choose an amount", "Drag to aim, then release", "Beat the expert CPU rival"]}
        error={error}
      />
    );
  }

  return (
    <div className="game-screen fixed inset-0 z-[100] overflow-hidden bg-[#061216] text-white selection:bg-cyan-200 selection:text-[#041114]">
      <PrecisionArena
        ref={arenaRef} environmentId={environmentId} bowId={bowId} arrowId={arrowId} targetId={targetId} cosmeticId={cosmeticId}
        windKmh={conditions.windKmh} distance={conditions.distance} targetY={conditions.targetY} targetVelocity={conditions.targetVelocity}
        obstacleHeight={obstacleHeight} bonusTargetY={bonusTargetY} angle={angle} power={power} active={phase === "playing" && !shotInMotion}
        turn={turn} onAimChange={(nextAngle, nextPower) => { setAngle(nextAngle); setPower(nextPower); playSound("draw"); }} onRelease={releasePlayerArrow} onShotComplete={handleShotComplete}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,12,17,.66),transparent_28%,transparent_67%,rgba(2,8,12,.88))]" />

      <header className="game-safe-top pointer-events-none absolute inset-x-0 z-30 flex items-center justify-between px-3 sm:px-6">
        <button onClick={() => phase === "lobby" ? router.push("/play") : backToLobby()} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/45 backdrop-blur-xl" aria-label="Leave Precision Arena"><ArrowLeft className="h-4 w-4" /></button>
        <div className="flex items-center gap-2 rounded-full border border-cyan-100/20 bg-black/45 px-4 py-2 text-[8px] font-black uppercase tracking-[.22em] text-cyan-50 backdrop-blur-xl"><Crosshair className="h-3.5 w-3.5 text-amber-200" /> Precision Arena <span className="hidden text-white/25 sm:inline">· 2D Archery Duel</span></div>
        <button onClick={() => setMuted((value) => !value)} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/45 backdrop-blur-xl" aria-label="Toggle arena audio">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
      </header>

      {(phase === "playing" || phase === "settling") && <div className="pointer-events-none absolute inset-x-3 top-[64px] z-30 mx-auto max-w-3xl sm:top-[78px]"><div className="flex items-stretch gap-2"><ScoreCard label={`YOU · ${playerName}`} score={playerScore} active={turn === "PLAYER"} /><div className="grid min-w-[92px] place-items-center rounded-xl border border-white/10 bg-black/48 px-3 text-center backdrop-blur-xl"><p className="text-[7px] font-black uppercase tracking-[.2em] text-amber-200">Round {round + 1} / 5</p><p className="mt-1 text-lg font-black italic text-white/65">VS</p></div><ScoreCard label={`CPU · ${aiName}`} score={aiScore} active={turn === "AI"} enemy /></div><div className="mt-2 flex justify-center gap-2"><span className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[7px] font-black uppercase tracking-widest backdrop-blur"><Wind className={`mr-1 inline h-3 w-3 ${conditions.windKmh < 0 ? "rotate-180 text-violet-200" : "text-cyan-200"}`} />{conditions.windKmh < 0 ? "←" : "→"} {Math.abs(conditions.windKmh)} KM/H</span><span className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[7px] font-black uppercase tracking-widest backdrop-blur">Distance {conditions.distance}m</span>{conditions.targetVelocity > 0 && <span className="hidden rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[7px] font-black uppercase tracking-widest text-amber-200 backdrop-blur sm:inline">Moving target</span>}</div><div className="mt-1.5 flex justify-center gap-1">{Array.from({ length: 5 }, (_, index) => <span key={index} className={`grid h-4 w-8 place-items-center rounded text-[6px] font-black ${lastScores.player[index] !== undefined || lastScores.ai[index] !== undefined ? "bg-black/55 text-white/70" : "bg-black/25 text-white/20"}`}>{lastScores.player[index] ?? "·"}/{lastScores.ai[index] ?? "·"}</span>)}</div></div>}

      {phase === "playing" && <><div className="pointer-events-none absolute inset-x-3 bottom-[124px] z-30 text-center sm:bottom-[106px]"><span className="inline-flex rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[7px] font-black uppercase tracking-[.15em] text-white/72 backdrop-blur-xl">{message}</span></div><div className="game-safe-bottom absolute inset-x-2 z-30 mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#031014]/90 p-3 shadow-2xl backdrop-blur-xl"><div className="grid grid-cols-[1fr_1fr_auto] gap-2"><div className="rounded-xl border border-white/[.08] bg-white/[.035] p-3"><p className="text-[7px] font-black uppercase tracking-widest text-white/35">Angle</p><p className="mt-1 text-xl font-black text-amber-100">{angle.toFixed(1)}°</p></div><div className="rounded-xl border border-white/[.08] bg-white/[.035] p-3"><p className="text-[7px] font-black uppercase tracking-widest text-white/35">Bow power</p><p className="mt-1 text-xl font-black text-cyan-100">{Math.round(power * 100)}%</p></div><button onClick={() => releasePlayerArrow(angle, power)} disabled={turn !== "PLAYER" || shotInMotion} className="min-h-[68px] min-w-[78px] rounded-xl border border-cyan-100/40 bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200 px-3 text-[9px] font-black uppercase tracking-[.12em] text-[#041618] shadow-[0_0_28px_rgba(103,232,249,.2)] disabled:opacity-35"><Target className="mx-auto mb-1 h-5 w-5" />Release</button></div><p className="game-compact-stats mt-2 text-center text-[7px] font-bold uppercase tracking-[.14em] text-white/35">Drag on the arena to aim and set power · release to shoot · trajectory guide shows only the early arc</p></div></>}

      {callout && phase === "playing" && <div key={callout.key} className="pointer-events-none absolute left-1/2 top-[34%] z-40 -translate-x-1/2 animate-drift-pop text-center"><p className="text-[clamp(2.1rem,7vw,5.5rem)] font-black italic tracking-[-.06em] text-white drop-shadow-[0_0_24px_rgba(251,191,36,.75)]">{callout.text}</p>{callout.sub && <p className="mt-1 text-[10px] font-black uppercase tracking-[.3em] text-amber-200">{callout.sub}</p>}</div>}

      {phase === "lobby" && <div className="absolute inset-0 z-20 overflow-y-auto bg-[linear-gradient(90deg,rgba(3,13,17,.97),rgba(3,13,17,.84)_55%,rgba(3,13,17,.18))] px-4 pb-16 pt-20 sm:px-7 lg:px-12"><div className="mx-auto grid min-h-full max-w-[1450px] items-center gap-8 py-7 xl:grid-cols-[1fr_430px]"><div className="max-w-4xl"><div className="inline-flex items-center gap-2 rounded-full border border-cyan-100/20 bg-cyan-200/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.24em] text-cyan-50"><Target className="h-3.5 w-3.5 text-amber-200" /> Premium lightweight 2D archery</div><p className="mt-6 text-[10px] font-black uppercase tracking-[.5em] text-amber-200">Read the wind. Own the shot.</p><h1 className="mt-2 text-[clamp(3.7rem,9vw,8.5rem)] font-black italic leading-[.74] tracking-[-.085em]">PRECISION<br /><span className="bg-gradient-to-r from-cyan-100 via-emerald-200 to-amber-200 bg-clip-text text-transparent">ARENA</span></h1><p className="mt-6 max-w-2xl text-base font-semibold leading-7 text-white/68 sm:text-lg">A five-arrow duel against a very hard fictional CPU rival. Drag to control angle and power, predict moving targets, and bend every shot through changing wind—instantly.</p><div className="mt-5 flex flex-wrap gap-2">{["Drag & release", "Moving targets", "Wind ballistics", "Fresh CPU rival", "60 FPS 2D"].map((label) => <span key={label} className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[7px] font-black uppercase tracking-widest text-white/55">{label}</span>)}</div>
        <div className="mt-7 max-w-3xl rounded-2xl border border-white/10 bg-black/58 p-4 backdrop-blur-xl"><div className="flex items-center justify-between"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-white/35">Choose a credit duel</p><p className="mt-1 text-xs font-bold text-white/65">All stakes and rules lock before the first arrow</p></div><Coins className="h-5 w-5 text-amber-200" /></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{ARCHERY_TIERS.map((item) => <button key={item.id} onClick={() => { setTierId(item.id); setEnvironmentId(item.id === "legend" ? "neon-rooftop" : item.id === "temple" ? "japanese-temple" : "mountain-valley"); }} className={`rounded-xl border p-3 text-left transition ${tierId === item.id ? "border-cyan-200/55 bg-cyan-200/10" : "border-white/10 bg-white/[.03]"}`}><p className="text-[7px] font-black uppercase tracking-widest text-white/40">{item.name}</p><p className="mt-2 text-lg font-black">{item.entry.toLocaleString()} <small className="text-[7px] text-white/35">ENTRY</small></p><p className="mt-1 text-[8px] font-black text-amber-200">{item.reward.toLocaleString()} CR possible reward</p><p className="mt-2 text-[7px] font-black uppercase text-rose-200">CPU rival · fresh alias</p></button>)}</div><div className="mt-4 grid gap-1 text-[8px] font-bold leading-5 text-white/45 sm:grid-cols-2"><p>• Five rounds, one arrow each per archer</p><p>• Ring score + perfect, long-range and bonus points</p><p>• Equal scores use closest aggregate distance</p><p>• Physics and your inputs determine every impact</p></div></div>
        <button onClick={() => void startDuel()} disabled={wallet.user.role === "USER" && wallet.balance < tier.entry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-100/50 bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200 px-8 py-4 text-[10px] font-black uppercase tracking-[.16em] text-[#041618] shadow-[0_0_38px_rgba(103,232,249,.2)] disabled:opacity-40"><Zap className="h-4 w-4" />{wallet.user.role === "USER" ? `Shoot for ${tier.entry.toLocaleString()} CR` : "Sign in to play"}<ChevronRight className="h-4 w-4" /></button></div>
        <aside className="space-y-3"><div className="rounded-[1.5rem] border border-white/10 bg-[#041419]/84 p-5 shadow-2xl backdrop-blur-xl"><div className="flex items-center justify-between"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-amber-200">{profile.rank}</p><h2 className="mt-1 text-xl font-black">{playerName}</h2><p className="mt-1 text-[9px] text-white/35">Level {profile.level} · {profile.xp.toLocaleString()} XP</p></div><div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-200/20 bg-cyan-200/10"><Crosshair className="h-7 w-7 text-cyan-100" /></div></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-cyan-300 to-amber-200" style={{ width: `${xpProgress}%` }} /></div><div className="mt-4 grid grid-cols-4 gap-2">{[{ label: "Wins", value: profile.wins }, { label: "Bullseyes", value: profile.bullseyes }, { label: "Best", value: profile.bestDuelScore }, { label: "Streak", value: profile.winStreak }].map((item) => <div key={item.label} className="rounded-xl border border-white/[.07] bg-white/[.035] p-2 text-center"><p className="text-sm font-black">{item.value}</p><p className="mt-1 text-[6px] font-black uppercase tracking-widest text-white/35">{item.label}</p></div>)}</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/58 p-4 backdrop-blur"><p className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-violet-200"><Medal className="h-4 w-4" /> Daily missions</p><div className="mt-3 space-y-2">{ARCHERY_MISSIONS.map((mission, index) => { const value = [profile.daily.score, profile.daily.bullseyes, profile.daily.wins][index]; return <div key={mission.id}><div className="flex justify-between text-[8px]"><span className="text-white/55">{mission.description}</span><b className="text-amber-200">{Math.min(value, mission.target)}/{mission.target}</b></div><div className="mt-1 h-1 rounded bg-white/10"><div className="h-full rounded bg-violet-300" style={{ width: `${Math.min(100, value / mission.target * 100)}%` }} /></div></div>; })}</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/58 p-4 backdrop-blur"><p className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-amber-200"><Sparkles className="h-4 w-4" /> Loadout & arena</p><div className="mt-3 grid grid-cols-2 gap-2">{[
          { label: "Bow", value: bowId, set: setBowId, items: ARCHERY_BOWS }, { label: "Arrows", value: arrowId, set: setArrowId, items: ARCHERY_ARROWS }, { label: "Target", value: targetId, set: setTargetId, items: ARCHERY_TARGETS }, { label: "Outfit", value: cosmeticId, set: setCosmeticId, items: ARCHERY_COSMETICS },
        ].map((control) => <label key={control.label} className="text-[7px] font-black uppercase text-white/35">{control.label}<select value={control.value} onChange={(event) => control.set(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06181d] p-2 text-white">{control.items.map((item) => <option key={item.id} value={item.id} disabled={profile.level < item.level}>{profile.level < item.level ? `Lv ${item.level} · ` : ""}{item.name}</option>)}</select></label>)}</div><label className="mt-2 block text-[7px] font-black uppercase text-white/35">Environment<select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06181d] p-2 text-white">{ARCHERY_ENVIRONMENTS.map((item) => <option key={item.id} value={item.id} disabled={profile.level < item.level}>{profile.level < item.level ? `Lv ${item.level} · ` : ""}{item.name}</option>)}</select></label></div><Link href="/leaderboard" className="flex items-center justify-between rounded-2xl border border-cyan-200/15 bg-cyan-200/[.05] px-4 py-3 text-[8px] font-black uppercase tracking-widest text-cyan-100">Archery leaderboard <Trophy className="h-4 w-4" /></Link></aside></div></div>}

      {phase === "authorizing" && <div className="absolute inset-0 z-40 grid place-items-center bg-[#020b0e]/84 px-5 backdrop-blur-md"><div className="text-center"><div className="mx-auto grid h-24 w-24 place-items-center rounded-full border border-cyan-200/25"><span className="absolute h-20 w-20 animate-spin rounded-full border border-transparent border-t-cyan-200 border-r-amber-200" /><Target className="h-8 w-8 text-amber-200" /></div><p className="mt-5 text-[9px] font-black uppercase tracking-[.32em] text-cyan-100">Opening instantly</p><h2 className="mt-2 text-3xl font-black italic">RIVAL ARCHER READY</h2><p className="mt-2 text-xs text-white/40">Single-player · fictional CPU rival</p></div></div>}
      {phase === "versus" && match && <div className="absolute inset-0 z-40 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(34,211,238,.16),rgba(2,10,13,.9)_65%)] px-5 backdrop-blur-sm"><div className="w-full max-w-4xl text-center"><p className="text-[9px] font-black uppercase tracking-[.4em] text-amber-200">{tier.name} · five-arrow duel</p><div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-5"><div><div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl border border-cyan-200/20 bg-cyan-200/10 text-2xl font-black text-cyan-100">{playerName.slice(0,2)}</div><h2 className="mt-4 text-2xl font-black">{playerName}</h2><p className="mt-1 text-[8px] font-black uppercase tracking-widest text-amber-200">{profile.rank}</p></div><div><p className="text-5xl font-black italic text-white/18">VS</p><p key={countdown} className="mt-5 animate-countdown-pop text-4xl font-black">{countdown}</p></div><div><div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl border border-rose-200/20 bg-rose-200/10 text-2xl font-black text-rose-100">{aiName.slice(0,2)}</div><h2 className="mt-4 text-2xl font-black">{aiName}</h2><p className="mt-1 text-[8px] font-black uppercase tracking-widest text-rose-200">CPU rival · {opponent?.title}</p></div></div><p className="mx-auto mt-7 w-fit rounded-full border border-amber-200/20 bg-amber-200/[.08] px-5 py-2 text-[8px] font-black uppercase tracking-[.18em] text-amber-100">Entry {tier.entry.toLocaleString()} CR · possible reward {tier.reward.toLocaleString()} CR</p></div></div>}
      {phase === "settling" && <div className="absolute inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm"><div className="rounded-[2rem] border border-white/12 bg-[#06171b]/95 p-8 text-center"><span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-transparent border-t-cyan-200 border-r-amber-200" /><h2 className="mt-4 text-3xl font-black italic">SCORES VERIFIED</h2><p className="mt-2 text-xs text-white/40">Updating credits, XP, rank, records and missions…</p></div></div>}
      {phase === "result" && result && <div className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-[#02090c]/86 px-4 py-14 backdrop-blur-md"><div className="w-full max-w-2xl rounded-[2rem] border border-white/12 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,.18),transparent_38%),rgba(4,19,23,.97)] p-7 text-center shadow-2xl sm:p-10"><div className={`mx-auto grid h-20 w-20 place-items-center rounded-3xl border ${playerWon ? "border-amber-200/30 bg-amber-200/10" : "border-rose-200/20 bg-rose-200/10"}`}>{playerWon ? <Trophy className="h-10 w-10 text-amber-200" /> : <Target className="h-10 w-10 text-rose-200" />}</div><p className="mt-5 text-[9px] font-black uppercase tracking-[.34em] text-cyan-100">Duel complete · {formatDuration(result.durationMs)}</p><h2 className="mt-2 text-5xl font-black italic tracking-[-.06em] sm:text-7xl">{playerWon ? "ARENA VICTORY" : `${aiName} WINS THE DUEL`}</h2><p className="mt-3 text-sm text-white/45">{playerWon ? "Five arrows, one composed performance. Your wind reads held under pressure." : "The next duel starts instantly—adjust the lead, refine the arc, and hunt the center."}</p><div className="mx-auto mt-6 flex max-w-md items-center gap-3"><ScoreCard label="YOU" score={playerScore} active={playerWon} /><p className="text-xl font-black text-white/25">—</p><ScoreCard label={aiName} score={aiScore} active={!playerWon} enemy /></div><div className="mt-5 grid grid-cols-5 gap-2">{[{ label: "Bullseyes", value: displayStats.bullseyes }, { label: "Perfect", value: displayStats.perfectShots }, { label: "Long", value: displayStats.longRangeShots }, { label: "Combo", value: `×${displayStats.bestCombo}` }, { label: "Arrows", value: displayStats.arrows }].map((item) => <div key={item.label} className="rounded-xl border border-white/[.08] bg-white/[.035] py-3"><p className="text-lg font-black">{item.value}</p><p className="mt-1 text-[6px] font-black uppercase tracking-widest text-white/35">{item.label}</p></div>)}</div><div className="mt-5 flex justify-center gap-5 text-[9px] font-black uppercase tracking-widest"><span className="text-cyan-100">+{result.xpAwarded} XP</span><span className={result.rankDelta >= 0 ? "text-emerald-200" : "text-rose-200"}>{result.rankDelta >= 0 ? "+" : ""}{result.rankDelta} RP</span>{result.creditsAwarded > 0 && <span className="text-amber-200">+{result.creditsAwarded.toLocaleString()} CR</span>}</div><div className="mt-7 grid gap-2 sm:grid-cols-2"><button onClick={rematch} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200 px-6 py-4 text-[11px] font-black uppercase tracking-[.16em] text-[#041618]"><RotateCcw className="h-4 w-4" /> 🏹 Play again</button><button onClick={backToLobby} className="rounded-xl border border-white/15 bg-white/[.04] px-6 py-4 text-[9px] font-black uppercase tracking-[.16em] text-white/70">Arena lobby</button></div><div className="mt-5 grid grid-cols-6 gap-1">{ARCHERY_ACHIEVEMENTS.map((achievement) => <div key={achievement.id} title={achievement.description} className={`rounded-lg border py-2 ${profile.unlockedAchievementIds.includes(achievement.id) ? "border-amber-200/20 bg-amber-200/[.07]" : "border-white/[.06] bg-white/[.02] opacity-35"}`}><span className="text-sm text-amber-200">{achievement.icon}</span></div>)}</div></div></div>}
      {phase === "error" && <div className="absolute inset-0 z-50 grid place-items-center bg-[#02090c]/90 px-5 backdrop-blur-md"><div className="w-full max-w-md rounded-[1.5rem] border border-rose-200/20 bg-[#17090d]/96 p-7 text-center"><Lock className="mx-auto h-8 w-8 text-rose-200" /><h2 className="mt-4 text-2xl font-black italic">RANGE UNAVAILABLE</h2><p className="mt-3 text-xs leading-6 text-white/55">{error || "The duel could not start."}</p><button onClick={backToLobby} className="mt-6 rounded-xl border border-white/15 bg-white/[.06] px-6 py-3 text-[9px] font-black uppercase tracking-widest">Back to lobby</button></div></div>}
      {error && phase === "lobby" && <div className="absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-rose-200/25 bg-black/80 px-5 py-2 text-[8px] font-bold text-rose-100">{error}</div>}
    </div>
  );
}
