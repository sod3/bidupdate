"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Flag,
  Gauge,
  Headphones,
  Loader2,
  Medal,
  RotateCcw,
  ShieldCheck,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import type { RaceStats, RaceTelemetry } from "@/components/neon/RaceCanvas";
import { formatRaceTime, tierById, vehicleById } from "@/lib/neon/constants";
import { gameplayRequest } from "@/lib/gameplayClient";
import { useWallet } from "@/context/WalletContext";
import { triggerGameCinematic } from "@/lib/gameCinematics";
import { preloadGameRenderer, useIdleGamePreload } from "@/lib/gamePerformance";
import { getWarmRaceSession, RaceSessionWarmupError } from "@/lib/raceSessionWarmup";

const RaceCanvas = dynamic(() => import("@/components/neon/RaceCanvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-[#03060b]">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
        <p className="mt-3 text-[9px] font-black uppercase tracking-[.25em] text-slate-500">
          Building Night City
        </p>
      </div>
    </div>
  ),
});
const preloadRaceCanvas = () => preloadGameRenderer(RaceCanvas);

type Phase =
  "auth" | "matching" | "versus" | "racing" | "waiting" | "result" | "error";
type SessionPayload = {
  token: string;
  playerId: string;
  username: string;
  level: number;
  rank: string;
  error?: string;
};
type Opponent = {
  id: string;
  username: string;
  level: number;
  rank: string;
  vehicleId: string;
  winStreak: number;
  isBot?: boolean;
};
type MatchFound = {
  matchId: string;
  startAt: number;
  environmentSeed: number;
  opponent: Opponent;
  aiTargetTimeMs?: number;
};
type ResultPlayer = {
  id: string;
  username: string;
  finishTimeMs: number | null;
  stats: RaceStats | null;
  result: "WIN" | "LOSS" | "DNF";
};
type MatchResult = {
  winnerId: string;
  photoFinish: boolean;
  differenceMs: number | null;
  players: ResultPlayer[];
  xpAwarded: number;
  creditsAwarded: number;
  rankDelta: number;
};

function synthTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  gainValue = 0.04,
) {
  if (typeof window === "undefined") return;
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  gain.gain.setValueAtTime(gainValue, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + duration,
  );
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.onended = () => void context.close();
}

export function RaceExperience({
  tierId,
  vehicleId,
}: {
  tierId: string;
  vehicleId: string;
}) {
  useIdleGamePreload(preloadRaceCanvas);
  const router = useRouter();
  const wallet = useWallet();
  const tier = useMemo(() => tierById(tierId), [tierId]);
  const vehicle = useMemo(() => vehicleById(vehicleId), [vehicleId]);
  const mutedRef = useRef(false);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [phase, setPhase] = useState<Phase>("auth");
  const [error, setError] = useState("");
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [opponentState, setOpponentState] = useState<RaceTelemetry | null>(
    null,
  );
  const [match, setMatch] = useState<MatchFound | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      try {
        let payload: SessionPayload;
        try {
          payload = await getWarmRaceSession();
        } catch (caught) {
          if (caught instanceof RaceSessionWarmupError && caught.status === 401) {
            router.replace(
              `/login?next=${encodeURIComponent(`/play/race?tier=${tier.id}&car=${vehicle.id}`)}`,
            );
            return;
          }
          throw caught;
        }
        if (cancelled) return;
        setSession(payload);
        setPhase("matching");
        const started = await gameplayRequest<{ match: MatchFound }>("racing", { action: "START", tierId: tier.id, vehicleId: vehicle.id });
        if (cancelled) return;
        const found = started.match;
        setMatch(found);
        setOpponent(found.opponent);
        setPhase("versus");
        triggerGameCinematic({ kind: "versus", game: "NEON DRIFT", kicker: `${tier.name.toUpperCase()} · NIGHT CITY`, left: payload.username || "YOU", leftMeta: vehicle.name.toUpperCase(), right: found.opponent.username, rightMeta: found.opponent.rank.toUpperCase(), accent: "#67e8f9", accent2: "#a78bfa", icon: "race", durationMs: 3500 });
        if (!mutedRef.current) synthTone(110, 0.22, "sawtooth", 0.025);
        const delay = Math.max(0, found.startAt - Date.now() + 60);
        window.setTimeout(() => { if (!cancelled) setPhase("racing"); }, delay);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not prepare the CPU race.",
          );
          setPhase("error");
        }
      }
    };
    void connect();
    return () => {
      cancelled = true;
    };
  }, [router, tier.id, vehicle.id]);

  useEffect(() => {
    if (!match || (phase !== "racing" && phase !== "waiting")) return;
    const update = () => {
      const targetTime = match.aiTargetTimeMs ?? 55_000;
      const elapsed = Math.max(0, Date.now() - match.startAt);
      const z = Math.min(4200, elapsed / targetTime * 4200);
      setOpponentState({ x: 2.6 + Math.sin(elapsed / 900) * .7, z, speed: z >= 4200 ? 0 : 265 + Math.sin(elapsed / 520) * 18, heading: 0, checkpoint: Math.min(7, Math.floor(z / 600)), nitro: 55, drifting: Math.sin(elapsed / 1200) > .72 });
    };
    update();
    const interval = window.setInterval(update, 100);
    return () => window.clearInterval(interval);
  }, [match, phase]);

  const sendTelemetry = useCallback(() => undefined, []);
  const finish = useCallback(async (stats: RaceStats) => {
    if (!match || !session) return;
    setPhase("waiting");
    try {
      const settled = await gameplayRequest<{ result: MatchResult }>("racing", { action: "FINISH", matchId: match.matchId, vehicleId: vehicle.id, stats });
      setResult(settled.result);
      triggerGameCinematic({ kind: settled.result.winnerId === session.playerId ? "win" : "loss", game: "NEON DRIFT", kicker: settled.result.winnerId === session.playerId ? "PHOTO FINISH" : "RACE COMPLETE", center: settled.result.winnerId === session.playerId ? "VICTORY" : "FINISH", accent: "#67e8f9", accent2: "#a78bfa", icon: "race", durationMs: 2200 });
      setPhase("result");
      void wallet.refreshWallet();
      if (!mutedRef.current) synthTone(settled.result.winnerId === session.playerId ? 660 : 220, 0.65, "triangle", 0.055);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The race result could not be verified.");
      setPhase("error");
    }
  }, [match, session, vehicle.id, wallet]);

  const cancel = () => {
    router.push("/play");
  };

  const playAgain = () => window.location.reload();
  const you = result?.players.find((player) => player.id === session?.playerId);
  const rival = result?.players.find(
    (player) => player.id !== session?.playerId,
  );
  const won = Boolean(you && result?.winnerId === you.id);

  return (
    <div className="game-screen race-fullscreen fixed inset-0 z-[100] overflow-hidden bg-[#02050a]">
      {match && (
        <RaceCanvas
          active={phase === "racing" || phase === "waiting"}
          startAt={match.startAt}
          vehicleId={vehicle.id}
          opponentName={opponent?.username ?? "RIVAL"}
          opponentState={opponentState}
          entryCredits={tier.entry}
          possibleReward={tier.pool}
          difficulty={tier.difficulty}
          level={session?.level ?? 1}
          muted={muted}
          onTelemetry={sendTelemetry}
          onFinish={finish}
        />
      )}
      <div className="game-safe-top absolute left-3 z-[120] flex items-center gap-2">
        <button
          onClick={cancel}
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/40 text-slate-300 backdrop-blur hover:text-white"
          aria-label="Leave race"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setMuted((value) => !value)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/40 text-slate-300 backdrop-blur"
          aria-label="Toggle sound"
        >
          {muted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
      </div>

      {phase === "auth" && (
        <div className="absolute inset-0 grid place-items-center bg-[#040812]">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[.28em] text-slate-500">
              Securing race session
            </p>
          </div>
        </div>
      )}

      {phase === "matching" && (
        <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[#040812]">
          <div className="neon-grid absolute inset-0 opacity-50" />
          <div className="absolute h-[70vw] w-[70vw] max-h-[760px] max-w-[760px] rounded-full border border-cyan-300/10">
            <span className="absolute inset-[16%] rounded-full border border-violet-300/10" />
            <span className="absolute inset-[34%] rounded-full border border-cyan-300/10" />
          </div>
          <div className="relative z-10 w-full max-w-lg px-6 text-center">
            <div className="relative mx-auto grid h-28 w-28 place-items-center rounded-full border border-cyan-300/25 bg-cyan-300/[.04]">
              <div className="absolute inset-2 animate-spin rounded-full border border-transparent border-t-cyan-300 border-r-violet-400 [animation-duration:2s]" />
              <Gauge className="h-9 w-9 text-cyan-200" />
            </div>
            <p className="neon-eyebrow mt-8">Single-player race</p>
            <h1 className="font-display mt-2 text-3xl font-black italic text-white sm:text-5xl">
              CALIBRATING EXPERT AI...
            </h1>
            <p className="mt-3 text-xs text-slate-500">
              {tier.name} · {tier.entry.toLocaleString()} CR entry · no matchmaking
            </p>
            <div className="animate-match-scan mx-auto mt-8 h-px w-56 bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
            <p className="mt-3 text-[9px] font-black uppercase tracking-[.22em] text-cyan-200">
              Instant opponent · advanced adaptive AI
            </p>
            <button
              onClick={cancel}
              className="mt-8 rounded-xl border border-white/10 px-5 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white"
            >
              Leave race
            </button>
          </div>
        </div>
      )}

      {phase === "versus" && opponent && (
        <div className="absolute inset-0 z-30 grid place-items-center overflow-hidden bg-[#03060b]/92 backdrop-blur-sm">
          <div className="absolute inset-0 bg-[url('/images/neon-drift-hero.webp')] bg-cover bg-center opacity-20" />
          <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(0,225,255,.09),transparent_42%,rgba(151,71,255,.12))]" />
          <div className="relative z-10 w-full max-w-5xl px-5 text-center">
            <p className="neon-eyebrow">Expert CPU ready</p>
            <h2 className="font-display mt-2 text-3xl font-black italic text-white sm:text-5xl">
              NIGHT CITY CIRCUIT
            </h2>
            <p className="mt-2 text-[9px] font-black uppercase tracking-[.22em] text-slate-500">
              Prize pool:{" "}
              <b className="text-amber-200">
                {tier.pool.toLocaleString()} credits
              </b>
            </p>
            <div className="mt-10 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
              <div className="translate-x-0 rounded-[1.5rem] border border-cyan-300/25 bg-cyan-300/[.05] p-4 text-left sm:p-7">
                <p className="text-[8px] font-black uppercase tracking-widest text-cyan-300">
                  You
                </p>
                <h3 className="font-display mt-2 truncate text-2xl font-black italic text-white sm:text-4xl">
                  {session?.username}
                </h3>
                <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Level {session?.level} · {session?.rank}
                </p>
                <p className="mt-6 text-[9px] font-black uppercase tracking-widest text-cyan-200">
                  {vehicle.name}
                </p>
              </div>
              <span
                className="font-display text-4xl font-black italic text-white sm:text-7xl"
                style={{ textShadow: "0 0 30px rgba(168,85,247,.7)" }}
              >
                VS
              </span>
              <div className="rounded-[1.5rem] border border-violet-300/25 bg-violet-300/[.05] p-4 text-right sm:p-7">
                <p className="text-[8px] font-black uppercase tracking-widest text-violet-300">
                  Expert CPU
                </p>
                <h3 className="font-display mt-2 truncate text-2xl font-black italic text-white sm:text-4xl">
                  {opponent.username}
                </h3>
                <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Level {opponent.level} · {opponent.rank}
                </p>
                <p className="mt-6 text-[9px] font-black uppercase tracking-widest text-violet-200">
                  {vehicleById(opponent.vehicleId).name}
                  {opponent.winStreak > 2
                    ? ` · 🔥 ${opponent.winStreak} streak`
                    : ""}
                </p>
              </div>
            </div>
            <div className="mt-8 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[.2em] text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> CPU synchronized start
            </div>
          </div>
        </div>
      )}

      {phase === "waiting" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/55 backdrop-blur-sm">
          <div className="rounded-[2rem] border border-white/10 bg-[#090f19]/95 p-8 text-center">
            <Flag className="mx-auto h-8 w-8 text-cyan-300" />
            <h2 className="font-display mt-4 text-3xl font-black italic text-white">
              FINISH RECORDED
            </h2>
            <p className="mt-2 text-xs text-slate-500">
              Server is verifying your finish against the CPU time...
            </p>
            <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-violet-300" />
          </div>
        </div>
      )}

      {phase === "result" && result && you && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-[#03060b]/94 px-4 py-10 backdrop-blur-md">
          <div className="mx-auto max-w-3xl text-center">
            {result.photoFinish && (
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/[.07] px-4 py-2 text-[9px] font-black uppercase tracking-[.22em] text-violet-200">
                <Zap className="h-3.5 w-3.5" /> Photo finish ·{" "}
                {result.differenceMs
                  ? (result.differenceMs / 1000).toFixed(3)
                  : "0.000"}{" "}
                sec
              </div>
            )}
            {won ? (
              <Trophy className="mx-auto h-12 w-12 text-amber-300" />
            ) : (
              <Medal className="mx-auto h-12 w-12 text-cyan-300" />
            )}
            <p
              className={`neon-eyebrow mt-5 ${won ? "text-amber-300" : "text-cyan-300"}`}
            >
              {won ? "Winner confirmed" : "Keep the pressure"}
            </p>
            <h1 className="font-display mt-2 text-6xl font-black italic tracking-[-.06em] text-white sm:text-8xl">
              {won ? "VICTORY" : "SO CLOSE!"}
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              {session?.username} ·{" "}
              {you.finishTimeMs ? formatRaceTime(you.finishTimeMs) : "DNF"}
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="neon-panel rounded-2xl p-5 text-left">
                <p className="text-[8px] font-black uppercase tracking-widest text-cyan-300">
                  Your run
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {[
                    {
                      l: "Race time",
                      v: you.finishTimeMs
                        ? formatRaceTime(you.finishTimeMs)
                        : "DNF",
                    },
                    { l: "Perfect drifts", v: you.stats?.perfectDrifts ?? 0 },
                    { l: "Near misses", v: you.stats?.nearMisses ?? 0 },
                    {
                      l: "Top speed",
                      v: `${you.stats?.topSpeedKmh ?? 0} KM/H`,
                    },
                  ].map((item) => (
                    <div key={item.l}>
                      <p className="text-[7px] font-bold uppercase tracking-widest text-slate-600">
                        {item.l}
                      </p>
                      <p className="mt-1 text-sm font-black text-white">
                        {item.v}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="neon-panel rounded-2xl p-5 text-left">
                <p className="text-[8px] font-black uppercase tracking-widest text-violet-300">
                  Expert CPU run
                </p>
                <p className="font-display mt-4 text-2xl font-black italic text-white">
                  {rival?.username}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {rival?.finishTimeMs
                    ? formatRaceTime(rival.finishTimeMs)
                    : "DNF"}
                </p>
                <div className="mt-5 flex justify-between border-t border-white/[.06] pt-4 text-xs">
                  <span className="text-slate-500">Difference</span>
                  <b className="text-white">
                    {result.differenceMs
                      ? `${(result.differenceMs / 1000).toFixed(3)} SEC`
                      : "—"}
                  </b>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-[7px] uppercase tracking-widest text-slate-600">
                  XP
                </p>
                <p className="mt-1 text-xl font-black text-violet-200">
                  +{result.xpAwarded}
                </p>
              </div>
              <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-[7px] uppercase tracking-widest text-slate-600">
                  Credits
                </p>
                <p className="mt-1 text-xl font-black text-cyan-200">
                  +{result.creditsAwarded}
                </p>
              </div>
              <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-[7px] uppercase tracking-widest text-slate-600">
                  Rank points
                </p>
                <p
                  className={`mt-1 text-xl font-black ${result.rankDelta >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {result.rankDelta >= 0 ? "+" : ""}
                  {result.rankDelta}
                </p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                onClick={playAgain}
                className="neon-button gap-2 px-7 py-4 text-xs"
              >
                <RotateCcw className="h-4 w-4" /> Play again
              </button>
              <Link
                href="/play"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white"
              >
                <Flag className="h-4 w-4" /> Race another rival
              </Link>
              <Link
                href="/garage"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400"
              >
                <Headphones className="h-4 w-4" /> Garage
              </Link>
            </div>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#040812] px-5">
          <div className="max-w-md rounded-[2rem] border border-rose-300/20 bg-rose-300/[.05] p-8 text-center">
            <Gauge className="mx-auto h-9 w-9 text-rose-300" />
            <h1 className="font-display mt-5 text-3xl font-black italic text-white">
              GRID CONNECTION LOST
            </h1>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              {error || "The race server did not accept this session."}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="neon-button px-5 py-3 text-[9px]"
              >
                Retry
              </button>
              <Link
                href="/play"
                className="rounded-xl border border-white/10 px-5 py-3 text-[9px] font-black uppercase tracking-widest text-white"
              >
                Back to tiers
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
