"use client";

import Link from "next/link";
import { ArrowLeft, BarChart3, CircleHelp, Minus, RotateCcw, Settings, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ClientHistoryItem, CompletedPremiumRound } from "@/lib/premium-games/client";
import type { PremiumBetOption, PremiumGameDefinition } from "@/lib/premium-games/definitions";

function compactCredits(value: number) {
  if (value >= 1000) return `${value / 1000}K`;
  return String(value);
}

export function BalanceDisplay({ value }: { value: number }) {
  return <div className="premium-balance"><small>BALANCE</small><b>{value.toLocaleString("en-PK", { maximumFractionDigits: 2 })} <span>CR</span></b></div>;
}

export function GameHeader({ game, balance, stake, possibleReturn, muted, setMuted, openRules, openSettings, openHistory }: {
  game: PremiumGameDefinition;
  balance: number;
  stake: number;
  possibleReturn: string;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  openRules: () => void;
  openSettings: () => void;
  openHistory: () => void;
}) {
  return (
    <header className="premium-game-header">
      <Link href="/games" className="premium-icon-button" aria-label="Exit game"><ArrowLeft /></Link>
      <div className="premium-game-identity"><span style={{ color: game.accent }}>{game.icon}</span><div><small>{game.kicker}</small><h1>{game.title}</h1></div></div>
      <div className="premium-header-metrics">
        <div><small>STAKE</small><b>{stake.toLocaleString()} CR</b></div>
        <div><small>RETURN</small><b>{possibleReturn}</b></div>
      </div>
      <BalanceDisplay value={balance} />
      <nav aria-label="Game controls">
        <button className="premium-icon-button" onClick={openHistory} aria-label="Round history"><BarChart3 /></button>
        <button className="premium-icon-button" onClick={openRules} aria-label="How to play"><CircleHelp /></button>
        <button className="premium-icon-button premium-desktop-control" onClick={openSettings} aria-label="Settings"><Settings /></button>
        <button className="premium-icon-button" onClick={() => setMuted(!muted)} aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? <VolumeX /> : <Volume2 />}</button>
      </nav>
    </header>
  );
}

export function ChipSelector({ chips, selected, setSelected, disabled }: { chips: readonly number[]; selected: number; setSelected: (chip: number) => void; disabled: boolean }) {
  return <div className="premium-chip-selector" aria-label="Select chip">{chips.map((chip, index) => <button key={chip} disabled={disabled} onClick={() => setSelected(chip)} className={chip === selected ? "selected" : ""} style={{ "--chip-hue": `${(index * 47 + 342) % 360}` } as React.CSSProperties}><span>{compactCredits(chip)}</span></button>)}</div>;
}

export function BettingPanel({ disabled, hasBets, onClear, onRepeat, onDouble, removing, setRemoving, simple = false, children }: {
  disabled: boolean;
  hasBets: boolean;
  onClear: () => void;
  onRepeat: () => void;
  onDouble: () => void;
  removing: boolean;
  setRemoving: (value: boolean) => void;
  simple?: boolean;
  children: ReactNode;
}) {
  return <section className={`premium-betting-panel ${simple ? "simple" : ""}`}>{!simple && <div className="premium-bet-actions">
    <button onClick={() => setRemoving(!removing)} disabled={disabled || !hasBets} className={removing ? "active" : ""}><Minus />REMOVE</button>
    <button onClick={onClear} disabled={disabled || !hasBets}><Trash2 />CLEAR</button>
    <button onClick={onRepeat} disabled={disabled}><RotateCcw />REPEAT</button>
    <button onClick={onDouble} disabled={disabled || !hasBets}><b>2×</b>DOUBLE</button>
  </div>}{children}</section>;
}

export function BettingArea({ options, bets, winning, disabled, onSelect, compact = false }: {
  options: readonly PremiumBetOption[];
  bets: ReadonlyMap<string, number>;
  winning: readonly string[];
  disabled: boolean;
  onSelect: (option: PremiumBetOption) => void;
  compact?: boolean;
}) {
  return <div className={`premium-betting-area ${compact ? "compact" : ""}`}>{options.map((option) => {
    const amount = bets.get(option.id) ?? 0;
    return <button key={option.id} disabled={disabled} data-tone={option.tone ?? "gold"} className={`${amount ? "has-bet" : ""} ${winning.includes(option.id) ? "winner" : ""}`} onClick={() => onSelect(option)}><span>{option.label}</span><small>{option.payout}</small>{amount > 0 && <i>{compactCredits(amount)}</i>}</button>;
  })}</div>;
}

export function BettingTimer({ phase, countdown }: { phase: string; countdown: number }) {
  return <div className={`premium-round-state state-${phase.toLocaleLowerCase()}`}><i /> <span>{phase === "BETTING" ? "BETTING OPEN" : phase === "CLOSED" ? "NO MORE BETS" : phase === "ANIMATING" ? "ROUND IN MOTION" : "RESULT"}</span>{countdown > 0 && <b>{countdown}</b>}</div>;
}

export const RoundTimer = BettingTimer;

export function ResultHistory({ items, close, inline = false }: { items: ClientHistoryItem[]; close?: () => void; inline?: boolean }) {
  const content = <div className="premium-history-list">{items.length ? items.map((item) => <div key={item.roundId} data-result={item.result}><span>{item.label}</span><b>{item.multiplier > 0 ? `${item.multiplier.toFixed(2)}×` : "—"}</b></div>) : <p>No completed rounds yet.</p>}</div>;
  if (inline) return content;
  return <div className="premium-modal-backdrop" role="dialog" aria-modal="true" aria-label="Round history"><section className="premium-modal"><button className="premium-modal-close" onClick={close} aria-label="Close history"><X /></button><small>LAST 16 ROUNDS</small><h2>ROUND HISTORY</h2>{content}</section></div>;
}

export function WinAnimation({ round, skip }: { round: CompletedPremiumRound; skip: () => void }) {
  const tier = round.multiplier >= 20 ? "MEGA WIN" : round.multiplier >= 8 ? "BIG WIN" : round.multiplier >= 3 ? "GOOD WIN" : "WIN";
  return <div className="premium-result-celebration win"><div className="premium-coin-burst">{Array.from({ length: 20 }, (_, index) => <i key={index} style={{ "--coin": index } as React.CSSProperties} />)}</div><small>{round.label}</small><h2>{tier}</h2><b>+{round.payout.toLocaleString("en-PK", { maximumFractionDigits: 2 })} CR</b><button onClick={skip}>CONTINUE</button></div>;
}

export function LossAnimation({ round, skip }: { round: CompletedPremiumRound; skip: () => void }) {
  return <div className="premium-result-celebration loss"><small>ROUND COMPLETE</small><h2>{round.label}</h2><b>Next round is ready</b><button onClick={skip}>CONTINUE</button></div>;
}

export function GameRulesModal({ game, close }: { game: PremiumGameDefinition; close: () => void }) {
  return <div className="premium-modal-backdrop" role="dialog" aria-modal="true" aria-label={`How to play ${game.title}`}><section className="premium-modal premium-rules"><button className="premium-modal-close" onClick={close} aria-label="Close rules"><X /></button><small>? HOW TO PLAY</small><h2>{game.title}</h2><ol>{game.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol><div className="premium-probability-note"><b>ODDS & RETURNS</b><p>{game.probabilityNote}</p></div><p className="premium-fairness-copy">Round results, wallet debits and rewards are calculated on the server. Refreshing restores the same committed round.</p></section></div>;
}

export function SettingsPanel({ muted, setMuted, master, setMaster, sfx, setSfx, close }: {
  muted: boolean; setMuted: (value: boolean) => void; master: number; setMaster: (value: number) => void; sfx: number; setSfx: (value: number) => void; close: () => void;
}) {
  return <div className="premium-modal-backdrop" role="dialog" aria-modal="true" aria-label="Sound settings"><section className="premium-modal"><button className="premium-modal-close" onClick={close} aria-label="Close settings"><X /></button><small>GAME SETTINGS</small><h2>SOUND & COMFORT</h2><label className="premium-toggle"><span><b>Mute all sound</b><small>Audio starts only after you interact.</small></span><input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} /></label><label className="premium-slider"><span>MASTER <b>{Math.round(master * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={master} onChange={(event) => setMaster(Number(event.target.value))} /></label><label className="premium-slider"><span>SFX <b>{Math.round(sfx * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={sfx} onChange={(event) => setSfx(Number(event.target.value))} /></label></section></div>;
}

export function LoadingScreen({ game, progress }: { game: PremiumGameDefinition; progress: number }) {
  const line = game.loadingLines[Math.min(game.loadingLines.length - 1, Math.floor(progress / (100 / game.loadingLines.length)))];
  return <div className="premium-loading" style={{ backgroundImage: `linear-gradient(180deg,rgba(2,5,9,.26),rgba(2,5,9,.92)),url(${game.thumbnail})` }}><div className="premium-loading-logo" style={{ color: game.accent }}>{game.icon}</div><small>{game.kicker}</small><h1>{game.title}</h1><div className="premium-loading-track"><i style={{ width: `${progress}%`, background: `linear-gradient(90deg,${game.accent2},${game.accent})` }} /></div><b>LOADING {Math.round(progress)}%</b><p>{line}</p></div>;
}

export function ReconnectHandler({ onReconnect }: { onReconnect: () => void }) {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const connected = () => { setOnline(true); onReconnect(); };
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, [onReconnect]);
  return online ? null : <div className="premium-connection-lost"><i /><b>CONNECTION LOST</b><span>Reconnecting to the same round…</span></div>;
}

export function ResponsiveGameLayout({ children }: { children: ReactNode }) {
  return <div className="premium-responsive-layout">{children}<div className="premium-rotate-device"><span>↻</span><b>ROTATE YOUR DEVICE</b><small>This table plays best in landscape.</small></div></div>;
}

