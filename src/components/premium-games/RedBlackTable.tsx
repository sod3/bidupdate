"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Coins, RotateCcw, ShoppingCart, Sparkles, Trash2, UsersRound, Volume2, VolumeX, Wifi } from "lucide-react";
import { ChipSelector } from "@/components/premium-games/GameChrome";
import { GameStage } from "@/components/premium-games/GameStage";
import type { ClientHistoryItem, CompletedPremiumRound } from "@/lib/premium-games/client";
import type { PremiumBetOption, PremiumGameDefinition } from "@/lib/premium-games/definitions";

type RoundPhase = "BETTING" | "CLOSED" | "ANIMATING" | "RESULT";

interface TablePlayerSeed {
  name: string;
  avatar: number;
  balance: number;
}

interface TablePlayer extends TablePlayerSeed {
  side: "RED" | "BLACK" | "PAIR";
  chip: number;
  pulse: number;
}

const playerPool: readonly TablePlayerSeed[] = [
  { name: "Ayesha K.", avatar: 0, balance: 18420 },
  { name: "Victor R.", avatar: 1, balance: 9270 },
  { name: "Rohan M.", avatar: 2, balance: 12650 },
  { name: "Amara J.", avatar: 3, balance: 21880 },
  { name: "Zayn A.", avatar: 4, balance: 7530 },
  { name: "Mei L.", avatar: 5, balance: 14340 },
  { name: "Nadia S.", avatar: 6, balance: 16890 },
  { name: "Mika V.", avatar: 7, balance: 11060 },
] as const;

const startingPlayers: TablePlayer[] = playerPool.map((player, index) => ({
  ...player,
  side: index % 2 ? "BLACK" : "RED",
  chip: [50, 100, 200, 500][index % 4],
  pulse: 0,
}));

function randomizedPlayers() {
  const shuffled = [...playerPool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled.map<TablePlayer>((player, index) => ({
    ...player,
    balance: player.balance + Math.floor(Math.random() * 1800),
    side: Math.random() > .48 ? "RED" : "BLACK",
    chip: [50, 100, 200, 500, 1000][Math.floor(Math.random() * 5)],
    pulse: index,
  }));
}

function compactCredits(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return value.toLocaleString("en-PK");
}

function historyMark(item: ClientHistoryItem) {
  if (item.label.includes("RED")) return { letter: "R", tone: "red", label: item.label };
  if (item.label.includes("BLACK")) return { letter: "B", tone: "black", label: item.label };
  return { letter: "T", tone: "tie", label: item.label };
}

function PlayerSeat({ player, side }: { player: TablePlayer; side: "left" | "right" }) {
  const column = player.avatar % 4;
  const row = Math.floor(player.avatar / 4);
  return <div className={`rb-player-seat seat-${side}`} data-bet={player.side}>
    <div className="rb-player-avatar" style={{ backgroundPosition: `${column * 33.333}% ${row * 100}%` }} />
    <div className="rb-player-copy"><b>{player.name}</b><span><Coins />{compactCredits(player.balance)}</span></div>
    <i key={player.pulse} className="rb-seat-chip">{compactCredits(player.chip)}</i>
    <small>{player.side}</small>
    <span key={`toss-${player.pulse}`} className="rb-seat-toss" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => <i key={index} style={{ "--toss": index } as React.CSSProperties}>{index === 0 ? compactCredits(player.chip) : ""}</i>)}
    </span>
  </div>;
}

function ChipCloud({ seed, count }: { seed: number; count: number }) {
  const values = [20, 50, 100, 200, 500, 1000, 2000];
  return <span className="rb-chip-cloud" aria-hidden="true">{Array.from({ length: count }, (_, index) => <i
    key={index}
    data-chip={(index + seed) % 7}
    style={{
      "--cloud-x": `${4 + ((index * 47 + index * index * 11 + seed * 17) % 88)}%`,
      "--cloud-y": `${33 + ((index * 37 + index * index * 7 + seed * 11) % 45)}%`,
      "--cloud-r": `${-22 + ((index * 19 + seed) % 45)}deg`,
      "--cloud-d": `${(index % 8) * 35}ms`,
      "--cloud-z": index,
    } as React.CSSProperties}
  ><b>{compactCredits(values[(index + seed) % values.length])}</b></i>)}</span>;
}

function BetZone({ option, amount, winning, disabled, onSelect, large = false, pot = 0, cloudSeed = 0 }: {
  option: PremiumBetOption;
  amount: number;
  winning: boolean;
  disabled: boolean;
  onSelect: (option: PremiumBetOption) => void;
  large?: boolean;
  pot?: number;
  cloudSeed?: number;
}) {
  return <button
    className={`rb-bet-zone ${large ? "large" : ""} ${amount ? "has-bet" : ""} ${winning ? "winner" : ""}`}
    data-tone={option.tone}
    disabled={disabled}
    onClick={() => onSelect(option)}
  >
    {large && <em><Coins />{compactCredits(pot)} CR</em>}
    <span>{option.label}</span>
    <small>{option.payout.replace(" return", "")}</small>
    <ChipCloud seed={cloudSeed} count={large ? 30 : 8} />
    {amount > 0 && <i className="rb-table-chip"><b>{compactCredits(amount)}</b></i>}
  </button>;
}

export function RedBlackTable({
  game, artwork, balance, stake, possibleReturn, history, phase, countdown, round, active, revealed,
  bets, selectedChip, chips, disabled, busy, minStake, muted, onToggleMuted, onRules,
  onHistory, onSelect, onChooseChip, onClear, onRepeat, onDouble, onPlay,
}: {
  game: PremiumGameDefinition;
  artwork: string;
  balance: number;
  stake: number;
  possibleReturn: string;
  history: ClientHistoryItem[];
  phase: RoundPhase;
  countdown: number;
  round: CompletedPremiumRound | null;
  active: boolean;
  revealed: boolean;
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
  onPlay: () => void;
}) {
  const [players, setPlayers] = useState<TablePlayer[]>(startingPlayers);

  useEffect(() => {
    const initialize = window.setTimeout(() => setPlayers(randomizedPlayers()), 0);
    const activity = window.setInterval(() => {
      setPlayers((current) => {
        const seat = Math.floor(Math.random() * current.length);
        return current.map((player, index) => index === seat ? {
          ...player,
          side: Math.random() > .48 ? "RED" : "BLACK",
          chip: [50, 100, 200, 500, 1000][Math.floor(Math.random() * 5)],
          pulse: player.pulse + 1,
        } : player);
      });
    }, 2800);
    return () => { window.clearTimeout(initialize); window.clearInterval(activity); };
  }, []);

  const options = useMemo(() => new Map(game.options.map((option) => [option.id, option])), [game.options]);
  const winning = new Set(round?.winningOptions ?? []);
  const marks = history.slice(0, 8).map(historyMark);
  const stateLabel = phase === "BETTING" ? "PLACE YOUR BETS" : phase === "CLOSED" ? "NO MORE BETS" : phase === "ANIMATING" ? "DEALING THE ROYAL HANDS" : round?.label ?? "ROUND COMPLETE";
  const virtualPot = players.reduce((total, player) => total + player.chip, 0) + stake;
  const red = options.get("RED")!;
  const black = options.get("BLACK")!;
  const sideOptions = ["PAIR", "HIGH_CARD", "STRAIGHT", "FLUSH"].map((id) => options.get(id)!);
  const blackPot = players.filter((player) => player.side === "BLACK").reduce((total, player) => total + player.chip, 0) + (bets.get("BLACK") ?? 0);
  const redPot = players.filter((player) => player.side === "RED").reduce((total, player) => total + player.chip, 0) + (bets.get("RED") ?? 0);
  const referenceResults = Array.from({ length: 7 }, (_, index) => ({
    label: ["STRAIGHT", "HIGH CARD", "HIGH CARD", "HIGH CARD", "PAIR", "HIGH CARD", "PAIR"][index],
    tone: marks[index]?.tone ?? (index === 0 || index === 4 || index === 6 ? "red" : "black"),
  }));

  return <main className={`rb-game rb-reference phase-${phase.toLocaleLowerCase()}`} style={{ "--game-accent": game.accent, "--game-accent-2": game.accent2, "--game-art": `url(${artwork})`, "--rb-scene": "url('/images/red-black/table-scene-v2.png')" } as React.CSSProperties}>
    <div className="rb-backdrop" />
    {phase === "CLOSED" && <div className="rb-coin-flight-layer" aria-hidden="true">
      {players.flatMap((player, playerIndex) => {
        const fromLeft = playerIndex < 4;
        const seat = playerIndex % 4;
        const redTarget = player.side === "RED";
        const travelX = fromLeft ? redTarget ? 61 : 35 : redTarget ? -32 : -58;
        return Array.from({ length: 4 }, (_, coinIndex) => <i
          key={`${player.name}:${coinIndex}`}
          className={fromLeft ? "from-left" : "from-right"}
          data-tone={player.side}
          style={{
            "--start-y": `${21 + seat * 20}%`,
            "--travel-x": `${travelX + (coinIndex - 1.5) * 2.1}vw`,
            "--arc-x": `${travelX * .55 + (coinIndex - 1.5) * 1.4}vw`,
            "--arc-y": `${-8 - coinIndex * 1.8}vh`,
            "--travel-y": `${34 - seat * 18 + (coinIndex % 2) * 2}vh`,
            "--bounce-y": `${32.5 - seat * 18 + (coinIndex % 2) * 2}vh`,
            "--flight-delay": `${seat * .07 + coinIndex * .11}s`,
            "--spin": `${720 + coinIndex * 210}deg`,
          } as React.CSSProperties}
        ><b>{compactCredits(player.chip)}</b></i>);
      })}
      <div className="rb-table-impact impact-black">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--spark": index } as React.CSSProperties} />)}<b>♠</b></div>
      <div className="rb-table-impact impact-red">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--spark": index } as React.CSSProperties} />)}<b>♥</b></div>
      <strong>TABLE BETS LOCKED</strong>
    </div>}
    <header className="rb-ref-hud">
      <Link href="/games" className="rb-ref-round-control" aria-label="Exit Red vs Black"><ArrowLeft /></Link>
      <nav aria-label="Red vs Black controls">
        <span className="rb-ref-wifi" title="Table connection"><Wifi /></span>
        <button className="rb-ref-round-control" onClick={onHistory} aria-label="Round history"><ShoppingCart /></button>
        <button className="rb-ref-round-control" onClick={onRules} aria-label="How to play"><ChevronDown /></button>
      </nav>
    </header>
    <button className="rb-ref-sound" onClick={onToggleMuted} aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? <VolumeX /> : <Volume2 />}</button>

    <div className="rb-results" aria-label="Recent results">
      <div className="rb-result-lamps">{referenceResults.map((item, index) => <i key={index} data-tone={item.tone} />)}</div>
      <div className="rb-result-labels">{referenceResults.map((item, index) => <span key={index} data-tone={item.tone}>{item.label}</span>)}</div>
      <button onClick={onHistory} aria-label="Open full result history">↗</button>
    </div>

    <aside className="rb-player-rail left" aria-label="Left table players">{players.slice(0, 4).map((player) => <PlayerSeat key={player.name} player={player} side="left" />)}</aside>
    <aside className="rb-player-rail right" aria-label="Right table players">{players.slice(4).map((player) => <PlayerSeat key={player.name} player={player} side="right" />)}</aside>

    <section className="rb-table">
      <div className="rb-table-rim"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <div className="rb-round-banner" data-phase={phase}>
        <i />
        <span>{stateLabel}</span>
        {countdown > 0 && <b>{countdown}</b>}
      </div>

      <section className="rb-duel-display">
        <GameStage game={game} round={round} active={active} revealed={revealed} flightMultiplier={1} />
      </section>

      <section className="rb-betting-board" aria-label="Betting table">
        <div className="rb-board-pot"><span><Coins /> TABLE ACTION</span><b>{compactCredits(virtualPot)} CR</b></div>
        <div className="rb-main-zones">
          <BetZone option={black} amount={bets.get("BLACK") ?? 0} winning={winning.has("BLACK")} disabled={disabled} onSelect={onSelect} large pot={blackPot} cloudSeed={2} />
          <i className="rb-board-divider"><b>VS</b></i>
          <BetZone option={red} amount={bets.get("RED") ?? 0} winning={winning.has("RED")} disabled={disabled} onSelect={onSelect} large pot={redPot} cloudSeed={5} />
        </div>
        <div className="rb-lucky-row">
          <span className="rb-lucky-title"><Sparkles /> LUCKY HIT <b>{compactCredits([...bets].filter(([id]) => !["RED", "BLACK"].includes(id)).reduce((total, [, amount]) => total + amount, 0))} CR</b></span>
          <div>{sideOptions.map((option, index) => <BetZone key={option.id} option={option} amount={bets.get(option.id) ?? 0} winning={winning.has(option.id)} disabled={disabled} onSelect={onSelect} cloudSeed={index + 8} />)}</div>
        </div>
      </section>
    </section>

    <div className="rb-ref-message"><b>{phase === "BETTING" ? "Betting…" : stateLabel}</b><span>{phase === "BETTING" ? "Choose a chip and tap the table." : "The royal hands are in motion."}</span></div>

    <footer className="rb-controls">
      <div className="rb-local-player"><div className="rb-local-avatar">YOU</div><span><small>YOUR SEAT</small><b>{balance.toLocaleString("en-PK", { maximumFractionDigits: 0 })} CR</b></span></div>
      <div className="rb-chip-deck"><small>SELECT CHIP</small><ChipSelector chips={chips} selected={selectedChip} setSelected={onChooseChip} disabled={disabled} /></div>
      <div className="rb-bet-tools">
        <button onClick={onClear} disabled={disabled || !bets.size}><Trash2 /><span>CLEAR</span></button>
        <button onClick={onRepeat} disabled={disabled}><RotateCcw /><span>REPEAT</span></button>
        <button onClick={onDouble} disabled={disabled || !bets.size}><b>2×</b><span>DOUBLE</span></button>
      </div>
      <div className="rb-stake-summary"><small>BET / RETURN</small><b>{stake ? `${stake.toLocaleString()} CR` : "—"}</b><span>{possibleReturn}</span></div>
      <button className="rb-deal-button" disabled={disabled || stake < minStake || stake > balance} onClick={onPlay}>
        <Sparkles /><span><small>{busy ? "SECURING ROUND…" : phase === "BETTING" ? "LOCK BETS" : stateLabel}</small><b>{stake ? "DEAL CARDS" : "PLACE A BET"}</b></span>
      </button>
    </footer>

    <div className="rb-disclosure"><UsersRound /> Animated virtual table players</div>
  </main>;
}
