"use client";

import Link from "next/link";
import { ChevronLeft, Menu, Minus, Plus, Volume2, VolumeX } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ClientHistoryItem, CompletedPremiumRound, FlightBetResult } from "@/lib/premium-games/client";
import type { PremiumGameDefinition } from "@/lib/premium-games/definitions";
import { visibleFlightCrashMultiplier } from "@/lib/premium-games/flightPresentation";

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

interface LobbyPilot { id: string; name: string; bet: number; target: number; cashout: number | null; win: number | null; hue: number; state: "active" | "cashed_out" | "lost"; }
const nameStarts = ["A", "M", "S", "K", "R", "N", "H", "F", "Z", "Ali", "Kha", "J", "Uma", "Dan"];

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function randomFrom(seed: number) {
  let state = seed || 1;
  return () => { state += 0x6d2b79f5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
function createLobby(roundKey: string): LobbyPilot[] {
  const random = randomFrom(hashSeed(roundKey || "aviator"));
  const amounts = [20, 50, 75, 100, 150, 250, 500, 1000];
  const count = 40 + Math.floor(random() * 111);
  return Array.from({ length: count }, (_, i) => {
    const roll = random();
    const [low, high] = roll < .42 ? [1.1, 1.5] : roll < .78 ? [1.4, 2.5] : roll < .94 ? [2.5, 6] : [5, 25];
    const target = Math.round((low + Math.pow(random(), 1.7) * (high - low)) * 100) / 100;
    const start = nameStarts[Math.floor(random() * nameStarts.length)];
    const suffix = random() < .24 ? String(10 + Math.floor(random() * 90)) : String.fromCharCode(97 + Math.floor(random() * 26));
    const name = start.length > 1 ? `${start}***` : `${start}***${suffix}`;
    return { id: `bot-${i}-${name}`, name, bet: amounts[Math.floor(random() * amounts.length)], target, cashout: null, win: null, hue: Math.floor(random() * 360), state: "active" as const };
  });
}
function money(value: number) { return value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function PlaneMark() {
  return <svg viewBox="0 0 190 88" aria-hidden="true"><defs><linearGradient id="aviator-plane" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ff174e" /><stop offset="1" stopColor="#b8002f" /></linearGradient></defs><path fill="url(#aviator-plane)" d="M13 49c25-4 61-8 108-11l30-12c9-3 22 1 29 8-7 9-18 14-32 15L88 61l-61 1L9 57c-5-2-4-7 4-8Z" /><path fill="#f20b48" d="m66 39 27-34 27-2-19 34Zm9 19 37 27 26-5-31-27Z" /><path fill="#ff2b5b" d="M45 43 28 19 12 20l10 27Zm2 15L24 76 8 75l14-17Z" /><path fill="#a90031" d="M83 29h55l5 8-71 7Zm-4 22h64l-7 9H66Z" opacity=".88" /><circle cx="154" cy="35" r="3.2" fill="#ffd2dc" /><path d="M180 18v34M173 35h14" stroke="#e60043" strokeWidth="3" strokeLinecap="round" /></svg>;
}

const FlightCanvas = memo(function FlightCanvas({ phase, multiplier, countdown, crashMultiplier }: { phase: FlightPhase; multiplier: number; countdown: number; crashMultiplier: number; }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const multiplierRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLElement>(null);
  const multiplierValue = useRef(multiplier);
  const phaseValue = useRef(phase);
  const displayValue = useRef(1);
  useEffect(() => { multiplierValue.current = multiplier; }, [multiplier]);
  useEffect(() => { phaseValue.current = phase; }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0, width = 0, height = 0, last = performance.now();
    const resize = () => { const box = canvas.getBoundingClientRect(); const ratio = Math.min(window.devicePixelRatio || 1, 3); width = Math.max(1, box.width); height = Math.max(1, box.height); canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const point = (t: number) => ({ x: width * (.035 + .80 * ((1 - Math.exp(-2.65 * t)) / (1 - Math.exp(-2.65)))), y: height * (.94 - .79 * Math.pow(t, 1.82)) });
    const draw = (now: number) => {
      const dt = Math.min(48, now - last); last = now;
      const target = phaseValue.current === "ANIMATING" ? multiplierValue.current : phaseValue.current === "RESULT" ? crashMultiplier : 1;
      displayValue.current += (target - displayValue.current) * Math.min(1, dt / 70);
      const shown = Math.max(1, displayValue.current);
      const progress = phaseValue.current === "ANIMATING" || phaseValue.current === "RESULT" || phaseValue.current === "BETTING" ? Math.min(1, Math.log(shown) / Math.log(2.85)) : 0;
      context.clearRect(0, 0, width, height); context.fillStyle = "#070707"; context.fillRect(0, 0, width, height);
      const ox = width * .035, oy = height * .96, radius = Math.hypot(width, height) * 1.3;
      for (let i = 0; i < 32; i += 1) { const a0 = -Math.PI / 2 + i * Math.PI * 2 / 32, a1 = -Math.PI / 2 + (i + 1) * Math.PI * 2 / 32; context.beginPath(); context.moveTo(ox, oy); context.lineTo(ox + Math.cos(a0) * radius, oy + Math.sin(a0) * radius); context.lineTo(ox + Math.cos(a1) * radius, oy + Math.sin(a1) * radius); context.closePath(); context.fillStyle = i % 2 ? "rgba(255,255,255,.012)" : "rgba(255,255,255,.055)"; context.fill(); }
      if (progress > 0) {
        const purple = context.createRadialGradient(width * .58, height * .5, 0, width * .58, height * .5, width * .55); purple.addColorStop(0, `rgba(45,113,155,${.18 + progress * .10})`); purple.addColorStop(.42, `rgba(29,22,78,${progress * .22})`); purple.addColorStop(1, "rgba(0,0,0,0)"); context.fillStyle = purple; context.fillRect(0, 0, width, height);
        const segments = Math.max(3, Math.ceil(progress * 90)), end = point(progress), start = point(0); const fill = context.createLinearGradient(0, height, width, 0); fill.addColorStop(0, "rgba(217,0,52,.88)"); fill.addColorStop(.65, "rgba(179,0,54,.62)"); fill.addColorStop(1, "rgba(92,0,41,.18)"); context.beginPath(); context.moveTo(start.x, start.y); for (let i = 1; i <= segments; i += 1) { const p = point(progress * i / segments); context.lineTo(p.x, p.y); } context.lineTo(end.x, oy); context.lineTo(start.x, oy); context.closePath(); context.fillStyle = fill; context.fill();
        context.beginPath(); context.moveTo(start.x, start.y); for (let i = 1; i <= segments; i += 1) { const p = point(progress * i / segments); context.lineTo(p.x, p.y); } context.lineCap = "round"; context.lineJoin = "round"; context.shadowColor = "rgba(255,0,69,.85)"; context.shadowBlur = 9; context.strokeStyle = "#ef0747"; context.lineWidth = Math.max(2, width / 260); context.stroke(); context.shadowBlur = 0;
      }
      const plane = planeRef.current;
      if (plane) { const p = point(progress), next = point(Math.min(1, progress + .006)); const angle = Math.atan2(next.y - p.y, next.x - p.x) * 180 / Math.PI; plane.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-18%,-55%) rotate(${angle}deg)`; plane.style.opacity = phaseValue.current === "RESULT" ? "0" : "1"; }
      if (multiplierRef.current) multiplierRef.current.textContent = `${shown.toFixed(2)}x`;
      if (statusRef.current && phaseValue.current === "BETTING") statusRef.current.textContent = "PLACE YOUR BETS";
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [crashMultiplier]);

  const crashed = phase === "RESULT";
  return <section ref={stageRef} className={`aviator-stage ${crashed ? "has-crashed" : ""}`} aria-label="Live flight multiplier"><canvas ref={canvasRef} className="aviator-canvas" /><div ref={planeRef} className="aviator-plane"><PlaneMark /></div><div className="aviator-stage-message" aria-live="polite">{phase === "CLOSED" ? <><small>NEXT ROUND IN</small><b>{Math.max(.1, countdown * .6).toFixed(1)}</b></> : crashed ? <><small>FLEW AWAY!</small><strong>{crashMultiplier.toFixed(2)}x</strong></> : <><small ref={statusRef} className="aviator-live-status">{phase === "BETTING" ? "PLACE YOUR BETS" : ""}</small><strong ref={multiplierRef}>1.00x</strong></>}</div><button className="aviator-home" type="button" aria-label="How to play"><span>⌂</span></button></section>;
});

function BetPanel({ bay, chips, maxStake, phase, busy, multiplier, result, pending, onChange, onLaunch, onCashout }: { bay: FlightBetBay; chips: readonly number[]; maxStake: number; phase: FlightPhase; busy: boolean; multiplier: number; result?: FlightBetResult; pending: boolean; onChange: (bay: FlightBetBay) => void; onLaunch: () => void; onCashout: () => void; }) {
  const placed = result?.state === "placed", active = result?.state === "active", settled = result?.state === "cashed_out", lost = result?.state === "lost";
  const options = chips.filter((chip) => chip <= maxStake);
  const nudge = (direction: -1 | 1) => { const current = Math.max(0, options.indexOf(bay.amount)); onChange({ ...bay, amount: options[Math.max(0, Math.min(options.length - 1, current + direction))] ?? bay.amount }); };
  const quick = [64, 160, 320, 1600].map((value) => options.find((chip) => chip >= value) ?? value);
  const canAddDuringCountdown = phase === "CLOSED" && !placed;
  const controlsLocked = phase !== "BETTING" || busy;
  const actionDisabled = pending || settled || lost || phase === "RESULT" || (phase === "ANIMATING" && !active) || (phase === "CLOSED" && placed) || (phase === "BETTING" && busy && !canAddDuringCountdown);
  const shownPayout = settled ? result.payout : active ? bay.amount * multiplier : bay.amount;
  return <section className={`aviator-bet-panel ${result ? "is-mine" : ""}`}><div className="aviator-segment"><button className={!bay.autoEnabled ? "active" : ""} onClick={() => onChange({ ...bay, autoEnabled: false })}>Bet</button><button className={bay.autoEnabled ? "active" : ""} onClick={() => onChange({ ...bay, autoEnabled: true })}>Auto</button></div><div className="aviator-bet-controls"><div className="aviator-amount"><div><button onClick={() => nudge(-1)} disabled={controlsLocked}><Minus /></button><b>{money(bay.amount)}</b><button onClick={() => nudge(1)} disabled={controlsLocked}><Plus /></button></div><div className="aviator-quick">{quick.map((value, i) => <button key={`${value}-${i}`} disabled={controlsLocked} onClick={() => onChange({ ...bay, amount: Math.min(value, maxStake) })}>{value.toLocaleString()}</button>)}</div></div><button className={`aviator-action ${active ? "cashout" : placed || settled ? "accepted" : ""} ${settled ? "cashed-success" : ""}`} disabled={actionDisabled} onClick={active ? onCashout : onLaunch}><span>{pending ? "CASHING OUT…" : settled ? `CASHED OUT ${result.cashOutMultiplier?.toFixed(2)}x` : lost ? "LOST" : active ? "Cash Out" : placed ? "BET PLACED" : phase === "RESULT" ? "Wait" : "Bet"}</span><b>{settled ? "+" : ""}{money(shownPayout)} <small>PKR</small></b></button></div></section>;
}

export function FlightXTable({ sessionId, balance, history, phase, countdown, round, active, multiplier, bays, roundKey, chips, maxStake, busy, cashoutPendingBays, betResults, muted, onToggleMuted, onHistory, onBaysChange, onLaunch, onCashout }: FlightXTableProps) {
  const [lobby, setLobby] = useState(() => createLobby(roundKey || sessionId));
  const [tab, setTab] = useState<"all" | "previous" | "top">("all");
  const liveMultiplier = useRef(multiplier);
  const crashMultiplier = visibleFlightCrashMultiplier(round?.payload ?? {}, round?.multiplier ?? multiplier ?? 1);
  useEffect(() => { liveMultiplier.current = multiplier; }, [multiplier]);
  useEffect(() => {
    const reset = window.setTimeout(() => setLobby(createLobby(roundKey || sessionId)), 0);
    return () => window.clearTimeout(reset);
  }, [roundKey, sessionId]);
  useEffect(() => {
    if (phase === "RESULT") {
      const settle = window.setTimeout(() => setLobby((rows) => rows.map((row) => row.state === "active" ? { ...row, state: "lost" } : row)), 0);
      return () => window.clearTimeout(settle);
    }
    if (!active) return;
    const timer = window.setInterval(() => setLobby((rows) => rows.map((row) => {
      const now = liveMultiplier.current;
      if (row.state !== "active" || now < row.target) return row;
      const cashout = Math.min(now, row.target);
      return { ...row, state: "cashed_out", cashout, win: Math.round(row.bet * cashout * 100) / 100 };
    })), 110);
    return () => window.clearInterval(timer);
  }, [active, phase]);
  const recent = useMemo(() => { const values = history.slice(0, 8).map((item) => Number(item.label.match(/[\d.]+/)?.[0] ?? item.multiplier)); return values.length ? values : [1.06, 4.23, 1.35, 1.12, 2.70, 1.67, 4.30, 1.00]; }, [history]);
  const updateBay = (index: number, value: FlightBetBay) => { const next: [FlightBetBay, FlightBetBay] = [{ ...bays[0] }, { ...bays[1] }]; next[index] = value; onBaysChange(next); };
  const shownLobby = tab === "top" ? [...lobby].sort((a, b) => (b.win ?? 0) - (a.win ?? 0)) : lobby;
  return <main className="flight-x-table aviator-game"><header className="aviator-header"><Link href="/games" className="aviator-back" aria-label="Back to games"><ChevronLeft /></Link><div className="aviator-logo"><PlaneMark /><b>Aviator</b></div><div className="aviator-balance"><b>{money(balance)}</b><span>PKR</span></div><button className="aviator-mute" onClick={onToggleMuted} aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? <VolumeX /> : <Volume2 />}</button><button className="aviator-menu" aria-label="Menu"><Menu /></button></header><div className="aviator-recent" aria-label="Recent multipliers"><div>{recent.map((value, i) => <button key={`${value}-${i}`} data-tier={value >= 4 ? "purple" : value >= 2 ? "pink" : "blue"} onClick={onHistory}>{value.toFixed(2)}x</button>)}</div><button className="aviator-more" onClick={onHistory}>•••</button></div><div className="aviator-layout"><FlightCanvas phase={phase} multiplier={multiplier} countdown={countdown} crashMultiplier={crashMultiplier} /><div className="aviator-side"><div className="aviator-bets">{[0, 1].map((index) => { const id = index === 0 ? "FLIGHT_1" : "FLIGHT_2"; return <BetPanel key={index} bay={bays[index]} chips={chips} maxStake={maxStake} phase={phase} busy={busy} multiplier={multiplier} result={betResults.find((bet) => bet.id === id)} pending={cashoutPendingBays[index]} onChange={(value) => updateBay(index, value)} onLaunch={() => onLaunch(index)} onCashout={() => onCashout(index)} />; })}</div><section className="aviator-live"><nav><button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All Bets</button><button className={tab === "previous" ? "active" : ""} onClick={() => setTab("previous")}>Previous</button><button className={tab === "top" ? "active" : ""} onClick={() => setTab("top")}>Top</button></nav><div className="aviator-live-summary"><div className="mini-faces"><i /><i /><i /></div><span>{lobby.length} simulated bets</span><b>{money(lobby.reduce((sum, item) => sum + (item.win ?? 0), 0))}<small>Total win PKR</small></b></div><div className="aviator-live-head"><span>Player</span><span>Bet PKR</span><span>Cash Out</span><span>Win PKR</span></div><div className="aviator-live-rows">{shownLobby.map((pilot) => <div key={pilot.id} className={pilot.state === "cashed_out" ? "won" : pilot.state === "lost" ? "lost" : ""}><span><i style={{ "--h": pilot.hue } as React.CSSProperties}>{pilot.name.at(0)}</i>{pilot.name}</span><b>{money(pilot.bet)}</b><em>{pilot.cashout ? `${pilot.cashout.toFixed(2)}x` : pilot.state === "active" ? "Playing…" : "—"}</em><strong>{pilot.win ? money(pilot.win) : pilot.state === "lost" ? "Lost" : "—"}</strong></div>)}</div></section></div></div></main>;
}
