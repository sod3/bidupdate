"use client";

import Link from "next/link";
import { ChevronLeft, Menu, Minus, Plus, Volume2, VolumeX } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ClientHistoryItem, CompletedPremiumRound, FlightBetResult } from "@/lib/premium-games/client";
import type { PremiumGameDefinition } from "@/lib/premium-games/definitions";
import { visibleFlightCrashMultiplier } from "@/lib/premium-games/flightPresentation";
import { SoundManager } from "@/lib/premium-games/soundManager";

type FlightPhase = "BETTING" | "CLOSED" | "ANIMATING" | "RESULT";

export interface FlightBetBay { amount: number; autoCashout: number; autoEnabled: boolean; }

interface FlightXTableProps {
  game: PremiumGameDefinition; sessionId: string; balance: number; history: ClientHistoryItem[];
  phase: FlightPhase; countdown: number; round: CompletedPremiumRound | null; active: boolean;
  multiplier: number; bays: readonly [FlightBetBay, FlightBetBay]; activeBay: number | null; roundKey: string;
  chips: readonly number[]; maxStake: number; busy: boolean; cashoutPendingBays: readonly [boolean, boolean]; betResults: FlightBetResult[]; muted: boolean;
  onToggleMuted: () => void; onRules: () => void; onHistory: () => void;
  onBaysChange: (bays: [FlightBetBay, FlightBetBay]) => void; onLaunch: (bay: number) => void; onCashout: (bay: number) => void;
}

interface LobbyPilot {
  id: string; name: string; bet: number; target: number; cashout: number | null; win: number | null; hue: number; state: "active" | "cashed_out" | "lost";
}

interface CashoutToast {
  id: string; name: string; multiplier: number; win: number;
}

const nameStarts = ["Alex", "Sarah", "Vikram", "Ayaan", "Mira", "Kha", "Dan", "Uma", "Rafi", "Zain", "Nyla", "Kestrel", "Soli", "Rune", "Vega"];

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function randomFrom(seed: number) {
  let state = seed || 1;
  return () => { state += 0x6d2b79f5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

function createLobby(seedKey: string): LobbyPilot[] {
  const random = randomFrom(hashSeed(seedKey || `round-${Date.now()}`));
  const amounts = [50, 100, 150, 250, 500, 1000, 2500, 5000];
  const count = 45 + Math.floor(random() * 45);
  return Array.from({ length: count }, (_, i) => {
    const roll = random();
    const [low, high] = roll < 0.45 ? [1.12, 1.45] : roll < 0.78 ? [1.46, 2.60] : roll < 0.93 ? [2.65, 6.50] : [6.80, 28.00];
    const target = Math.round((low + Math.pow(random(), 1.6) * (high - low)) * 100) / 100;
    const start = nameStarts[Math.floor(random() * nameStarts.length)];
    const suffix = random() < 0.3 ? String(10 + Math.floor(random() * 90)) : String.fromCharCode(97 + Math.floor(random() * 26));
    const name = start.length > 2 ? `${start}_${suffix}` : `${start}***${suffix}`;
    return { id: `bot-${i}-${name}-${Math.floor(random() * 9999)}`, name, bet: amounts[Math.floor(random() * amounts.length)], target, cashout: null, win: null, hue: Math.floor(random() * 360), state: "active" as const };
  });
}

function money(value: number) { return value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function PlaneMark() {
  return <svg viewBox="0 0 190 88" aria-hidden="true"><defs><linearGradient id="aviator-plane" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ff174e" /><stop offset="1" stopColor="#b8002f" /></linearGradient></defs><path fill="url(#aviator-plane)" d="M13 49c25-4 61-8 108-11l30-12c9-3 22 1 29 8-7 9-18 14-32 15L88 61l-61 1L9 57c-5-2-4-7 4-8Z" /><path fill="#f20b48" d="m66 39 27-34 27-2-19 34Zm9 19 37 27 26-5-31-27Z" /><path fill="#ff2b5b" d="M45 43 28 19 12 20l10 27Zm2 15L24 76 8 75l14-17Z" /><path fill="#a90031" d="M83 29h55l5 8-71 7Zm-4 22h64l-7 9H66Z" opacity=".88" /><circle cx="154" cy="35" r="3.2" fill="#ffd2dc" /><path d="M180 18v34M173 35h14" stroke="#e60043" strokeWidth="3" strokeLinecap="round" /></svg>;
}

const FlightCanvas = memo(function FlightCanvas({ phase, multiplier, countdown, crashMultiplier }: { phase: "COUNTDOWN" | "FLYING" | "CRASHED" | FlightPhase; multiplier: number; countdown: number; crashMultiplier: number; }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const multiplierRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLElement>(null);
  const multiplierValue = useRef(multiplier);
  const phaseValue = useRef(phase);
  const displayValue = useRef(1);
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; size: number; alpha: number; hue: number }>>([]);

  useEffect(() => { multiplierValue.current = multiplier; }, [multiplier]);
  useEffect(() => { phaseValue.current = phase; }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0, width = 0, height = 0, last = performance.now();
    const resize = () => { const box = canvas.getBoundingClientRect(); const ratio = Math.min(window.devicePixelRatio || 1, 2); width = Math.max(1, box.width); height = Math.max(1, box.height); canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();

    const point = (t: number) => ({ x: width * (.035 + .82 * ((1 - Math.exp(-2.65 * t)) / (1 - Math.exp(-2.65)))), y: height * (.94 - .80 * Math.pow(t, 1.78)) });

    const draw = (now: number) => {
      const dt = Math.min(48, Math.max(16, now - last || 16)); last = now;
      const currentPhase = phaseValue.current;

      let isFlying = currentPhase === "ANIMATING" || currentPhase === "FLYING";
      let isCrashed = currentPhase === "RESULT" || currentPhase === "CRASHED";
      let target = 1;

      const rawMult = Number(multiplierValue.current);
      const safeMult = Number.isFinite(rawMult) && rawMult >= 1 ? rawMult : 1;
      const rawCrash = Number(crashMultiplier);
      const safeCrash = Number.isFinite(rawCrash) && rawCrash >= 1 ? rawCrash : 1;

      if (isFlying) {
        target = safeMult;
      } else if (isCrashed) {
        target = safeCrash;
      } else {
        target = 1;
      }

      if (!Number.isFinite(target)) target = 1;
      if (!Number.isFinite(displayValue.current)) displayValue.current = 1;

      if (isCrashed) {
        displayValue.current = safeCrash;
      } else if (isFlying) {
        displayValue.current += (target - displayValue.current) * Math.min(1, dt / 45);
      } else {
        displayValue.current = 1;
      }
      if (!Number.isFinite(displayValue.current)) displayValue.current = 1;

      const shown = Math.max(1, displayValue.current);
      const progress = Math.min(1, Math.max(0, Math.log(shown) / Math.log(3.2)));
      const activeProgress = (isFlying || isCrashed) ? progress : 0;

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#06090e";
      context.fillRect(0, 0, width, height);

      // Radar Rays
      const ox = width * .035, oy = height * .96, radius = Math.hypot(width, height) * 1.35;
      for (let i = 0; i < 32; i += 1) {
        const a0 = -Math.PI / 2 + i * Math.PI * 2 / 32, a1 = -Math.PI / 2 + (i + 1) * Math.PI * 2 / 32;
        context.beginPath(); context.moveTo(ox, oy);
        context.lineTo(ox + Math.cos(a0) * radius, oy + Math.sin(a0) * radius);
        context.lineTo(ox + Math.cos(a1) * radius, oy + Math.sin(a1) * radius);
        context.closePath();
        context.fillStyle = i % 2 ? "rgba(255,255,255,.015)" : "rgba(255,255,255,.045)";
        context.fill();
      }

      if (activeProgress > 0 || isFlying || isCrashed) {
        const purple = context.createRadialGradient(width * .58, height * .5, 0, width * .58, height * .5, width * .55);
        purple.addColorStop(0, `rgba(239,7,71,${.16 + activeProgress * .14})`);
        purple.addColorStop(.45, `rgba(35,15,55,${activeProgress * .22})`);
        purple.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = purple;
        context.fillRect(0, 0, width, height);

        const segments = Math.max(8, Math.ceil(activeProgress * 100)), end = point(activeProgress), start = point(0);
        const fill = context.createLinearGradient(0, height, width, 0);
        fill.addColorStop(0, "rgba(239,7,71,.88)");
        fill.addColorStop(.65, "rgba(179,0,54,.60)");
        fill.addColorStop(1, "rgba(92,0,41,.15)");
        context.beginPath();
        context.moveTo(start.x, start.y);
        for (let i = 1; i <= segments; i += 1) { const p = point(activeProgress * i / segments); context.lineTo(p.x, p.y); }
        context.lineTo(end.x, oy); context.lineTo(start.x, oy); context.closePath(); context.fillStyle = fill; context.fill();

        context.beginPath(); context.moveTo(start.x, start.y);
        for (let i = 1; i <= segments; i += 1) { const p = point(activeProgress * i / segments); context.lineTo(p.x, p.y); }
        context.lineCap = "round"; context.lineJoin = "round"; context.shadowColor = "rgba(255,0,69,.9)"; context.shadowBlur = 12;
        context.strokeStyle = "#ff174e"; context.lineWidth = Math.max(3, width / 220); context.stroke(); context.shadowBlur = 0;

        if (isFlying && Math.random() < 0.75) {
          particlesRef.current.push({
            x: end.x - 12 + (Math.random() - 0.5) * 6,
            y: end.y + 6 + (Math.random() - 0.5) * 6,
            vx: -2.5 - Math.random() * 2.5,
            vy: (Math.random() - 0.5) * 2,
            size: 2.5 + Math.random() * 4.5,
            alpha: 0.95,
            hue: 350 + Math.random() * 15
          });
        }
      }

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.alpha -= 0.038; p.size *= 0.95;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        context.fillStyle = `hsla(${p.hue}, 95%, 60%, ${p.alpha})`;
        context.beginPath(); context.arc(p.x, p.y, p.size, 0, Math.PI * 2); context.fill();
      }

      if (isCrashed) {
        const center = point(Math.min(1, Math.log(Math.max(1, safeCrash)) / Math.log(3.2)));
        context.save();
        context.fillStyle = "rgba(239, 7, 71, 0.22)";
        context.beginPath(); context.arc(center.x, center.y, 50 + Math.sin(now * 0.012) * 12, 0, Math.PI * 2); context.fill();
        context.restore();
      }

      const plane = planeRef.current;
      if (plane) {
        const p = point(activeProgress), next = point(Math.min(1, activeProgress + .006));
        const angle = Math.atan2(next.y - p.y, next.x - p.x) * 180 / Math.PI;
        plane.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-18%,-55%) rotate(${angle}deg)`;
        plane.style.opacity = isCrashed ? "0.15" : "1";
      }

      if (multiplierRef.current) multiplierRef.current.textContent = `${shown.toFixed(2)}x`;

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [crashMultiplier]);

  const isCrashed = phase === "RESULT" || phase === "CRASHED";
  const isCountdown = phase === "CLOSED" || phase === "COUNTDOWN";
  const isFlying = phase === "ANIMATING" || phase === "FLYING";

  return <section ref={stageRef} className={`aviator-stage ${isCrashed ? "has-crashed" : ""}`} aria-label="Live flight multiplier">
    <canvas ref={canvasRef} className="aviator-canvas" />
    <div ref={planeRef} className="aviator-plane"><PlaneMark /></div>
    <div className="aviator-stage-message" aria-live="polite">
      {isCountdown ? (
        <><small>NEXT ROUND IN</small><b>{Math.max(0.1, countdown).toFixed(1)}s</b></>
      ) : isCrashed ? (
        <><small>FLEW AWAY!</small><strong>{crashMultiplier.toFixed(2)}x</strong></>
      ) : isFlying ? (
        <><small className="aviator-live-status">WAIT FOR ELEVATION</small><strong ref={multiplierRef}>{multiplier.toFixed(2)}x</strong></>
      ) : (
        <><small ref={statusRef} className="aviator-live-status">PLACE YOUR BETS</small><strong ref={multiplierRef}>1.00x</strong></>
      )}
    </div>
    <button className="aviator-home" type="button" aria-label="How to play"><span>⌂</span></button>
  </section>;
});

function BetPanel({ bay, chips, maxStake, phase, busy, multiplier, result, pending, onChange, onLaunch, onCashout }: { bay: FlightBetBay; chips: readonly number[]; maxStake: number; phase: "COUNTDOWN" | "FLYING" | "CRASHED" | FlightPhase; busy: boolean; multiplier: number; result?: FlightBetResult; pending: boolean; onChange: (bay: FlightBetBay) => void; onLaunch: () => void; onCashout: () => void; }) {
  const placed = result?.state === "placed", active = result?.state === "active", settled = result?.state === "cashed_out", lost = result?.state === "lost";
  const options = chips.filter((chip) => chip <= maxStake);
  const nudge = (direction: -1 | 1) => { const current = Math.max(0, options.indexOf(bay.amount)); onChange({ ...bay, amount: options[Math.max(0, Math.min(options.length - 1, current + direction))] ?? bay.amount }); };
  const quick = [100, 250, 500, 1000].map((value) => options.find((chip) => chip >= value) ?? value);
  const canAddDuringCountdown = (phase === "CLOSED" || phase === "COUNTDOWN" || phase === "BETTING") && !placed;
  const controlsLocked = (phase !== "BETTING" && phase !== "CLOSED" && phase !== "COUNTDOWN") || (busy && !canAddDuringCountdown);
  const actionDisabled = pending || settled || lost || phase === "RESULT" || phase === "CRASHED" || (phase === "ANIMATING" && !active && !placed) || ((phase === "CLOSED" || phase === "COUNTDOWN") && placed);
  const shownPayout = settled ? result.payout : active ? bay.amount * multiplier : bay.amount;

  return <section className={`aviator-bet-panel ${result ? "is-mine" : ""}`}>
    <div className="aviator-segment">
      <button className={!bay.autoEnabled ? "active" : ""} onClick={() => onChange({ ...bay, autoEnabled: false })}>Bet</button>
      <button className={bay.autoEnabled ? "active" : ""} onClick={() => onChange({ ...bay, autoEnabled: true })}>Auto</button>
    </div>
    <div className="aviator-bet-controls">
      <div className="aviator-amount">
        <div>
          <button onClick={() => nudge(-1)} disabled={controlsLocked}><Minus /></button>
          <b>{money(bay.amount)}</b>
          <button onClick={() => nudge(1)} disabled={controlsLocked}><Plus /></button>
        </div>
        <div className="aviator-quick">
          {quick.map((value, i) => <button key={`${value}-${i}`} disabled={controlsLocked} onClick={() => onChange({ ...bay, amount: Math.min(value, maxStake) })}>{value.toLocaleString()}</button>)}
        </div>
      </div>
      <button className={`aviator-action ${active ? "cashout" : placed || settled ? "accepted" : ""} ${settled ? "cashed-success" : ""}`} disabled={actionDisabled} onClick={active ? onCashout : onLaunch}>
        <span>{pending ? "CASHING OUT…" : settled ? `CASHED OUT ${result.cashOutMultiplier?.toFixed(2)}x` : lost ? "LOST" : active ? "Cash Out" : placed ? "BET PLACED" : phase === "RESULT" || phase === "CRASHED" ? "Wait" : "Bet"}</span>
        <b>{settled ? "+" : ""}{money(shownPayout)} <small>PKR</small></b>
      </button>
    </div>
  </section>;
}

export function FlightXTable({ sessionId, balance, history, phase, countdown, round, active, multiplier, bays, roundKey, chips, maxStake, busy, cashoutPendingBays, betResults, muted, onToggleMuted, onHistory, onBaysChange, onLaunch, onCashout }: FlightXTableProps) {
  // Continuous Demo Round State Engine (when user has no active server round)
  const [demoPhase, setDemoPhase] = useState<"COUNTDOWN" | "FLYING" | "CRASHED">("FLYING");
  const [demoMultiplier, setDemoMultiplier] = useState(1.0);
  const [demoCountdown, setDemoCountdown] = useState(4.0);
  const [demoCrashTarget, setDemoCrashTarget] = useState(2.45);
  const [demoLobby, setDemoLobby] = useState<LobbyPilot[]>(() => createLobby("demo-start"));
  const [demoUserBets, setDemoUserBets] = useState<[FlightBetResult | null, FlightBetResult | null]>([null, null]);
  const [toasts, setToasts] = useState<CashoutToast[]>([]);

  const [tab, setTab] = useState<"all" | "previous" | "top">("all");
  const liveMultiplier = useRef(multiplier);
  const crashMultiplier = visibleFlightCrashMultiplier(round?.payload ?? {}, round?.multiplier ?? multiplier ?? 1);

  useEffect(() => { liveMultiplier.current = multiplier; }, [multiplier]);

  // Continuous Background Demo Flight Loop
  useEffect(() => {
    if (active || phase === "ANIMATING" || phase === "RESULT") return;

    let timer: number;
    let lastTime = performance.now();
    let currentMult = 1.0;

    const startNewDemoRound = () => {
      const rand = Math.random();
      const crash = rand < 0.40 ? Math.round((1.15 + Math.random() * 0.7) * 100) / 100
        : rand < 0.75 ? Math.round((1.85 + Math.random() * 1.5) * 100) / 100
        : rand < 0.92 ? Math.round((3.35 + Math.random() * 4.5) * 100) / 100
        : Math.round((8.0 + Math.random() * 15.0) * 100) / 100;

      setDemoCrashTarget(crash);
      setDemoMultiplier(1.0);
      currentMult = 1.0;
      setDemoLobby(createLobby(`demo-${Date.now()}`));
      setDemoUserBets([null, null]);
      setDemoCountdown(4.0);
      setDemoPhase("COUNTDOWN");
    };

    let countdownTime = 4.0;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(60, (now - lastTime)) / 1000;
      lastTime = now;

      setDemoPhase((prevPhase) => {
        if (prevPhase === "COUNTDOWN") {
          countdownTime -= dt;
          setDemoCountdown(Math.max(0, countdownTime));
          if (countdownTime <= 0) {
            currentMult = 1.0;
            setDemoMultiplier(1.0);
            // Transition placed demo bets to active
            setDemoUserBets((bets) => bets.map((b) => b && b.state === "placed" ? { ...b, state: "active" as const } : b) as [FlightBetResult | null, FlightBetResult | null]);
            return "FLYING";
          }
          return "COUNTDOWN";
        }

        if (prevPhase === "FLYING") {
          // Exponential flight speed: climbs smoothly
          const growthRate = 0.12 + Math.pow(currentMult, 0.6) * 0.18;
          currentMult += growthRate * dt;
          setDemoMultiplier(currentMult);

          if (currentMult >= demoCrashTarget) {
            // Demo Crash trigger!
            setDemoLobby((rows) => rows.map((row) => row.state === "active" ? { ...row, state: "lost" } : row));
            setDemoUserBets((bets) => bets.map((b) => b && b.state === "active" ? { ...b, state: "lost" as const } : b) as [FlightBetResult | null, FlightBetResult | null]);
            window.setTimeout(() => startNewDemoRound(), 2200);
            return "CRASHED";
          }

          // Check simulated lobby player cash-outs during flight
          setDemoLobby((rows) => {
            let changed = false;
            const updated = rows.map((row) => {
              if (row.state !== "active" || currentMult < row.target) return row;
              changed = true;
              const cashout = Math.min(currentMult, row.target);
              const win = Math.round(row.bet * cashout * 100) / 100;
              const toastId = `toast-${row.id}-${Date.now()}`;
              setToasts((prev) => [...prev.slice(-2), { id: toastId, name: row.name, multiplier: cashout, win }]);
              window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 2400);
              return { ...row, state: "cashed_out" as const, cashout, win };
            });
            return changed ? updated : rows;
          });

          return "FLYING";
        }

        return prevPhase;
      });

      timer = window.requestAnimationFrame(tick);
    };

    timer = window.requestAnimationFrame(tick);
    return () => cancelAnimationFrame(timer);
  }, [active, phase, demoCrashTarget]);

  // Synchronize simulated players when REAL server round is active
  useEffect(() => {
    if (!active && phase !== "ANIMATING") return;

    if (phase === "RESULT") {
      setDemoLobby((rows) => rows.map((row) => row.state === "active" ? { ...row, state: "lost" } : row));
      return;
    }

    const timer = window.setInterval(() => {
      const now = Math.max(1, liveMultiplier.current || 1);
      setDemoLobby((rows) => {
        let changed = false;
        const updated = rows.map((row) => {
          if (row.state !== "active" || now < row.target) return row;
          changed = true;
          const cashout = Math.min(now, row.target);
          const win = Math.round(row.bet * cashout * 100) / 100;
          const toastId = `toast-${row.id}-${Date.now()}`;
          setToasts((prev) => [...prev.slice(-2), { id: toastId, name: row.name, multiplier: cashout, win }]);
          window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 2400);
          return { ...row, state: "cashed_out" as const, cashout, win };
        });
        return changed ? updated : rows;
      });
    }, 100);

    return () => window.clearInterval(timer);
  }, [active, phase]);

  const recent = useMemo(() => {
    const values = history.slice(0, 8).map((item) => Number(item.label.match(/[\d.]+/)?.[0] ?? item.multiplier));
    return values.length ? values : [1.06, 4.23, 1.35, 1.12, 2.70, 1.67, 4.30, 1.00];
  }, [history]);

  const updateBay = (index: number, value: FlightBetBay) => {
    const next: [FlightBetBay, FlightBetBay] = [{ ...bays[0] }, { ...bays[1] }];
    next[index] = value;
    onBaysChange(next);
  };

  const handleDemoLaunch = (index: number) => {
    const id = index === 0 ? "FLIGHT_1" : "FLIGHT_2";
    const amount = bays[index].amount;
    const state = demoPhase === "FLYING" ? "active" : "placed";
    setDemoUserBets((prev) => {
      const next = [...prev] as [FlightBetResult | null, FlightBetResult | null];
      next[index] = { id, amount, state, cashOutMultiplier: null, payout: 0 };
      return next;
    });
  };

  const handleDemoCashout = (index: number) => {
    const current = demoUserBets[index];
    if (!current || current.state !== "active") return;
    const lockedMultiplier = demoMultiplier;
    const payout = Math.round(current.amount * lockedMultiplier * 100) / 100;
    SoundManager.play("cashout");
    setDemoUserBets((prev) => {
      const next = [...prev] as [FlightBetResult | null, FlightBetResult | null];
      next[index] = { ...current, state: "cashed_out", cashOutMultiplier: lockedMultiplier, payout };
      return next;
    });
    const toastId = `toast-you-${Date.now()}`;
    setToasts((prev) => [...prev.slice(-2), { id: toastId, name: "YOU", multiplier: lockedMultiplier, win: payout }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 2500);
  };

  const shownLobby = tab === "top" ? [...demoLobby].sort((a, b) => (b.win ?? 0) - (a.win ?? 0)) : demoLobby;

  const currentEffectivePhase = active ? phase : (phase === "RESULT" ? "RESULT" : demoPhase);
  const currentEffectiveMultiplier = active ? multiplier : (phase === "RESULT" ? crashMultiplier : demoMultiplier);
  const currentEffectiveCrashMultiplier = active ? crashMultiplier : demoCrashTarget;
  const currentEffectiveCountdown = active ? countdown : demoCountdown;

  return <main className="flight-x-table aviator-game">
    <header className="aviator-header">
      <Link href="/games" className="aviator-back" aria-label="Back to games"><ChevronLeft /></Link>
      <div className="aviator-logo"><PlaneMark /><b>Aviator</b></div>
      <div className="aviator-balance"><b>{money(balance)}</b><span>PKR</span></div>
      <button className="aviator-mute" onClick={onToggleMuted} aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? <VolumeX /> : <Volume2 />}</button>
      <button className="aviator-menu" aria-label="Menu"><Menu /></button>
    </header>

    <div className="aviator-recent" aria-label="Recent multipliers">
      <div>{recent.map((value, i) => <button key={`${value}-${i}`} data-tier={value >= 4 ? "purple" : value >= 2 ? "pink" : "blue"} onClick={onHistory}>{value.toFixed(2)}x</button>)}</div>
      <button className="aviator-more" onClick={onHistory}>•••</button>
    </div>

    <div className="aviator-layout">
      <div className="relative flex-1 min-h-0 flex flex-col">
        <FlightCanvas
          phase={currentEffectivePhase}
          multiplier={currentEffectiveMultiplier}
          countdown={currentEffectiveCountdown}
          crashMultiplier={currentEffectiveCrashMultiplier}
        />
        
        {/* Animated Stacked Cashout Toasts */}
        {toasts.length > 0 && (
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-2 pointer-events-none">
            {toasts.map((toast) => (
              <div key={toast.id} className="aviator-cashout-toast">
                <span>{toast.name}</span>
                <b>{toast.multiplier.toFixed(2)}x</b>
                <small>+{money(toast.win)} PKR</small>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="aviator-side">
        <div className="aviator-bets">
          {[0, 1].map((index) => {
            const id = index === 0 ? "FLIGHT_1" : "FLIGHT_2";
            const betResult = active || phase === "ANIMATING"
              ? betResults.find((bet) => bet.id === id)
              : (demoUserBets[index] ?? undefined);

            return <BetPanel
              key={index}
              bay={bays[index]}
              chips={chips}
              maxStake={maxStake}
              phase={currentEffectivePhase}
              busy={busy}
              multiplier={currentEffectiveMultiplier}
              result={betResult}
              pending={cashoutPendingBays[index]}
              onChange={(value) => updateBay(index, value)}
              onLaunch={() => {
                if (active || phase === "ANIMATING") onLaunch(index);
                else { handleDemoLaunch(index); onLaunch(index); }
              }}
              onCashout={() => {
                if (active || phase === "ANIMATING") onCashout(index);
                else handleDemoCashout(index);
              }}
            />;
          })}
        </div>

        <section className="aviator-live">
          <nav>
            <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All Bets</button>
            <button className={tab === "previous" ? "active" : ""} onClick={() => setTab("previous")}>Previous</button>
            <button className={tab === "top" ? "active" : ""} onClick={() => setTab("top")}>Top</button>
          </nav>
          <div className="aviator-live-summary">
            <div className="mini-faces"><i /><i /><i /></div>
            <span>{demoLobby.length} active bets</span>
            <b>{money(demoLobby.reduce((sum, item) => sum + (item.win ?? 0), 0))}<small>Total win PKR</small></b>
          </div>
          <div className="aviator-live-head">
            <span>Player</span>
            <span>Bet PKR</span>
            <span>Cash Out</span>
            <span>Win PKR</span>
          </div>
          <div className="aviator-live-rows">
            {shownLobby.map((pilot) => (
              <div key={pilot.id} className={pilot.state === "cashed_out" ? "won" : pilot.state === "lost" ? "lost" : ""}>
                <span><i style={{ "--h": pilot.hue } as React.CSSProperties}>{pilot.name.at(0)}</i>{pilot.name}</span>
                <b>{money(pilot.bet)}</b>
                <em>{pilot.cashout ? `${pilot.cashout.toFixed(2)}x` : pilot.state === "active" ? "Playing…" : "—"}</em>
                <strong>{pilot.win ? money(pilot.win) : pilot.state === "lost" ? "Lost" : "—"}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  </main>;
}
