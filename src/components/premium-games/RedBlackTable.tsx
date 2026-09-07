"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientHistoryItem, CompletedPremiumRound } from "@/lib/premium-games/client";
import type { PremiumBetOption, PremiumGameDefinition } from "@/lib/premium-games/definitions";
import type { RedBlackCard, RedBlackLivePhase } from "@/lib/premium-games/redBlackLive";

interface FlightChip {
  id: number;
  value: number;
  chipIndex: number;
  side: "RED" | "BLACK";
  fromX: number;
  fromY: number;
  deltaX: number;
  deltaY: number;
  rotation: number;
  user?: boolean;
}

const referenceChips = [20, 100, 200, 1000, 2000, 5000] as const;
const botSeats = [
  { x: 16, y: 28 }, { x: 16, y: 51 }, { x: 16, y: 73 },
  { x: 87, y: 29 }, { x: 87, y: 52 }, { x: 87, y: 74 },
] as const;

function compactCredits(value: number) {
  if (value >= 1000) return `${value / 1000}K`;
  return String(value);
}

function LivePlayingCard({ card, reveal, side }: { card?: RedBlackCard; reveal: boolean; side: "BLACK" | "RED" }) {
  return <div className={`premium-playing-card rb-live-card ${reveal ? "revealed" : ""}`} data-side={side}>
    <div className="premium-card-inner">
      <div className="premium-card-back" />
      <div className="premium-card-front" data-color={card?.color ?? side}>
        <b>{card?.label ?? "A"}</b><span>{card?.suit ?? (side === "RED" ? "♥" : "♠")}</span><small>{card?.label ?? "A"}</small>
      </div>
    </div>
  </div>;
}

function ExactDuelCards({ round, phase, revealStep }: { round: CompletedPremiumRound | null; phase: RedBlackLivePhase; revealStep: number }) {
  const black = Array.isArray(round?.payload.black) ? round.payload.black as RedBlackCard[] : [];
  const red = Array.isArray(round?.payload.red) ? round.payload.red as RedBlackCard[] : [];
  const forceReveal = phase === "RESULT" || phase === "PAYOUT" || phase === "ROUND_END";
  return <div className="rb-live-card-row" aria-label="Black and Red hands">
    <div className="black-hand">{[0, 1, 2].map((index) => <LivePlayingCard key={`black:${index}`} card={black[index]} side="BLACK" reveal={forceReveal || revealStep >= index * 2 + 1} />)}</div>
    <div className="rb-live-card-vs" aria-hidden="true" />
    <div className="red-hand">{[0, 1, 2].map((index) => <LivePlayingCard key={`red:${index}`} card={red[index]} side="RED" reveal={forceReveal || revealStep >= index * 2 + 2} />)}</div>
  </div>;
}

function ExactBetButton({ option, amount, disabled, winning, onSelect }: {
  option: PremiumBetOption;
  amount: number;
  disabled: boolean;
  winning: boolean;
  onSelect: (option: PremiumBetOption) => void;
}) {
  return <button
    type="button"
    className="rb-exact-bet-button"
    data-option={option.id}
    data-selected={amount > 0 || undefined}
    data-winning={winning || undefined}
    disabled={disabled}
    onClick={() => onSelect(option)}
    aria-label={`${option.label}, ${option.payout}. Your bet: ${amount} credits`}
  >
    {amount > 0 && <span className="rb-exact-user-chip"><b>{compactCredits(amount)}</b></span>}
  </button>;
}

export function RedBlackTable({
  game, balance, username, phase, countdown, revealStep, round, bets, selectedChip,
  disabled, muted, onToggleMuted, onRules, onSelect, onChooseChip, onRepeat,
}: {
  game: PremiumGameDefinition;
  artwork: string;
  balance: number;
  username: string;
  stake: number;
  possibleReturn: string;
  history: ClientHistoryItem[];
  phase: RedBlackLivePhase;
  countdown: number;
  revealStep: number;
  round: CompletedPremiumRound | null;
  bets: ReadonlyMap<string, number>;
  selectedChip: number;
  chips: readonly number[];
  disabled: boolean;
  busy: boolean;
  minStake: number;
  muted: boolean;
  onToggleMuted: () => void;
  onRules: () => void;
  onHistory: () => void;
  onSelect: (option: PremiumBetOption) => void;
  onChooseChip: (chip: number) => void;
  onClear: () => void;
  onRepeat: () => void;
  onDouble: () => void;
}) {
  const [flightChips, setFlightChips] = useState<FlightChip[]>([]);
  const flightId = useRef(1);
  const countdownRef = useRef(countdown);
  const previousBets = useRef<Map<string, number>>(new Map());

  useEffect(() => { countdownRef.current = countdown; }, [countdown]);

  useEffect(() => {
    if (phase !== "BETTING") return;
    let live = true;
    let timer = 0;
    const placeBotBet = () => {
      if (!live || countdownRef.current <= 1) return;
      const seat = botSeats[Math.floor(Math.random() * botSeats.length)];
      const side = Math.random() > .5 ? "RED" as const : "BLACK" as const;
      const chipIndex = Math.floor(Math.random() * referenceChips.length);
      const value = referenceChips[chipIndex];
      const targetX = side === "BLACK" ? 34 + Math.random() * 15 : 54 + Math.random() * 17;
      const targetY = 35 + Math.random() * 26;
      const chip: FlightChip = {
        id: flightId.current++, value, chipIndex, side,
        fromX: seat.x, fromY: seat.y,
        deltaX: targetX - seat.x, deltaY: targetY - seat.y,
        rotation: 520 + Math.floor(Math.random() * 650),
      };
      setFlightChips((current) => [...current.slice(-11), chip]);
      window.setTimeout(() => setFlightChips((current) => current.filter((item) => item.id !== chip.id)), 760);
      timer = window.setTimeout(placeBotBet, 300 + Math.random() * 520);
    };
    timer = window.setTimeout(placeBotBet, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [phase]);

  useEffect(() => {
    if (phase !== "BETTING") {
      previousBets.current = new Map(bets);
      return;
    }
    for (const [optionId, amount] of bets) {
      const increase = amount - (previousBets.current.get(optionId) ?? 0);
      if (increase <= 0) continue;
      const side = optionId === "RED" ? "RED" as const : "BLACK" as const;
      const chipIndex = Math.max(0, referenceChips.indexOf(selectedChip as typeof referenceChips[number]));
      const startX = [34.5, 41, 47.5, 54, 61, 68][chipIndex] ?? 34.5;
      const targetX = side === "BLACK" ? 41 : 62;
      const targetY = optionId === "RED" || optionId === "BLACK" ? 44 : 61;
      const chip: FlightChip = {
        id: flightId.current++, value: increase, chipIndex, side,
        fromX: startX, fromY: 93, deltaX: targetX - startX, deltaY: targetY - 93,
        rotation: 720, user: true,
      };
      setFlightChips((current) => [...current.slice(-11), chip]);
      window.setTimeout(() => setFlightChips((current) => current.filter((item) => item.id !== chip.id)), 760);
    }
    previousBets.current = new Map(bets);
  }, [bets, phase, selectedChip]);

  const options = useMemo(() => new Map(game.options.map((option) => [option.id, option])), [game.options]);
  const outcomeVisible = phase === "RESULT" || phase === "PAYOUT" || phase === "ROUND_END";
  const winningOptions = new Set(outcomeVisible ? round?.winningOptions ?? [] : []);
  const betOptions = ["BLACK", "RED", "PAIR", "HIGH_CARD", "STRAIGHT", "FLUSH"].map((id) => options.get(id)).filter((option): option is PremiumBetOption => !!option);
  const winner = String(round?.payload.winner ?? "TIE");
  const timerValue = phase === "BETTING" ? Math.max(0, countdown) : phase === "COUNTDOWN" ? countdown : phase === "REVEALING" ? revealStep : 0;

  return <main className={`rb-game rb-live-table rb-exact-table phase-${phase.toLocaleLowerCase()}`} data-winner={winner}>
    <div className="rb-exact-reference" aria-hidden="true" />
    <div className="rb-social-cover" aria-hidden="true" />

    <section className="rb-exact-user-profile" aria-label={`${username || "Player"}, balance ${balance.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`}>
      <span className="rb-exact-user-avatar" aria-hidden="true" />
      <span className="rb-exact-user-copy">
        <b>{username || "PLAYER"}</b>
        <small><i aria-hidden="true">●</i>{balance.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>
      </span>
    </section>

    <div className="rb-live-flight-layer" aria-hidden="true">{flightChips.map((chip) => <i
      key={chip.id}
      data-chip={chip.chipIndex}
      data-side={chip.side}
      data-user={chip.user || undefined}
      style={{
        "--from-x": `${chip.fromX}%`, "--from-y": `${chip.fromY}%`,
        "--fly-x": `${chip.deltaX}vw`, "--fly-y": `${chip.deltaY}vh`, "--fly-r": `${chip.rotation}deg`,
      } as React.CSSProperties}
    ><b>{compactCredits(chip.value)}</b></i>)}</div>

    <nav className="rb-exact-controls" aria-label="Game controls">
      <Link href="/games" className="rb-exact-hotspot back" aria-label="Back to games" title="Back to games" />
      <Link href="/wallet" className="rb-exact-hotspot shop" aria-label="Open wallet shop" title="Wallet and shop" />
      <button type="button" className="rb-exact-hotspot help" onClick={onRules} aria-label="How to play" title="How to play" />
      <button type="button" className="rb-exact-hotspot sound" data-muted={muted || undefined} onClick={onToggleMuted} aria-label={muted ? "Turn sound on" : "Mute sound"} title={muted ? "Turn sound on" : "Mute sound"}><i /></button>
    </nav>

    <section className="rb-exact-duel-display">
      <ExactDuelCards round={round} phase={phase} revealStep={revealStep} />
    </section>

    <section className="rb-exact-bet-layer" aria-label="Red vs Black betting table">
      {betOptions.map((option) => <ExactBetButton key={option.id} option={option} amount={bets.get(option.id) ?? 0} disabled={disabled} winning={winningOptions.has(option.id)} onSelect={onSelect} />)}
    </section>

    <div className="rb-exact-timer" data-phase={phase} role="timer" aria-label={`Round timer ${timerValue}`}><b>{timerValue}</b></div>

    <div className="rb-exact-chip-controls" aria-label={`Select chip. Balance ${balance.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`}>
      {referenceChips.map((chip, index) => <button
        key={chip}
        type="button"
        style={{ left: `${[33.5, 40.5, 47.55, 54.6, 61.8, 68.85][index]}%` }}
        data-selected={selectedChip === chip || undefined}
        aria-pressed={selectedChip === chip}
        disabled={disabled}
        onClick={() => onChooseChip(chip)}
        aria-label={`Select ${chip} credit chip`}
      />)}
    </div>

    <button type="button" className="rb-exact-repeat" onClick={onRepeat} disabled={disabled} aria-label="Repeat previous bet" title="Repeat previous bet" />

    {(phase === "NEXT_ROUND" || phase === "COUNTDOWN" || phase === "BETTING" || phase === "BETTING_CLOSING") && <div className="rb-live-announcement" data-phase={phase} aria-live="polite">
      {phase === "NEXT_ROUND" && <strong>Ready for next game</strong>}
      {phase === "COUNTDOWN" && <><strong>Ready for next game</strong><span>{countdown}</span></>}
      {phase === "BETTING" && <strong>Starting</strong>}
      {phase === "BETTING_CLOSING" && <strong>Stop</strong>}
    </div>}

    {phase === "RESULT" && round && <div className="rb-exact-result" data-winner={winner} aria-live="assertive">
      <strong>{winner === "RED" ? "Red Wins!" : winner === "BLACK" ? "Black Wins!" : "Tie!"}</strong>
      <span>{String(round.payload.blackHand ?? "High")} <b>VS</b> {String(round.payload.redHand ?? "High")}</span>
    </div>}

    {phase === "PAYOUT" && <div className="rb-live-payout" data-winner={winner} aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--pay-index": index, "--pay-x": `${((index * 47) % 76) - 38}vw`, "--pay-y": `${-18 - (index % 5) * 7}vh` } as React.CSSProperties} />)}
    </div>}
  </main>;
}
