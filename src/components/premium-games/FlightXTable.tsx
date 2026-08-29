"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, BarChart3, CircleHelp, Coins, Minus, Plus, ShieldCheck, Volume2, VolumeX, Wifi, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientHistoryItem, CompletedPremiumRound } from "@/lib/premium-games/client";
import type { PremiumGameDefinition } from "@/lib/premium-games/definitions";
import { FICTIONAL_OPPONENT_NAMES } from "@/lib/opponentNames";

type FlightPhase = "BETTING" | "CLOSED" | "ANIMATING" | "RESULT";

export interface FlightBetBay {
  amount: number;
  autoCashout: number;
  autoEnabled: boolean;
}

interface LobbyPilot {
  id: string;
  name: string;
  bet: number;
  cashout: number | null;
  win: number | null;
  hue: number;
}

interface FlightXTableProps {
  game: PremiumGameDefinition;
  sessionId: string;
  balance: number;
  history: ClientHistoryItem[];
  phase: FlightPhase;
  countdown: number;
  round: CompletedPremiumRound | null;
  active: boolean;
  multiplier: number;
  bays: readonly [FlightBetBay, FlightBetBay];
  activeBay: number | null;
  chips: readonly number[];
  maxStake: number;
  busy: boolean;
  cashoutPending: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onRules: () => void;
  onHistory: () => void;
  onBaysChange: (bays: [FlightBetBay, FlightBetBay]) => void;
  onLaunch: (bay: number) => void;
  onCashout: () => void;
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function compactName(name: string, index: number) {
  if (index < 3) return name;
  const [first, last = ""] = name.split(" ");
  return `${first}${last ? ` ${last[0]}.` : ""}`;
}

function createLobby(sessionId: string): LobbyPilot[] {
  const random = seededRandom(hashSeed(sessionId || "flight-x-lobby"));
  const names = [...FICTIONAL_OPPONENT_NAMES];
  for (let index = names.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [names[index], names[target]] = [names[target], names[index]];
  }
  const bets = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  return names.slice(0, 8).map((name, index) => ({
    id: `${hashSeed(`${sessionId}:${name}`)}`,
    name: compactName(name, index),
    bet: bets[Math.floor(random() * bets.length)],
    cashout: null,
    win: null,
    hue: Math.floor(random() * 360),
  }));
}

function multiplierFromHistory(item: ClientHistoryItem) {
  const labelMultiplier = Number(item.label.match(/([0-9]+(?:\.[0-9]+)?)\s*[×x]/i)?.[1] ?? 0);
  return Math.max(item.multiplier, labelMultiplier);
}

function roundNumber(value: string) {
  const number = hashSeed(value || "flight-x-round").toString().padStart(10, "0");
  return `#${number.slice(0, 8)}`;
}

function formatCredits(value: number) {
  return value.toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

function FlightBetControl({ index, bay, chips, maxStake, phase, active, activeBay, multiplier, busy, onChange, onLaunch, onCashout }: {
  index: number;
  bay: FlightBetBay;
  chips: readonly number[];
  maxStake: number;
  phase: FlightPhase;
  active: boolean;
  activeBay: number | null;
  multiplier: number;
  busy: boolean;
  onChange: (next: FlightBetBay) => void;
  onLaunch: () => void;
  onCashout: () => void;
}) {
  const cycleAmount = (direction: -1 | 1) => {
    const options = chips.filter((chip) => chip <= maxStake);
    const current = Math.max(0, options.findIndex((chip) => chip === bay.amount));
    const next = Math.min(options.length - 1, Math.max(0, current + direction));
    onChange({ ...bay, amount: options[next] ?? bay.amount });
  };
  const isActiveBay = active && activeBay === index;
  const actionLabel = isActiveBay ? "CASH OUT" : active ? "PRE-BET" : phase === "CLOSED" ? "LOCKED" : phase === "RESULT" ? "WAIT" : "BET";

  return <section className={`flight-bet-bay ${isActiveBay ? "active" : ""}`} aria-label={`${index === 0 ? "First" : "Second"} bet`}>
    <div className="flight-bet-title"><b>{index === 0 ? "FIRST BET" : "SECOND BET"}</b>{isActiveBay && <span><i /> IN FLIGHT</span>}</div>
    <div className="flight-bet-body">
      <div className="flight-bet-settings">
        <div className="flight-amount-stepper">
          <button onClick={() => cycleAmount(-1)} disabled={busy || phase === "CLOSED" || isActiveBay || bay.amount <= (chips[0] ?? 20)} aria-label="Decrease bet"><Minus /></button>
          <div><small>BET AMOUNT</small><b>{formatCredits(bay.amount)}</b><span>CR</span></div>
          <button onClick={() => cycleAmount(1)} disabled={busy || phase === "CLOSED" || isActiveBay || bay.amount >= maxStake} aria-label="Increase bet"><Plus /></button>
        </div>
        <div className="flight-auto-row">
          <button className={bay.autoEnabled ? "enabled" : ""} onClick={() => onChange({ ...bay, autoEnabled: !bay.autoEnabled })} disabled={busy || isActiveBay}><Zap /> AUTO</button>
          <label><small>AUTO CASH OUT</small><span><input aria-label="Auto cash out multiplier" type="number" min="1.01" max="100" step="0.1" value={bay.autoCashout} disabled={busy || isActiveBay} onChange={(event) => onChange({ ...bay, autoCashout: Math.min(100, Math.max(1.01, Number(event.target.value) || 1.01)) })} />×</span></label>
        </div>
      </div>
      <button className={`flight-bet-action ${isActiveBay ? "cashout" : ""}`} disabled={busy || phase === "CLOSED" || phase === "RESULT" || (active && !isActiveBay)} onClick={isActiveBay ? onCashout : onLaunch}>
        <small>{isActiveBay ? `${formatCredits(bay.amount * multiplier)} CR` : bay.autoEnabled ? `AUTO ${bay.autoCashout.toFixed(2)}×` : ""}</small>
        <b>{busy && isActiveBay ? "CASHING…" : actionLabel}</b>
      </button>
    </div>
  </section>;
}

export function FlightXTable({ game, sessionId, balance, history, phase, countdown, round, active, multiplier, bays, activeBay, chips, maxStake, busy, cashoutPending, muted, onToggleMuted, onRules, onHistory, onBaysChange, onLaunch, onCashout }: FlightXTableProps) {
  const [lobby, setLobby] = useState(() => createLobby(sessionId));
  const lobbyTick = useRef(0);
  const liveMultiplier = useRef(multiplier);
  const shownMultiplier = active ? multiplier : round ? Number(round.payload.cashedOutMultiplier ?? round.payload.crashMultiplier ?? round.multiplier ?? 1) : 1;
  const progress = Math.min(1, Math.log(Math.max(1, shownMultiplier)) / Math.log(100));
  const rocketLeft = 5 + progress * 58;
  const rocketBottom = 2 + progress * 45 + Math.sin(progress * Math.PI) * 5;
  const crashed = phase === "RESULT" && round?.result === "LOSS";
  const cashedOut = phase === "RESULT" && round?.result === "WIN";
  const historyValues = useMemo(() => history.slice(0, 7).map(multiplierFromHistory), [history]);
  const visibleHistory = historyValues.length ? historyValues : [1.18, 1.92, 2.96, 1.27, 4.68, 1.39, 1.95];
  const currentRoundId = round?.roundId ?? history[0]?.roundId ?? sessionId;
  const lobbyTotal = lobby.reduce((sum, pilot) => sum + pilot.bet, bays[activeBay ?? 0]?.amount ?? 0);

  useEffect(() => {
    liveMultiplier.current = multiplier;
  }, [multiplier]);

  useEffect(() => {
    if (!active || cashoutPending) return;
    const interval = window.setInterval(() => {
      lobbyTick.current += 1;
      const random = seededRandom(hashSeed(`${sessionId}:${lobbyTick.current}`));
      setLobby((rows) => rows.map((pilot, index) => {
        if (pilot.cashout || random() < .58 - index * .035) return pilot;
        const currentMultiplier = liveMultiplier.current;
        const cashout = Math.max(1.01, Math.min(currentMultiplier, Math.round((1.01 + random() * Math.max(.05, currentMultiplier - 1.01)) * 100) / 100));
        return { ...pilot, cashout, win: Math.round(pilot.bet * cashout * 100) / 100 };
      }));
    }, 920);
    return () => window.clearInterval(interval);
  }, [active, cashoutPending, sessionId]);

  const updateBay = (index: number, next: FlightBetBay) => {
    const updated: [FlightBetBay, FlightBetBay] = [{ ...bays[0] }, { ...bays[1] }];
    updated[index] = next;
    onBaysChange(updated);
  };

  return <main className={`flight-x-table phase-${phase.toLocaleLowerCase()} ${crashed ? "is-crashed" : ""} ${cashoutPending ? "cashout-pending" : ""}`} style={{ "--flight-accent": game.accent } as React.CSSProperties}>
    <header className="flight-x-topbar">
      <Link href="/games" className="flight-x-back" aria-label="Exit Crash"><ArrowLeft /></Link>
      <div className="flight-x-history" aria-label="Previous multipliers">
        {visibleHistory.map((value, index) => <button key={`${value}:${index}`} onClick={onHistory} data-tier={value >= 10 ? "hot" : value >= 2 ? "blue" : "green"}>{value.toFixed(value >= 10 ? 1 : 2)}</button>)}
        <button className="flight-x-chart" onClick={onHistory} aria-label="Open round history"><BarChart3 /></button>
      </div>
      <div className="flight-x-brand"><b>CRASH</b></div>
      <div className="flight-x-wallet"><Coins /><b>{formatCredits(balance)}</b><span>CR</span></div>
      <button className="flight-x-help" onClick={onRules} aria-label="How to play"><CircleHelp /></button>
      <button className="flight-x-sound" onClick={onToggleMuted} aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? <VolumeX /> : <Volume2 />}</button>
    </header>

    <div className="flight-x-board">
      <section className="flight-x-scene" aria-label={`Crash multiplier ${shownMultiplier.toFixed(2)} times`}>
        <Image className="flight-x-scene-art" src="/images/flight-x/alien-launch-site.png" alt="" fill priority sizes="(max-width: 760px) 100vw, 64vw" />
        <div className="flight-x-neon-frame" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="flight-x-signal"><Wifi /></div>
        <div className="flight-x-scanlines" />
        <div className="flight-x-stage-copy" aria-live="polite" aria-atomic="true">
          {phase === "CLOSED" ? <><small>CRASH</small><h2>Preparing Round</h2><p>Starting in <b>{Math.max(.1, countdown * .6).toFixed(1)}s</b></p></> :
            cashoutPending ? <><small>CASH OUT LOCKED</small><strong>{shownMultiplier.toFixed(2)}<span>×</span></strong><p className="win-copy">CONFIRMING {formatCredits((bays[activeBay ?? 0]?.amount ?? 0) * shownMultiplier)} CR</p></> :
            active ? <><small>ROUND IN FLIGHT</small><strong>{shownMultiplier.toFixed(2)}<span>×</span></strong><p>Cash out before the flight ends</p></> :
              crashed ? <><small>FLIGHT ENDED</small><strong>{shownMultiplier.toFixed(2)}<span>×</span></strong><p className="crash-copy">CRASHED</p></> :
                cashedOut ? <><small>CASH OUT CONFIRMED</small><strong>{shownMultiplier.toFixed(2)}<span>×</span></strong><p className="win-copy">SAFE RETURN</p></> :
                  <><small>BEYOND THE HORIZON</small><h2>Crash Ready</h2><p>Choose a bet bay to launch</p></>}
        </div>

        {(active || phase === "RESULT") && <svg className="flight-x-flightpath" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true"><path d="M65 555 C 250 520, 460 400, 720 125" style={{ strokeDashoffset: 790 * (1 - progress) }} /></svg>}
        {active && [0.2, 0.37, 0.55].filter((marker) => marker < progress + .05).map((marker, index) => <div key={marker} className="flight-x-pilot-marker" style={{ left: `${5 + marker * 58}%`, bottom: `${2 + marker * 45 + Math.sin(marker * Math.PI) * 5}%` }}><span style={{ "--pilot-hue": `${lobby[index].hue}` } as React.CSSProperties}>{lobby[index].name.slice(0, 1)}</span><b>{(1 + marker * 2.4).toFixed(2)}×</b></div>)}
        {!crashed && <Image className={`flight-x-rocket ${active && !cashoutPending ? "flying" : ""}`} src="/images/flight-x/rocket.png" alt="" width={1536} height={1024} style={{ left: `${rocketLeft}%`, bottom: `${rocketBottom}%` }} />}
        {crashed && <div className="flight-x-explosion" style={{ left: `${rocketLeft + 7}%`, bottom: `${rocketBottom + 3}%` }} aria-hidden="true"><i /><i /><i /><span /></div>}
        <div className="flight-x-fairness"><ShieldCheck /><span>SERVER-COMMITTED FLIGHT</span></div>
      </section>

      <aside className="flight-x-console">
        <section className="flight-x-round-meta">
          <div><small>NUMBER</small><b>{roundNumber(currentRoundId)}</b></div>
          <div><small>TOTAL AMOUNT</small><b>{formatCredits(lobbyTotal)}</b></div>
        </section>
        <section className="flight-x-lobby" aria-label="Simulated lobby activity">
          <div className="flight-x-lobby-tabs"><b>LOBBY BETS</b><span>SIMULATED LOBBY</span></div>
          <div className="flight-x-lobby-head"><span>USER</span><span>BET</span><span>CASH OUT</span><span>WIN</span></div>
          <div className="flight-x-lobby-rows">
            {lobby.slice(0, 7).map((pilot) => <div key={pilot.id} className={pilot.cashout ? "cashed" : ""}><span><i style={{ "--pilot-hue": `${pilot.hue}` } as React.CSSProperties}>{pilot.name.slice(0, 1)}</i>{pilot.name}</span><b>{formatCredits(pilot.bet)}</b><em>{pilot.cashout ? `${pilot.cashout.toFixed(2)}×` : "—"}</em><strong>{pilot.win ? formatCredits(pilot.win) : "—"}</strong></div>)}
          </div>
        </section>
        <FlightBetControl index={0} bay={bays[0]} chips={chips} maxStake={maxStake} phase={phase} active={active} activeBay={activeBay} multiplier={multiplier} busy={busy} onChange={(next) => updateBay(0, next)} onLaunch={() => onLaunch(0)} onCashout={onCashout} />
        <FlightBetControl index={1} bay={bays[1]} chips={chips} maxStake={maxStake} phase={phase} active={active} activeBay={activeBay} multiplier={multiplier} busy={busy} onChange={(next) => updateBay(1, next)} onLaunch={() => onLaunch(1)} onCashout={onCashout} />
      </aside>
    </div>
  </main>;
}
