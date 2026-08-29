"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bot, CircleDot, Crown, Flame, Goal, Loader2, LockKeyhole, Medal,
  RefreshCcw, Shield, ShieldCheck, Sparkles, Star, Swords, Target,
  Trophy, Volume2, VolumeX, ChevronRight, Pause, Play,
} from "lucide-react";
import {
  PENALTY_TIERS, penaltyTierById, type KeeperZone, type ShotInput,
  type ShotResolution,
} from "@/lib/penalty-kings/constants";
import { gameplayRequest } from "@/lib/gameplayClient";
import { useWallet } from "@/context/WalletContext";
import { SimpleGameLobby } from "@/components/games/SimpleGameLobby";
import { preloadGameRenderer, useIdleGamePreload } from "@/lib/gamePerformance";
import { FICTIONAL_OPPONENT_NAMES, fictionalOpponentNameAt } from "@/lib/opponentNames";
import { HapticManager } from "@/game-engine";
import { triggerGameCinematic } from "@/lib/gameCinematics";

const PenaltyKingsArena = dynamic(() => import("@/components/penalty-kings/PenaltyKingsArena"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-[#020906]"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-emerald-300" /><p className="mt-3 text-[8px] font-black uppercase tracking-[.28em] text-white/35">Opening Champions Arena</p></div></div>,
});
const preloadPenaltyKingsArena = () => preloadGameRenderer(PenaltyKingsArena);

type Phase = "landing" | "authorizing" | "matching" | "versus" | "turn" | "replay" | "result" | "error";
type MatchMode = "live" | "training" | null;
type Session = {
  token: string; playerId: string; username: string; level: number; rank: string; winStreak: number;
  profile: { xp: number; goals: number; saves: number; wins: number; losses: number; perfectShots: number; bestWinStreak: number };
  error?: string;
};
type Opponent = { id: string; username: string; level: number; rank: string; winStreak: number; isBot?: boolean };
type MatchFound = { matchId: string; startAt: number; environmentSeed: number; opponent: Opponent; firstStrikerId: string; tierId: string; aiFavored: boolean };
type TurnPacket = {
  turn: number; strikerId: string; keeperId: string; shotNumber: number; suddenDeath: boolean; deadlineAt: number;
  pressureText: "MATCH POINT" | "MUST SCORE" | "SAVE TO WIN" | "SUDDEN DEATH" | "";
  scores: Record<string, number>; histories: Record<string, Array<"GOAL" | "SAVE" | "MISS">>;
};
type MatchResult = {
  winnerId: string; winnerName: string; scores: Record<string, number>; histories: Record<string, Array<"GOAL" | "SAVE" | "MISS">>;
  suddenDeath: boolean; xpAwarded: number; creditsAwarded: number; rankDelta: number;
  stats: { goals: number; saves: number; perfectShots: number };
  profile?: Session["profile"] & { level?: number; rank?: string; winStreak?: number };
};

const emptyHistories: Record<string, Array<"GOAL" | "SAVE" | "MISS">> = {};

function audioCue(kind: "kick" | "goal" | "save" | "whistle" | "tension") {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.connect(context.destination);
  if (kind === "goal") {
    const length = Math.floor(context.sampleRate * 1.1);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / length) * .28;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 820;
    source.buffer = buffer;
    source.connect(filter).connect(gain);
    gain.gain.setValueAtTime(.34, context.currentTime);
    source.start();
    source.onended = () => void context.close();
    return;
  }
  const oscillator = context.createOscillator();
  oscillator.type = kind === "kick" ? "sine" : kind === "save" ? "square" : "triangle";
  const start = kind === "whistle" ? 1320 : kind === "save" ? 210 : kind === "tension" ? 82 : 118;
  oscillator.frequency.setValueAtTime(start, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(kind === "whistle" ? 1860 : Math.max(55, start * .45), context.currentTime + (kind === "tension" ? .5 : .18));
  gain.gain.setValueAtTime(kind === "tension" ? .025 : .08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + (kind === "tension" ? .65 : .28));
  oscillator.connect(gain);
  oscillator.start();
  oscillator.stop(context.currentTime + (kind === "tension" ? .65 : .3));
  oscillator.onended = () => void context.close();
}

function resolveTraining(turn: number, strikerId: string, keeperId: string, shot: ShotInput, keeperZone: KeeperZone): ShotResolution {
  const timingOffset = (shot.timing - .5) * 1.05 * (.35 + shot.power);
  const targetX = shot.directionX * 3.35 + shot.curve * .5 * shot.power + timingOffset;
  const targetY = .12 + shot.height * 2.35 + Math.abs(shot.timing - .5) * .28;
  const zoneTargets: Record<KeeperZone, [number, number]> = {
    "upper-left": [-2.35, 1.78], "upper-right": [2.35, 1.78], "low-left": [-2.35, .52], center: [0, .88], "low-right": [2.35, .52],
  };
  const [keeperX, keeperY] = zoneTargets[keeperZone];
  const inFrame = Math.abs(targetX) <= 3.55 && targetY >= .08 && targetY <= 2.48;
  const saveRadius = 1.15 - shot.power * .3;
  const saved = inFrame && Math.hypot(targetX - keeperX, targetY - keeperY) <= saveRadius;
  const goal = inFrame && !saved;
  const perfect = Math.abs(shot.timing - .5) <= .075 && inFrame;
  const shotType: ShotResolution["shotType"] = shot.power < .48 && shot.height > .55 ? "PANENKA" : shot.power > .86 ? "POWER" : Math.abs(shot.curve) > .38 ? "CURVED" : shot.height < .34 ? "LOW_DRIVEN" : "PLACED";
  return { turn, strikerId, keeperId, goal, outcome: goal ? "GOAL" : saved ? "SAVE" : "MISS", shotType, targetX, targetY, keeperZone, perfect, scores: {}, histories: {} };
}

function advancedKeeperZone(shot: ShotInput, favored = true): KeeperZone {
  const timingOffset = (shot.timing - .5) * 1.05 * (.35 + shot.power);
  const targetX = shot.directionX * 3.35 + shot.curve * .5 * shot.power + timingOffset;
  const targetY = .12 + shot.height * 2.35 + Math.abs(shot.timing - .5) * .28;
  const zones: Array<{ zone: KeeperZone; x: number; y: number }> = [
    { zone: "upper-left", x: -2.35, y: 1.78 }, { zone: "upper-right", x: 2.35, y: 1.78 },
    { zone: "low-left", x: -2.35, y: .52 }, { zone: "center", x: 0, y: .88 },
    { zone: "low-right", x: 2.35, y: .52 },
  ];
  const best = [...zones].sort((left, right) =>
    Math.hypot(targetX - left.x, targetY - left.y) - Math.hypot(targetX - right.x, targetY - right.y))[0].zone;
  if (Math.random() < (favored ? .96 : .28)) return best;
  const alternatives = zones.filter((candidate) => candidate.zone !== best);
  return alternatives[Math.floor(Math.random() * alternatives.length)].zone;
}

function advancedBotShot(favored = true): ShotInput {
  if (!favored) {
    return {
      directionX: (Math.random() - .5) * .18,
      height: .3 + Math.random() * .12,
      power: .58 + Math.random() * .08,
      curve: (Math.random() - .5) * .08,
      timing: .5 + (Math.random() - .5) * .08,
    };
  }
  const shots: ShotInput[] = [
    { directionX: -.76, height: .3, power: .88, curve: -.12, timing: .5 },
    { directionX: .76, height: .76, power: .84, curve: .12, timing: .5 },
    { directionX: -.7, height: .76, power: .9, curve: -.08, timing: .5 },
    { directionX: .78, height: .24, power: .93, curve: .06, timing: .5 },
    { directionX: 0, height: .38, power: .86, curve: 0, timing: .5 },
  ];
  const shot = shots[Math.floor(Math.random() * shots.length)];
  return {
    ...shot,
    directionX: shot.directionX + (Math.random() - .5) * .04,
    height: shot.height + (Math.random() - .5) * .03,
    timing: .5 + (Math.random() - .5) * .025,
  };
}

function OutcomeDots({ history, active }: { history: Array<"GOAL" | "SAVE" | "MISS">; active?: boolean }) {
  const length = Math.max(5, history.length + (active ? 1 : 0));
  return <div className="mt-2 flex gap-1.5">{Array.from({ length }, (_, index) => {
    const item = history[index];
    return <span key={index} className={`grid h-4 w-4 place-items-center rounded-full border text-[8px] ${item === "GOAL" ? "border-emerald-300/50 bg-emerald-300/20 text-emerald-200" : item ? "border-rose-300/40 bg-rose-400/15 text-rose-200" : active && index === history.length ? "animate-pulse border-amber-200/60 bg-amber-300/15" : "border-white/15 bg-black/15 text-white/20"}`}>{item === "GOAL" ? "✓" : item ? "×" : ""}</span>;
  })}</div>;
}

function PlayerPlate({ name, rank, score, history, align = "left", active }: { name: string; rank: string; score: number; history: Array<"GOAL" | "SAVE" | "MISS">; align?: "left" | "right"; active?: boolean }) {
  return <div className={align === "right" ? "text-right" : "text-left"}><div className={`flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}><span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-300 shadow-[0_0_9px_#4ade80]" : "bg-white/25"}`} /><p className="text-[8px] font-black uppercase tracking-[.18em] text-amber-200/85">{rank}</p></div><div className={`mt-1 flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}><p className="max-w-[118px] truncate text-xs font-black tracking-wide text-white sm:max-w-none sm:text-sm">{name}</p><b className="text-xl text-emerald-200 sm:text-2xl">{score}</b></div><OutcomeDots history={history} active={active} /></div>;
}

export function PenaltyKingsExperience() {
  useIdleGamePreload(preloadPenaltyKingsArena);
  const router = useRouter();
  const wallet = useWallet();
  const timersRef = useRef<number[]>([]);
  const mutedRef = useRef(false);
  const trainingState = useRef({ scores: {} as Record<string, number>, histories: {} as Record<string, Array<"GOAL" | "SAVE" | "MISS">>, turn: 0, suddenDeath: false, playerGoals: 0, playerSaves: 0, perfectShots: 0 });
  const [phase, setPhase] = useState<Phase>("landing");
  const [mode, setMode] = useState<MatchMode>(null);
  const [tierId, setTierId] = useState("champions");
  const [session, setSession] = useState<Session | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [match, setMatch] = useState<MatchFound | null>(null);
  const [turn, setTurn] = useState<TurnPacket | null>(null);
  const [resolution, setResolution] = useState<ShotResolution | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState(8);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("3");
  const [submitted, setSubmitted] = useState(false);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const weatherSeed = 0;
  const tier = useMemo(() => penaltyTierById(tierId), [tierId]);
  const playerId = session?.playerId ?? "preview-player";
  const playerName = session?.username?.toUpperCase() ?? "MUDASSIR";
  const rivalId = opponent?.id ?? "rival-player";
  const rivalName = opponent?.username?.toUpperCase() ?? "MIRA VALE";
  const scores = turn?.scores ?? resolution?.scores ?? result?.scores ?? { [playerId]: 0, [rivalId]: 0 };
  const histories = turn?.histories ?? resolution?.histories ?? result?.histories ?? emptyHistories;
  const role = phase === "turn" && turn ? (turn.strikerId === playerId ? "striker" : "keeper") : "spectator";
  const currentHistory = histories[playerId] ?? [];
  const rivalHistory = histories[rivalId] ?? [];

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    if (!turn?.deadlineAt || phase !== "turn") return;
    const tick = () => setTurnSeconds(Math.max(0, Math.ceil((turn.deadlineAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [phase, turn?.deadlineAt]);
  useEffect(() => () => { timersRef.current.forEach((timer) => window.clearTimeout(timer)); }, []);
  useEffect(() => {
    if (wallet.user.role !== "USER" || session || phase !== "landing") return;
    let cancelled = false;
    void fetch("/api/penalty-kings/session", { method: "POST", credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json() as Session;
        if (!response.ok) return;
        if (!cancelled) setSession(payload);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [phase, session, wallet.user.role]);
  useEffect(() => {
    if (phase !== "versus" || !match) return;
    const tick = () => {
      const remaining = match.startAt - Date.now();
      if (remaining > 3000) setCountdown("THE SHOOTOUT BEGINS");
      else if (remaining > 2100) setCountdown("3");
      else if (remaining > 1200) setCountdown("2");
      else if (remaining > 300) setCountdown("1");
      else setCountdown("⚽ KICK OFF");
    };
    tick();
    const timer = window.setInterval(tick, 80);
    return () => window.clearInterval(timer);
  }, [phase, match]);

  const playCue = useCallback((kind: Parameters<typeof audioCue>[0]) => { if (!mutedRef.current) audioCue(kind); }, []);

  const applyTrainingResolution = useCallback((raw: ShotResolution) => {
    const state = trainingState.current;
    const nextScores = { ...state.scores };
    const nextHistories = Object.fromEntries(Object.entries(state.histories).map(([id, values]) => [id, [...values]]));
    if (raw.goal) nextScores[raw.strikerId] = (nextScores[raw.strikerId] ?? 0) + 1;
    nextHistories[raw.strikerId] = [...(nextHistories[raw.strikerId] ?? []), raw.outcome];
    if (raw.strikerId === playerId && raw.goal) state.playerGoals += 1;
    if (raw.strikerId === playerId && raw.perfect) state.perfectShots += 1;
    if (raw.keeperId === playerId && raw.outcome === "SAVE") state.playerSaves += 1;
    state.scores = nextScores;
    state.histories = nextHistories;
    const finishedResolution = { ...raw, scores: nextScores, histories: nextHistories };
    setResolution(finishedResolution);
    setSubmitted(true);
    setPhase("replay");
    playCue(raw.outcome === "GOAL" ? "goal" : raw.outcome === "SAVE" ? "save" : "kick");
    HapticManager.pulse(raw.outcome === "GOAL" ? "major" : raw.outcome === "SAVE" ? "success" : "failure");
    const timer = window.setTimeout(() => {
      const nextTurn = state.turn + 1;
      const pairFinished = nextTurn >= 10 && nextTurn % 2 === 0;
      if (pairFinished && nextScores[playerId] !== nextScores[rivalId]) {
        const winnerId = nextScores[playerId] > nextScores[rivalId] ? playerId : rivalId;
        const stats = { goals: state.playerGoals, saves: state.playerSaves, perfectShots: state.perfectShots };
        if (mode === "live" && match) {
          void (async () => {
            try {
              const settled = await gameplayRequest<{ result: MatchResult }>("penalty-kings", {
                action: "FINISH", matchId: match.matchId, scores: nextScores, histories: nextHistories,
                suddenDeath: state.suddenDeath, rounds: nextTurn, stats,
              });
              setResult(settled.result);
              if (settled.result.profile) {
                setSession((current) => current ? {
                  ...current,
                  level: settled.result.profile?.level ?? current.level,
                  rank: settled.result.profile?.rank ?? current.rank,
                  winStreak: settled.result.profile?.winStreak ?? current.winStreak,
                  profile: { ...current.profile, ...settled.result.profile },
                } : current);
              }
              triggerGameCinematic({ kind: settled.result.winnerId === playerId ? "win" : "loss", game: "PENALTY KINGS", kicker: "SHOOTOUT COMPLETE", center: settled.result.winnerId === playerId ? "YOU WIN" : "FULL TIME", accent: "#6ee7b7", accent2: "#fbbf24", icon: "goal", durationMs: 2200 });
              setPhase("result"); void wallet.refreshWallet();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "The shootout result could not be verified.");
              setPhase("error");
            }
          })();
        } else {
          setResult({ winnerId, winnerName: winnerId === playerId ? playerName : rivalName, scores: nextScores, histories: nextHistories, suddenDeath: state.suddenDeath, xpAwarded: winnerId === playerId ? 380 : 140, creditsAwarded: 0, rankDelta: winnerId === playerId ? 12 : -7, stats });
          triggerGameCinematic({ kind: winnerId === playerId ? "win" : "loss", game: "PENALTY KINGS", kicker: "PRACTICE COMPLETE", center: winnerId === playerId ? "YOU WIN" : "FULL TIME", accent: "#6ee7b7", accent2: "#fbbf24", icon: "goal", durationMs: 2200 });
          setPhase("result");
        }
        return;
      }
      if (nextTurn >= 10) state.suddenDeath = true;
      state.turn = nextTurn;
      const strikerId = nextTurn % 2 === 0 ? playerId : rivalId;
      const nextPacket: TurnPacket = { turn: nextTurn, strikerId, keeperId: strikerId === playerId ? rivalId : playerId, shotNumber: Math.floor(nextTurn / 2) + 1, suddenDeath: state.suddenDeath, deadlineAt: Date.now() + 8000, pressureText: state.suddenDeath ? "SUDDEN DEATH" : nextTurn >= 8 ? (strikerId === playerId ? "MUST SCORE" : "SAVE TO WIN") : "", scores: nextScores, histories: nextHistories };
      setTurn(nextPacket); setResolution(null); setSubmitted(false); setPhase("turn");
      if (nextPacket.pressureText) playCue("tension");
    }, 3400);
    timersRef.current.push(timer);
  }, [match, mode, playCue, playerId, playerName, rivalId, rivalName, wallet]);

  const startTraining = () => {
    const practiceSession: Session = { token: "", playerId: "practice-player", username: "Mudassir", level: 27, rank: "Gold II", winStreak: 4, profile: { xp: 8420, goals: 684, saves: 193, wins: 87, losses: 42, perfectShots: 116, bestWinStreak: 12 } };
    const practiceOpponent: Opponent = { id: "practice-rival", username: fictionalOpponentNameAt(Math.floor(Math.random() * FICTIONAL_OPPONENT_NAMES.length), [opponent?.username ?? ""]), level: 32, rank: "Diamond I", winStreak: 7, isBot: true };
    const startAt = Date.now() + 3_800;
    setSession(practiceSession); setOpponent(practiceOpponent);
    setMatch({ matchId: "training", startAt, environmentSeed: 27, opponent: practiceOpponent, firstStrikerId: practiceSession.playerId, tierId, aiFavored: true });
    trainingState.current = { scores: { [practiceSession.playerId]: 0, [practiceOpponent.id]: 0 }, histories: { [practiceSession.playerId]: [], [practiceOpponent.id]: [] }, turn: 0, suddenDeath: false, playerGoals: 0, playerSaves: 0, perfectShots: 0 };
    setMode("training"); setResult(null); setResolution(null); setPhase("versus");
    triggerGameCinematic({ kind: "versus", game: "PENALTY KINGS", kicker: "PRACTICE SHOWDOWN", left: practiceSession.username, leftMeta: practiceSession.rank, right: practiceOpponent.username, rightMeta: practiceOpponent.rank, accent: "#6ee7b7", accent2: "#fb7185", icon: "goal", durationMs: 3300 });
    playCue("whistle");
    const timer = window.setTimeout(() => {
      setTurn({ turn: 0, strikerId: practiceSession.playerId, keeperId: practiceOpponent.id, shotNumber: 1, suddenDeath: false, deadlineAt: Date.now() + 8000, pressureText: "", scores: trainingState.current.scores, histories: trainingState.current.histories });
      setSubmitted(false); setPhase("turn");
    }, 1350);
    timersRef.current.push(timer);
  };

  const startLive = async () => {
    setMode("live"); setPhase("authorizing"); setError("");
    try {
      let authorized = session;
      if (!authorized) {
        const response = await fetch("/api/penalty-kings/session", { method: "POST", credentials: "same-origin" });
        const payload = await response.json() as Session;
        if (!response.ok) {
          if (response.status === 401) { router.push(`/login?next=${encodeURIComponent(`/play/penalty-kings?tier=${tierId}`)}`); return; }
          throw new Error(payload.error || "Match entry was not authorized.");
        }
        authorized = payload;
        setSession(payload);
      }
      setPhase("matching");
      const started = await gameplayRequest<{ match: MatchFound }>("penalty-kings", { action: "START", tierId, excludeOpponentName: opponent?.username });
      const found = started.match;
      setMatch(found); setOpponent(found.opponent); setResult(null); setResolution(null); setRematchWaiting(false);
      trainingState.current = { scores: { [authorized.playerId]: 0, [found.opponent.id]: 0 }, histories: { [authorized.playerId]: [], [found.opponent.id]: [] }, turn: 0, suddenDeath: false, playerGoals: 0, playerSaves: 0, perfectShots: 0 };
      setPhase("versus");
      triggerGameCinematic({ kind: "versus", game: "PENALTY KINGS", kicker: `${tier.name.toUpperCase()} · SHOOTOUT`, left: authorized.username, leftMeta: authorized.rank, right: found.opponent.username, rightMeta: found.opponent.rank, accent: "#6ee7b7", accent2: "#fb7185", icon: "goal", durationMs: 3400 });
      playCue("whistle");
      const timer = window.setTimeout(() => {
        setTurn({ turn: 0, strikerId: authorized.playerId, keeperId: found.opponent.id, shotNumber: 1, suddenDeath: false, deadlineAt: Date.now() + 8000, pressureText: "", scores: trainingState.current.scores, histories: trainingState.current.histories });
        setSubmitted(false); setPhase("turn");
      }, Math.max(0, found.startAt - Date.now() + 50));
      timersRef.current.push(timer);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not enter the shootout."); setPhase("error"); }
  };

  const submitShot = useCallback((shot: ShotInput) => {
    if (!turn || submitted || turn.strikerId !== playerId) return;
    setSubmitted(true); playCue("kick"); HapticManager.pulse("impact");
    applyTrainingResolution(resolveTraining(turn.turn, turn.strikerId, turn.keeperId, shot, advancedKeeperZone(shot, match?.aiFavored !== false)));
  }, [applyTrainingResolution, match?.aiFavored, playCue, playerId, submitted, turn]);

  const submitSave = useCallback((zone: KeeperZone) => {
    if (!turn || submitted || turn.keeperId !== playerId) return;
    setSubmitted(true); HapticManager.pulse("tap");
    applyTrainingResolution(resolveTraining(turn.turn, turn.strikerId, turn.keeperId, advancedBotShot(match?.aiFavored !== false), zone));
  }, [applyTrainingResolution, match?.aiFavored, playerId, submitted, turn]);

  const rematch = () => {
    if (mode === "training") { setPhase("landing"); window.setTimeout(startTraining, 120); return; }
    setRematchWaiting(true); window.setTimeout(() => void startLive(), 120);
  };
  const playAgain = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer)); timersRef.current = [];
    setMode(null); setPhase("landing"); setMatch(null); setOpponent(null); setTurn(null); setResolution(null); setResult(null); setSubmitted(false); setRematchWaiting(false); setError("");
  };

  const pressureText = turn?.pressureText || (turn?.suddenDeath ? "SUDDEN DEATH" : "");
  const resultWon = result?.winnerId === playerId;
  const profile = session?.profile ?? { xp: 8420, goals: 684, saves: 193, wins: 87, losses: 42, perfectShots: 116, bestWinStreak: 12 };
  const winRate = Math.round(profile.wins / Math.max(1, profile.wins + profile.losses) * 100);

  if (String(phase) === "landing") {
    return (
      <SimpleGameLobby
        name="Penalty Kings"
        image="/images/games/penalty-kings.webp"
        imageAlt="Football flying toward a goal as a goalkeeper dives"
        tiers={PENALTY_TIERS.map((item) => ({ id: item.id, name: item.name, entry: item.entry, reward: item.pool }))}
        selectedId={tierId}
        onSelect={setTierId}
        onPlay={() => void startLive()}
        howTo={["Choose an amount", "Swipe to shoot and dive", "Beat the expert CPU rival"]}
        error={error}
      />
    );
  }

  return (
    <div className="game-screen fixed inset-0 z-[70] overflow-hidden bg-[#020906] text-white selection:bg-emerald-300 selection:text-[#02120a]">
      <PenaltyKingsArena role={role} interactive={phase === "turn" && !submitted && !paused} resolution={resolution} turnKey={turn?.turn ?? -1} rain={weatherSeed === 0} onShot={submitShot} onSave={submitSave} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,6,4,.74),transparent_24%,transparent_67%,rgba(1,6,4,.86))]" />

      <header className="game-safe-top pointer-events-none absolute inset-x-0 z-30 flex items-center justify-between px-3 sm:px-6">
        <Link href="/play" aria-label="Leave Champions Arena" className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/45 text-white/80 backdrop-blur-xl transition hover:border-emerald-200/50 hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/45 px-3 py-2 text-[8px] font-black uppercase tracking-[.2em] text-amber-100/90 backdrop-blur-xl sm:px-4"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_9px_#4ade80]" /> Champions Arena <span className="hidden text-white/25 sm:inline">· {weatherSeed === 0 ? "Light rain" : "Clear night"}</span></div>
        <div className="pointer-events-auto flex gap-2"><button onClick={() => setPaused((value) => !value)} disabled={phase !== "turn"} aria-label={paused ? "Resume match" : "Pause match"} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/45 text-white/80 backdrop-blur-xl transition hover:border-emerald-200/50 disabled:opacity-35">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button><button onClick={() => setMuted((value) => !value)} aria-label={muted ? "Turn sound on" : "Mute sound"} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/45 text-white/80 backdrop-blur-xl transition hover:border-emerald-200/50">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button></div>
      </header>

      {phase !== "landing" && phase !== "authorizing" && phase !== "matching" && phase !== "error" && (
        <div className="pointer-events-none absolute inset-x-3 top-[66px] z-30 mx-auto max-w-[900px] rounded-2xl border border-white/10 bg-[#03110b]/78 px-3 py-2.5 shadow-[0_15px_45px_rgba(0,0,0,.35)] backdrop-blur-xl sm:inset-x-6 sm:top-[78px] sm:px-5 sm:py-3">
          <div className="flex items-center justify-between"><PlayerPlate name={playerName} rank={session?.rank ?? "Gold II"} score={scores[playerId] ?? 0} history={currentHistory} active={turn?.strikerId === playerId} /><div className="px-2 text-center"><p className="text-[7px] font-black uppercase tracking-[.22em] text-white/35">{turn?.suddenDeath ? "Sudden death" : `Round ${Math.min(5, turn?.shotNumber ?? 1)} / 5`}</p><p className="mt-1 whitespace-nowrap text-sm font-black text-white sm:text-xl"><span className="text-emerald-200">YOU {scores[playerId] ?? 0}</span><span className="mx-1.5 text-white/25">—</span>{scores[rivalId] ?? 0} RIVAL</p></div><PlayerPlate name={rivalName} rank={opponent?.rank ?? "Gold I"} score={scores[rivalId] ?? 0} history={rivalHistory} align="right" active={turn?.strikerId === rivalId} /></div>
          <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-6">{[
            { label: "Timer", value: `${turnSeconds}s` },
            { label: "Entry", value: mode === "training" ? "FREE" : `${tier.entry.toLocaleString()} CR` },
            { label: "Reward", value: mode === "training" ? "PRACTICE" : `${tier.pool.toLocaleString()} CR` },
            { label: "Objective", value: role === "keeper" ? "SAVE THE SHOT" : "SCORE THE SHOT" },
            { label: "Difficulty", value: "EXPERT CPU" },
            { label: "Level", value: `LV ${session?.level ?? 27}` },
          ].map((item) => <div key={item.label} className="rounded-md border border-white/[.07] bg-black/30 px-2 py-1"><p className="text-[5px] font-black uppercase tracking-widest text-white/30">{item.label}</p><p className="mt-0.5 truncate text-[7px] font-black text-white/80">{item.value}</p></div>)}</div>
        </div>
      )}

      {paused && phase === "turn" && <div className="absolute inset-0 z-40 grid place-items-center bg-[#010704]/78 backdrop-blur-md"><div className="rounded-[2rem] border border-emerald-200/20 bg-[#03150c]/95 p-8 text-center"><Pause className="mx-auto h-9 w-9 text-emerald-200" /><h2 className="mt-4 text-4xl font-black italic">MATCH PAUSED</h2><p className="mt-2 text-xs text-white/45">Your controls are locked. Resume when ready.</p><button onClick={() => setPaused(false)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-7 py-3 text-[10px] font-black uppercase tracking-widest text-[#03130a]"><Play className="h-4 w-4" /> Resume</button></div></div>}

      {phase === "landing" && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-[linear-gradient(90deg,rgba(1,7,4,.92)_0%,rgba(1,7,4,.7)_46%,rgba(1,7,4,.18)_100%)] px-4 pb-12 pt-20 sm:px-7 lg:px-12">
          <div className="mx-auto grid min-h-full max-w-[1440px] items-center gap-8 lg:grid-cols-[1fr_370px]">
            <div className="max-w-3xl py-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.24em] text-amber-200 backdrop-blur"><Crown className="h-3.5 w-3.5" /> Single-player football</div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[.52em] text-emerald-300">The pressure is real</p>
              <h1 className="mt-2 text-[clamp(4.4rem,11vw,9.7rem)] font-black italic leading-[.72] tracking-[-.085em] drop-shadow-[0_18px_65px_rgba(0,0,0,.9)]">PENALTY<br /><span className="bg-gradient-to-b from-white via-lime-100 to-emerald-400 bg-clip-text text-transparent">KINGS</span></h1>
              <p className="mt-6 max-w-xl text-base font-semibold leading-7 text-white/70 sm:text-lg">Aim the strike. Read the keeper. Own the moment.</p>
              <div className="mt-7 flex flex-wrap gap-2.5">{[{ icon: Target, text: "Skill-based aim" }, { icon: ShieldCheck, text: "Expert CPU" }, { icon: ShieldCheck, text: "Advanced difficulty" }, { icon: Sparkles, text: "Cinematic replay" }].map(({ icon: Icon, text }) => <span key={text} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[8px] font-black uppercase tracking-[.15em] text-white/60 backdrop-blur"><Icon className="h-3 w-3 text-emerald-300" />{text}</span>)}</div>
              <div className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-black/48 p-3 backdrop-blur-xl sm:p-4">
                <div className="mb-3 flex items-center justify-between"><div><p className="text-[8px] font-black uppercase tracking-[.22em] text-white/35">Choose challenge stakes</p><p className="mt-1 text-xs font-bold text-white/75">Your entry unlocks the listed prize</p></div><LockKeyhole className="h-4 w-4 text-emerald-300" /></div>
                <div className="grid grid-cols-3 gap-2">{PENALTY_TIERS.map((item) => <button key={item.id} onClick={() => setTierId(item.id)} className={`rounded-xl border px-3 py-3 text-left transition ${tierId === item.id ? "border-emerald-300/60 bg-emerald-300/14 shadow-[0_0_24px_rgba(74,222,128,.12)]" : "border-white/10 bg-white/[.035] hover:border-white/25"}`}><p className="text-[7px] font-black uppercase tracking-widest text-white/40">{item.name}</p><p className="mt-1 text-lg font-black text-white sm:text-xl">{item.entry.toLocaleString()}</p><p className="text-[7px] font-bold uppercase tracking-wider text-amber-200/70">{item.pool.toLocaleString()} prize</p></button>)}</div>
              </div>
              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row"><button onClick={startLive} className="group inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200/55 bg-gradient-to-r from-emerald-500 to-lime-400 px-7 py-4 text-[11px] font-black uppercase tracking-[.16em] text-[#02150b] shadow-[0_0_38px_rgba(74,222,128,.24)] transition hover:-translate-y-0.5 hover:shadow-[0_0_50px_rgba(74,222,128,.38)]"><Swords className="h-4 w-4" /> Challenge expert rival <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" /></button><button onClick={startTraining} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/45 px-6 py-4 text-[10px] font-black uppercase tracking-[.15em] text-white/75 backdrop-blur transition hover:border-amber-200/40 hover:text-white"><Target className="h-4 w-4 text-amber-300" /> Practice controls</button></div>
              <p className="mt-3 text-[8px] font-bold uppercase tracking-[.17em] text-white/30">Virtual credits only · instant single-player match · training has no entry fee</p>
            </div>
            <aside className="hidden space-y-3 lg:block">
              <div className="rounded-[1.5rem] border border-white/10 bg-[#03100b]/78 p-5 shadow-2xl backdrop-blur-xl"><div className="flex items-center justify-between"><div><p className="text-[8px] font-black uppercase tracking-[.2em] text-amber-300">Gold II</p><h2 className="mt-1 text-xl font-black">MUDASSIR</h2><p className="mt-1 text-[9px] text-white/35">Level 27 · 8,420 XP</p></div><div className="grid h-14 w-14 place-items-center rounded-2xl border border-amber-200/20 bg-[radial-gradient(circle,#ffcf4930,transparent_70%)]"><Medal className="h-7 w-7 text-amber-300" /></div></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[72%] bg-gradient-to-r from-amber-500 to-amber-200" /></div><div className="mt-4 grid grid-cols-4 gap-2">{[{ label: "Win %", value: `${winRate}%` }, { label: "Goals", value: profile.goals }, { label: "Saves", value: profile.saves }, { label: "Perfect", value: profile.perfectShots }].map((stat) => <div key={stat.label} className="rounded-xl border border-white/[.07] bg-white/[.035] p-2 text-center"><p className="text-sm font-black text-white">{stat.value}</p><p className="mt-1 text-[6px] font-black uppercase tracking-widest text-white/35">{stat.label}</p></div>)}</div><div className="mt-3 flex items-center justify-between rounded-xl border border-rose-300/10 bg-rose-400/[.06] px-3 py-2"><span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-rose-200"><Flame className="h-3.5 w-3.5" /> Win streak</span><b className="text-sm text-white">4</b></div></div>
              <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur"><div className="flex items-center gap-2"><CircleDot className="h-4 w-4 text-emerald-300" /><p className="text-[8px] font-black uppercase tracking-widest text-white/55">Daily mission</p></div><p className="mt-3 text-xs font-bold">Score 5 top corners</p><div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-3/5 bg-emerald-300" /></div><p className="mt-2 text-[7px] text-white/35">3 / 5 · +250 XP</p></div><div className="rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur"><div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-300" /><p className="text-[8px] font-black uppercase tracking-widest text-white/55">Leaderboard</p></div><div className="mt-3 space-y-2">{[["1", "RAYYAN", "1,842"], ["2", "ZAIN", "1,790"], ["18", "YOU", "1,214"]].map((row) => <div key={row[0]} className="flex items-center text-[8px]"><b className="w-5 text-amber-200">{row[0]}</b><span className="flex-1 font-bold text-white/65">{row[1]}</span><span className="text-white/35">{row[2]}</span></div>)}</div></div></div>
              <div className="rounded-2xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-white/45"><Star className="h-3.5 w-3.5 text-violet-300" /> Recent achievement</span><span className="text-[8px] text-emerald-300">UNLOCKED</span></div><p className="mt-2 text-xs font-bold">Ice in the Veins · Score a match-point Panenka</p></div>
            </aside>
          </div>
        </div>
      )}

      {(phase === "authorizing" || phase === "matching") && <div className="absolute inset-0 z-20 grid place-items-center bg-[#010704]/78 px-5 backdrop-blur-sm"><div className="w-full max-w-md text-center"><div className="relative mx-auto h-24 w-24"><span className="absolute inset-0 animate-ping rounded-full border border-emerald-300/25" /><span className="absolute inset-4 animate-pulse rounded-full border border-emerald-300/50" /><div className="absolute inset-0 grid place-items-center"><Bot className="h-7 w-7 text-emerald-300" /></div></div><p className="mt-5 text-[9px] font-black uppercase tracking-[.35em] text-emerald-300">{phase === "authorizing" ? "Securing your entry" : "Calibrating expert rival"}</p><h2 className="mt-3 text-3xl font-black italic tracking-tight">{phase === "authorizing" ? "ENTERING THE TUNNEL" : "PREPARING INSTANT MATCH"}</h2><p className="mt-3 text-xs text-white/45">{tier.entry.toLocaleString()} credits · single player · very hard CPU difficulty</p></div></div>}

      {phase === "versus" && <div className="absolute inset-0 z-20 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(12,62,34,.32),rgba(1,6,4,.82)_60%)] px-5 backdrop-blur-[2px]"><div className="w-full max-w-4xl text-center"><p className="text-[10px] font-black uppercase tracking-[.48em] text-emerald-300">Penalty Kings</p><div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-10"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-cyan-200/20 bg-cyan-300/10 text-2xl font-black text-cyan-200 shadow-[0_0_38px_rgba(34,211,238,.14)] sm:h-28 sm:w-28">{playerName.slice(0, 2)}</div><h2 className="mt-4 text-xl font-black sm:text-3xl">{playerName}</h2><p className="mt-1 text-[9px] font-black uppercase tracking-[.2em] text-amber-200">{session?.rank ?? "Gold II"}</p></div><div><p className="text-4xl font-black italic text-white/18 sm:text-6xl">VS</p><div className="mx-auto mt-4 h-12 w-px bg-gradient-to-b from-emerald-300 to-transparent" /></div><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-rose-200/20 bg-rose-300/10 text-2xl font-black text-rose-200 shadow-[0_0_38px_rgba(251,113,133,.14)] sm:h-28 sm:w-28">{rivalName.slice(0, 2)}</div><h2 className="mt-4 text-xl font-black sm:text-3xl">{rivalName}</h2><p className="mt-1 text-[9px] font-black uppercase tracking-[.2em] text-amber-200">{opponent?.rank ?? "Gold I"}</p></div></div><div className="mx-auto mt-8 w-fit rounded-full border border-amber-200/20 bg-amber-300/[.08] px-5 py-2 text-[9px] font-black uppercase tracking-[.2em] text-amber-100">Prize pool: {mode === "training" ? "Practice match" : `${tier.pool.toLocaleString()} credits`}</div><div key={countdown} className="mt-8 animate-[countdownPop_.8s_ease_both] text-3xl font-black italic tracking-tight text-white sm:text-5xl">{countdown}</div></div></div>}

      {phase === "turn" && pressureText && <div key={`${turn?.turn}-${pressureText}`} className="pointer-events-none absolute inset-0 z-20 grid place-items-center"><div className="animate-[pressureFlash_1.35s_ease_both] text-center"><p className="text-[clamp(2.8rem,9vw,7rem)] font-black italic leading-none tracking-[-.06em] text-white drop-shadow-[0_10px_45px_rgba(0,0,0,.9)]">{pressureText}</p><span className="mt-2 block text-[9px] font-black uppercase tracking-[.42em] text-amber-300">Hold your nerve</span></div></div>}
      {phase === "turn" && submitted && <div className="pointer-events-none absolute bottom-[10%] left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-black/60 px-5 py-2 text-[8px] font-black uppercase tracking-[.2em] text-white/65 backdrop-blur">Locked in · the rival is responding</div>}
      {phase === "replay" && resolution && <div className="pointer-events-none absolute inset-0 z-20"><div className="absolute inset-x-0 top-[33%] text-center"><p className={`animate-[outcomePop_1.1s_ease_both] text-[clamp(3.2rem,10vw,8.5rem)] font-black italic leading-none tracking-[-.07em] drop-shadow-[0_12px_55px_rgba(0,0,0,.9)] ${resolution.outcome === "GOAL" ? "text-emerald-300" : resolution.outcome === "SAVE" ? "text-amber-200" : "text-white"}`}>{resolution.outcome === "GOAL" ? "GOOOOOAL! ⚽🔥" : resolution.outcome === "SAVE" ? "WHAT A SAVE! 🧤" : "OFF TARGET"}</p><p className="mt-4 text-[9px] font-black uppercase tracking-[.32em] text-white/70">{resolution.shotType.replace("_", " ")}{resolution.perfect ? " · PERFECT TIMING" : ""}</p></div><div className="absolute bottom-7 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-black/45 px-4 py-2 text-[7px] font-black uppercase tracking-[.2em] text-white/45 backdrop-blur"><Sparkles className="mr-1.5 inline h-3 w-3 text-emerald-300" /> Cinematic replay</div></div>}

      {phase === "result" && result && <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-[#010604]/78 px-4 py-20 backdrop-blur-md"><div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/12 bg-[radial-gradient(circle_at_50%_0%,rgba(74,222,128,.18),transparent_35%),rgba(3,14,9,.94)] p-6 text-center shadow-[0_35px_100px_rgba(0,0,0,.65)] sm:p-9"><div className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl border ${resultWon ? "border-amber-200/30 bg-amber-300/10" : "border-white/15 bg-white/[.04]"}`}>{resultWon ? <Trophy className="h-8 w-8 text-amber-300" /> : <Shield className="h-8 w-8 text-white/50" />}</div><p className="mt-5 text-[9px] font-black uppercase tracking-[.35em] text-emerald-300">Full time · {result.suddenDeath ? "Sudden death" : "5 penalties"}</p><h2 className="mt-2 text-5xl font-black italic tracking-[-.055em] sm:text-7xl">{resultWon ? "YOU ARE KING" : "SO CLOSE"}</h2><p className="mt-3 text-sm text-white/50">{resultWon ? `${rivalName} could not handle the pressure.` : `${result.winnerName.toUpperCase()} takes this one. Challenge the rival again.`}</p><div className="mx-auto mt-7 flex max-w-sm items-center justify-center gap-7 rounded-2xl border border-white/10 bg-black/30 px-6 py-4"><div><p className="text-[8px] font-black uppercase tracking-widest text-white/35">{playerName}</p><p className="mt-1 text-4xl font-black text-emerald-300">{result.scores[playerId] ?? 0}</p></div><span className="text-2xl text-white/20">—</span><div><p className="text-[8px] font-black uppercase tracking-widest text-white/35">{rivalName}</p><p className="mt-1 text-4xl font-black">{result.scores[rivalId] ?? 0}</p></div></div><div className="mt-4 grid grid-cols-3 gap-2">{[{ label: "Goals", value: result.stats.goals }, { label: "Saves", value: result.stats.saves }, { label: "Perfect", value: result.stats.perfectShots }].map((stat) => <div key={stat.label} className="rounded-xl border border-white/[.08] bg-white/[.035] py-3"><p className="text-xl font-black">{stat.value}</p><p className="mt-1 text-[7px] font-black uppercase tracking-widest text-white/35">{stat.label}</p></div>)}</div><div className="mt-4 flex items-center justify-center gap-4 text-[9px] font-black uppercase tracking-widest"><span className="text-cyan-200">+{result.xpAwarded} XP</span><span className={result.rankDelta >= 0 ? "text-emerald-300" : "text-rose-300"}>{result.rankDelta >= 0 ? "+" : ""}{result.rankDelta} RP</span>{result.creditsAwarded > 0 && <span className="text-amber-200">+{result.creditsAwarded.toLocaleString()} CR</span>}</div><div className="mt-7 grid gap-2 sm:grid-cols-2"><button onClick={rematch} disabled={rematchWaiting} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200/55 bg-gradient-to-r from-emerald-500 to-lime-400 px-6 py-4 text-[11px] font-black uppercase tracking-[.15em] text-[#02150b] shadow-[0_0_32px_rgba(74,222,128,.22)] disabled:opacity-70"><RefreshCcw className={`h-4 w-4 ${rematchWaiting ? "animate-spin" : ""}`} />{rematchWaiting ? "Preparing rival" : "⚽ Play again"}</button><button onClick={playAgain} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[.045] px-6 py-4 text-[10px] font-black uppercase tracking-[.15em] text-white/75 hover:border-white/30"><Goal className="h-4 w-4" /> Back to arena</button></div></div></div>}

      {phase === "error" && <div className="absolute inset-0 z-50 grid place-items-center bg-[#010604]/88 px-5 backdrop-blur-md"><div className="w-full max-w-md rounded-[1.5rem] border border-rose-300/20 bg-[#100909]/90 p-7 text-center"><Shield className="mx-auto h-8 w-8 text-rose-300" /><h2 className="mt-4 text-2xl font-black italic">MATCH INTERRUPTED</h2><p className="mt-3 text-xs leading-6 text-white/55">{error || "The match could not continue."}</p><button onClick={playAgain} className="mt-6 rounded-xl border border-white/15 bg-white/[.06] px-6 py-3 text-[9px] font-black uppercase tracking-widest text-white">Back to lobby</button></div></div>}
      {error && phase !== "error" && <div className="pointer-events-none absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-200/25 bg-black/75 px-5 py-2 text-[8px] font-bold text-amber-100 backdrop-blur">{error}</div>}
    </div>
  );
}
