"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientHistoryItem, CompletedPremiumRound } from "@/lib/premium-games/client";
import type { PremiumBetOption, PremiumGameDefinition } from "@/lib/premium-games/definitions";
import { createRedBlackTablePlayers, mergeRedBlackRecentResults, redBlackResultFromHistoryItem, redBlackResultFromRound, shouldRevealRedBlackCard, type RedBlackCard, type RedBlackLivePhase, type RedBlackRecentResult, type RedBlackTablePlayer } from "@/lib/premium-games/redBlackLive";

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

interface TableWager {
  side: "RED" | "BLACK";
  amount: number;
}

const referenceChips = [20, 100, 200, 1000, 2000, 5000] as const;
const botSeats = [
  { x: 16, y: 28 }, { x: 16, y: 51 }, { x: 16, y: 73 },
  { x: 87, y: 29 }, { x: 87, y: 52 }, { x: 87, y: 74 },
] as const;
const startingPlayers = createRedBlackTablePlayers(() => .5);
const rosterStorageKey = "red-black-table-roster";

function compactCredits(value: number) {
  return value.toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

function LivePlayingCard({ card, reveal, side, dealIndex }: { card?: RedBlackCard; reveal: boolean; side: "BLACK" | "RED"; dealIndex: number }) {
  return <div className={`premium-playing-card rb-live-card ${reveal ? "revealed" : ""}`} data-side={side} style={{
    "--deal-index": dealIndex,
    "--deal-delay": `${dealIndex * .09}s`,
    "--return-delay": `${(5 - dealIndex) * .035}s`,
  } as React.CSSProperties}>
    <div className="premium-card-inner">
      <div className="premium-card-back" aria-label="Face-down card" />
      <div className="premium-card-front" aria-hidden={!reveal} data-color={card?.color ?? side}>
        <b>{card?.label ?? "A"}</b><span>{card?.suit ?? (side === "RED" ? "♥" : "♠")}</span><small>{card?.label ?? "A"}</small>
      </div>
    </div>
  </div>;
}

function ExactDuelCards({ round, phase, revealStep }: { round: CompletedPremiumRound | null; phase: RedBlackLivePhase; revealStep: number }) {
  const black = Array.isArray(round?.payload.black) ? round.payload.black as RedBlackCard[] : [];
  const red = Array.isArray(round?.payload.red) ? round.payload.red as RedBlackCard[] : [];
  return <div className="rb-live-card-row" aria-label="Black and Red hands">
    <div className="black-hand">{[0, 1, 2].map((index) => <LivePlayingCard key={`black:${index}`} card={black[index]} side="BLACK" dealIndex={index} reveal={shouldRevealRedBlackCard("BLACK", index, phase, revealStep)} />)}</div>
    <div className="rb-live-card-vs" aria-hidden="true" />
    <div className="red-hand">{[0, 1, 2].map((index) => <LivePlayingCard key={`red:${index}`} card={red[index]} side="RED" dealIndex={index + 3} reveal={shouldRevealRedBlackCard("RED", index, phase, revealStep)} />)}</div>
  </div>;
}

function ExactBetButton({ option, amount, total, disabled, winning, onSelect }: {
  option: PremiumBetOption;
  amount: number;
  total: number;
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
    aria-pressed={amount > 0}
  >
    <span className="rb-pot-total">● {compactCredits(total)}</span>
    <strong className="rb-kingdom-label">{option.id}</strong>
    <small className="rb-personal-stake">YOU · {compactCredits(amount)} CR</small>
    <span className="rb-table-chip-pile" aria-hidden="true">{Array.from({ length: Math.min(35, Math.ceil(total / 150)) }, (_, index) => <i key={index} style={{ left: `${8 + (index * 23 % 77)}%`, top: `${28 + (index * 17 % 45)}%`, "--chip-color": ["#823254", "#692bab", "#b47c13", "#20805c"][index % 4] } as React.CSSProperties}><b>{[20, 100, 200, "1K"][index % 4]}</b></i>)}</span>
    {amount > 0 && <span className="rb-exact-user-chip"><b>{compactCredits(amount)}</b></span>}
  </button>;
}

export function RedBlackTable({
  game, balance, username, stake, history, phase, countdown, revealStep, round, bets, selectedChip,
  disabled, muted, connectionLabel, onToggleMuted, onRules, onSelect, onChooseChip, onRepeat,
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
  connectionLabel?: string | null;
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
  const [tableWagers, setTableWagers] = useState<Array<TableWager | null>>(() => Array.from({ length: 6 }, () => null));
  const [tablePlayers, setTablePlayers] = useState<RedBlackTablePlayer[]>(startingPlayers);
  const [recentResults, setRecentResults] = useState<RedBlackRecentResult[]>(() => history.map((item) => ({
    roundId: item.roundId,
    result: redBlackResultFromHistoryItem(item),
    completedAt: item.createdAt,
  })).slice(0, 18));
  const flightId = useRef(1);
  const countdownRef = useRef(countdown);
  const previousBets = useRef<Map<string, number>>(new Map());
  const wagersRef = useRef(tableWagers);
  const playersRef = useRef(tablePlayers);
  const settledRound = useRef<string | null>(null);
  const cleanupTimers = useRef<Set<number>>(new Set());
  useEffect(() => { playersRef.current = tablePlayers; }, [tablePlayers]);
  useEffect(() => () => { cleanupTimers.current.forEach(window.clearTimeout); }, []);
  const retireChip = (id: number) => {
    const timer = window.setTimeout(() => {
      cleanupTimers.current.delete(timer);
      setFlightChips((current) => current.filter((item) => item.id !== id));
    }, 760);
    cleanupTimers.current.add(timer);
  };

  useEffect(() => { countdownRef.current = countdown; }, [countdown]);

  useEffect(() => {
    // Refresh the virtual table roster once per page entry, not every round.
    const timer = window.setTimeout(() => {
      let previousNames: string[] = [];
      try {
        const stored = window.sessionStorage.getItem(rosterStorageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) previousNames = parsed.filter((name): name is string => typeof name === "string");
        }
      } catch {
        // A blocked or malformed session store should never prevent the table loading.
      }
      const players = createRedBlackTablePlayers(Math.random, previousNames);
      setTablePlayers(players);
      try {
        window.sessionStorage.setItem(rosterStorageKey, JSON.stringify(players.map((player) => player.name)));
      } catch {
        // The generated in-memory roster is still valid when storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const serverResults = history.map((item) => ({
      roundId: item.roundId,
      result: redBlackResultFromHistoryItem(item),
      completedAt: item.createdAt,
    }));
    const timer = window.setTimeout(() => setRecentResults((current) => mergeRedBlackRecentResults(current, serverResults)), 0);
    return () => window.clearTimeout(timer);
  }, [history]);

  useEffect(() => {
    if (phase !== "RESULT" || !round) return;
    const timer = window.setTimeout(() => setRecentResults((current) => mergeRedBlackRecentResults(current, [{
        roundId: round.roundId,
        result: redBlackResultFromRound(round),
        completedAt: round.completedAt,
      }])), 0);
    return () => window.clearTimeout(timer);
  }, [phase, round]);

  useEffect(() => {
    if (phase !== "BETTING") return;
    let live = true;
    let timer = 0;
    const resetTimer = window.setTimeout(() => {
      wagersRef.current = Array.from({ length: 6 }, () => null);
      setTableWagers(wagersRef.current);
    }, 0);
    const placeBotBet = () => {
      if (!live) return;
      if (countdownRef.current <= 1) { timer = window.setTimeout(placeBotBet, 250); return; }
      const seatIndex = Math.floor(Math.random() * botSeats.length);
      const seat = botSeats[seatIndex];
      const previous = wagersRef.current[seatIndex];
      const side = previous?.side ?? (Math.random() > .5 ? "RED" as const : "BLACK" as const);
      const chipIndex = Math.floor(Math.random() * referenceChips.length);
      const value = Math.min(referenceChips[chipIndex], Math.max(0, Math.min(5000, playersRef.current[seatIndex].balance) - (previous?.amount ?? 0)));
      if (value <= 0) { timer = window.setTimeout(placeBotBet, 500); return; }
      const targetX = side === "BLACK" ? 34 + Math.random() * 15 : 54 + Math.random() * 17;
      const targetY = 35 + Math.random() * 12;
      const chip: FlightChip = {
        id: flightId.current++, value, chipIndex, side,
        fromX: seat.x, fromY: seat.y,
        deltaX: targetX - seat.x, deltaY: targetY - seat.y,
        rotation: 520 + Math.floor(Math.random() * 650),
      };
      wagersRef.current = wagersRef.current.map((wager, index) => index !== seatIndex ? wager : { side, amount: (previous?.amount ?? 0) + value });
      setTableWagers(wagersRef.current);
      setFlightChips((current) => [...current.slice(-11), chip]);
      retireChip(chip.id);
      timer = window.setTimeout(placeBotBet, 300 + Math.random() * 520);
    };
    timer = window.setTimeout(placeBotBet, 250);
    return () => { live = false; window.clearTimeout(resetTimer); window.clearTimeout(timer); };
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
      retireChip(chip.id);
    }
    previousBets.current = new Map(bets);
  }, [bets, phase, selectedChip]);

  useEffect(() => {
    if (phase !== "PAYOUT" || !round || settledRound.current === round.roundId) return;
    settledRound.current = round.roundId;
    const timer = window.setTimeout(() => setTablePlayers((players) => players.map((player, index) => {
      const wager = wagersRef.current[index];
      if (!wager) return player;
      const payout = round.payload.winner === "TIE" ? wager.amount : round.payload.winner === wager.side ? Math.round(wager.amount * 195) / 100 : 0;
      return { ...player, balance: Math.round((player.balance - wager.amount + payout) * 100) / 100 };
    })), 0);
    return () => window.clearTimeout(timer);
  }, [phase, round]);

  const options = useMemo(() => new Map(game.options.map((option) => [option.id, option])), [game.options]);
  const outcomeVisible = phase === "RESULT" || phase === "PAYOUT" || phase === "ROUND_END";
  const winningOptions = new Set(outcomeVisible ? round?.winningOptions ?? [] : []);
  const betOptions = ["BLACK", "RED"].map((id) => options.get(id)).filter((option): option is PremiumBetOption => !!option);
  const winner = String(round?.payload.winner ?? "TIE");
  const activeSide = bets.has("BLACK") ? "BLACK" : bets.has("RED") ? "RED" : null;
  const revealingSide = phase === "REVEALING" ? (revealStep <= 3 ? "BLACK" : "RED") : null;
  const visibleTableWagers = phase === "NEXT_ROUND" || phase === "COUNTDOWN" ? Array.from({ length: 6 }, () => null) : tableWagers;
  const resultHistory = recentResults.map((item) => item.result);
  const settlement = !round || round.totalStake <= 0
    ? null
    : round.result === "WIN"
      ? `PAYOUT ${round.payout.toLocaleString("en-PK", { maximumFractionDigits: 2 })} CR · PROFIT ${round.net.toLocaleString("en-PK", { maximumFractionDigits: 2 })} CR`
      : round.result === "PUSH"
        ? `DRAW · ${round.totalStake.toLocaleString("en-PK", { maximumFractionDigits: 2 })} CR RETURNED`
        : `LOST ${round.totalStake.toLocaleString("en-PK", { maximumFractionDigits: 2 })} CR`;
  const timerValue = phase === "BETTING" ? Math.max(0, countdown) : phase === "COUNTDOWN" ? countdown : phase === "REVEALING" ? revealStep : 0;

  return <main className={`rb-game rb-live-table rb-exact-table phase-${phase.toLocaleLowerCase()}`} data-winner={winner}>
    <div className="rb-exact-reference" aria-hidden="true" />
    <div className="rb-live-felt" aria-hidden="true" />
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

    <div className="rb-exact-history" aria-label="Recent Red vs Black results">
      {Array.from({ length: 18 }, (_, index) => <i key={index} data-result={resultHistory[index]}>{resultHistory[index] === "TIE" ? "T" : ""}</i>)}
    </div>

    <div className="rb-exact-table-players" aria-label="Virtual table players and wagers">
      {tablePlayers.map((player, index) => {
        const wager = visibleTableWagers[index];
        const column = player.avatar % 4;
        const row = Math.floor(player.avatar / 4);
        return <div key={index} data-seat={index} data-side={wager?.side}>
          <span style={{ backgroundPosition: `${column * 33.333}% ${row * 100}%` }} />
          <section><b>{player.name}</b><small>● {compactCredits(Math.max(0, player.balance - (wager && phase !== "PAYOUT" && phase !== "ROUND_END" ? wager.amount : 0)))}</small><em>{wager ? `${wager.side} · ${compactCredits(wager.amount)}` : "NO BET"}</em></section>
        </div>;
      })}
    </div>

    <section className="rb-exact-bet-layer" aria-label="Red vs Black betting table">
      {betOptions.map((option) => <ExactBetButton key={option.id} option={option} amount={bets.get(option.id) ?? 0} total={(bets.get(option.id) ?? 0) + visibleTableWagers.reduce((sum, wager) => sum + (wager?.side === option.id ? wager.amount : 0), 0)} disabled={disabled} winning={winningOptions.has(option.id)} onSelect={onSelect} />)}
    </section>

    <div className="rb-table-rules">Choose BLACK or RED · Winner returns 1.95× · Draw returns your stake</div>

    <div className="rb-exact-active-selection" data-side={revealingSide ?? activeSide ?? undefined} aria-live="polite">
      <small>{revealingSide ? "REVEALING" : phase === "BETTING" ? "YOUR SELECTION" : "YOUR BET"}</small>
      <strong>{revealingSide ?? activeSide ?? (phase === "BETTING" ? "CHOOSE A SIDE" : "NO BET")}</strong>
      {activeSide && <span>{compactCredits(stake)} CR{phase !== "BETTING" ? " · LOCKED" : ""}</span>}
    </div>

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
      {settlement && <em data-result={round.result}>{settlement}</em>}
    </div>}

    {phase === "PAYOUT" && round?.result === "WIN" && round.totalStake > 0 && <div className="rb-live-payout" data-winner={winner} data-user-win="true" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--pay-index": index, "--pay-x": `${((index * 47) % 76) - 38}vw`, "--pay-y": `${-18 - (index % 5) * 7}vh` } as React.CSSProperties} />)}
    </div>}

    {connectionLabel && <div className="rb-live-connecting" role="status">{connectionLabel}</div>}
  </main>;
}
