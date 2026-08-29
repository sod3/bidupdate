"use client";

import { Plane, Zap } from "lucide-react";
import type { CompletedPremiumRound } from "@/lib/premium-games/client";
import type { PremiumGameDefinition } from "@/lib/premium-games/definitions";
import { carSelectorAngle, roulettePresentation } from "@/lib/premium-games/presentation";

const thunderGlyphs: Record<string, string> = { CROWN: "♛", CRYSTAL: "◆", GOBLET: "♜", RING: "◉", RUNE: "ϟ", PHOENIX: "♨", SHIELD: "⬢", DIAMOND: "◇", COIN: "◈" };
const moneyGlyphs: Record<string, string> = { CASH: "▤", DIAMOND: "◆", CROWN: "♛", SEVEN: "7", GOLD: "▰", COIN: "◉", VAULT: "▣", WILD: "★", BONUS: "✦" };
const carLabels = ["FALCON X", "VORTEX R", "PHANTOM GT", "RAZOR X", "NEBULA RS", "HYPERION"];

interface CardValue {
  label?: string;
  suit?: string;
  color?: "RED" | "BLACK";
}

function payloadArray<T>(round: CompletedPremiumRound | null, key: string): T[] {
  const value = round?.payload?.[key];
  return Array.isArray(value) ? value as T[] : [];
}

function GameCardFace({ card, reveal }: { card?: CardValue; reveal: boolean }) {
  return <div className={`premium-playing-card ${reveal ? "revealed" : ""}`}><div className="premium-card-inner"><div className="premium-card-back"><i>✦</i></div><div className="premium-card-front" data-color={card?.color ?? "BLACK"}><b>{card?.label ?? "A"}</b><span>{card?.suit ?? "♠"}</span><small>{card?.label ?? "A"}</small></div></div></div>;
}

function RouletteStage({ round, active, revealed }: { round: CompletedPremiumRound | null; active: boolean; revealed: boolean }) {
  const number = Number(round?.payload?.number ?? 0);
  const color = String(round?.payload?.color ?? "GREEN");
  const motion = roulettePresentation(number);
  return <div className="premium-roulette-stage"><div className={`premium-roulette-wheel ${active ? "spinning" : ""}`} style={{ "--wheel-angle": `${motion.wheelAngle}deg`, "--ball-angle": `${motion.ballAngle}deg` } as React.CSSProperties}><div className="premium-wheel-rim"><div className="premium-wheel-numbers" /><div className="premium-wheel-spindle">♛</div></div><i className="premium-wheel-ball" /></div><div className="premium-wheel-result" data-color={revealed ? color : "WAITING"}><small>ROYAL NUMBER</small><b>{revealed ? number : "—"}</b><span>{revealed ? color : active ? "BALL IN MOTION" : "PLACE YOUR CHIPS"}</span></div></div>;
}

function CarStage({ round, active, revealed }: { round: CompletedPremiumRound | null; active: boolean; revealed: boolean }) {
  const car = String(round?.payload?.car ?? "");
  const winner = carLabels.findIndex((label) => label.replaceAll(" ", "_") === car);
  return <div className="premium-car-stage"><div className={`premium-car-track ${active ? "spinning" : ""}`} style={{ "--car-angle": `${carSelectorAngle(winner)}deg` } as React.CSSProperties}><div className="premium-selector-beam" />{carLabels.map((label, index) => <div key={label} className={`premium-track-car car-${index + 1} ${winner === index && revealed ? "winner" : ""}`}><i /><span>{label}</span></div>)}</div><div className="premium-car-status"><small>{active ? "SELECTOR RACING" : revealed ? "CIRCUIT WINNER" : "NEON CIRCUIT READY"}</small><b>{revealed ? round?.label : active ? "LOCKING ON…" : "SELECT A VEHICLE"}</b></div></div>;
}

function TumbleStage({ round, active, revealed }: { round: CompletedPremiumRound | null; active: boolean; revealed: boolean }) {
  const grid = payloadArray<string[]>(round, "grid");
  const display = grid.length ? grid : Array.from({ length: 5 }, (_, row) => Array.from({ length: 6 }, (_, column) => Object.keys(thunderGlyphs)[(row * 6 + column) % 9]));
  const clusters = payloadArray<{ symbol: string; count: number }>(round, "clusters");
  const winning = new Set(revealed ? clusters.map((cluster) => cluster.symbol) : []);
  const rune = Number(round?.payload?.rune ?? 1);
  return <div className={`premium-tumble-stage ${active ? "tumbling" : ""}`}><div className="premium-storm-guardian"><Zap /><span>STORM<br />WARDEN</span></div><div className="premium-symbol-grid thunder-grid">{display.flatMap((row, rowIndex) => row.map((symbol, column) => <div key={`${rowIndex}:${column}`} className={winning.has(symbol) ? "winning" : ""} style={{ "--cell-delay": `${(rowIndex * 6 + column) * 24}ms` } as React.CSSProperties}><span>{thunderGlyphs[symbol] ?? "◆"}</span><small>{symbol}</small></div>))}</div>{revealed && rune > 1 && <div className="premium-multiplier-rune"><Zap />{rune}×</div>}</div>;
}

function MoneyStage({ round, active, revealed }: { round: CompletedPremiumRound | null; active: boolean; revealed: boolean }) {
  const grid = payloadArray<string[]>(round, "grid");
  const display = grid.length ? grid : Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, column) => Object.keys(moneyGlyphs)[(row * 5 + column) % 9]));
  const wins = payloadArray<{ line: number; symbol: string; count: number }>(round, "wins");
  const winning = new Set(revealed ? wins.map((win) => win.symbol) : []);
  const bonus = Number(round?.payload?.bonus ?? 0);
  return <div className={`premium-money-stage ${active ? "rolling" : ""}`}><div className="premium-vault-arch"><i>✦</i><span>VAULTWORKS</span></div><div className="premium-symbol-grid money-grid">{display.flatMap((row, rowIndex) => row.map((symbol, column) => <div key={`${rowIndex}:${column}`} className={winning.has(symbol) ? "winning" : ""} style={{ "--cell-delay": `${column * 120}ms` } as React.CSSProperties}><span>{moneyGlyphs[symbol] ?? "◉"}</span><small>{symbol}</small></div>))}</div><div className={`premium-bonus-meter ${revealed && bonus ? "unlocked" : ""}`}><span>BONUS PRESSURE</span><i><b style={{ width: revealed ? `${Math.min(100, (Number(round?.payload?.bonusCount ?? 0) / 3) * 100)}%` : "0%" }} /></i><strong>{revealed ? bonus ? `MONEY WHEEL ${bonus}×` : `${Number(round?.payload?.bonusCount ?? 0)} / 3` : active ? "SPINNING" : "0 / 3"}</strong></div></div>;
}

function SicBoStage({ round, active, revealed }: { round: CompletedPremiumRound | null; active: boolean; revealed: boolean }) {
  const dice = payloadArray<number>(round, "dice");
  const display = dice.length ? dice : [2, 5, 4];
  return <div className="premium-sicbo-stage"><div className={`premium-dice-chamber ${active ? "shaking" : ""}`}><div className="premium-glass-shine" />{display.map((die, index) => <div key={index} className={`premium-die die-${index + 1}`}><span>{die}</span></div>)}</div><div className="premium-dice-total"><small>TOTAL</small><b>{revealed ? String(round?.payload.total) : "—"}</b><span>{revealed ? round?.label : active ? "DICE IN MOTION" : "CHAMBER READY"}</span></div></div>;
}

function RedBlackStage({ round, active, revealed }: { round: CompletedPremiumRound | null; active: boolean; revealed: boolean }) {
  const red = payloadArray<CardValue>(round, "red");
  const black = payloadArray<CardValue>(round, "black");
  return <div className={`premium-card-duel-stage ${active ? "dealing" : ""}`}>
    <div className="premium-kingdom black"><i>♠</i><small>BLACK HOUSE</small><b>SENTINEL VARYN</b><span>{revealed ? String(round?.payload?.blackHand) : active ? "HAND IN PLAY" : "AWAITING HAND"}</span></div>
    <div className="premium-duel-cards">
      <div className="black-hand">{[0, 1, 2].map((index) => <GameCardFace key={`b${index}`} card={black[index]} reveal={revealed} />)}</div>
      <i><small>ROYAL</small>VS</i>
      <div className="red-hand">{[0, 1, 2].map((index) => <GameCardFace key={`r${index}`} card={red[index]} reveal={revealed} />)}</div>
    </div>
    <div className="premium-kingdom red"><i>♥</i><small>RED HOUSE</small><b>REGENT AURELIA</b><span>{revealed ? String(round?.payload?.redHand) : active ? "HAND IN PLAY" : "AWAITING HAND"}</span></div>
    {revealed && round && <div className="rb-duel-result" data-winner={String(round.payload.winner ?? "TIE")}>{round.label}</div>}
  </div>;
}

function DragonTigerStage({ round, active, revealed }: { round: CompletedPremiumRound | null; active: boolean; revealed: boolean }) {
  const dragon = (round?.payload?.dragon ?? {}) as CardValue;
  const tiger = (round?.payload?.tiger ?? {}) as CardValue;
  return <div className={`premium-dragon-stage ${active ? "dealing" : ""}`}><div className="premium-guardian-side dragon"><small>JADE GUARDIAN</small><b>DRAGON</b><i>龍</i></div><div className="premium-dragon-cards"><GameCardFace card={dragon} reveal={revealed} /><span>VS</span><GameCardFace card={tiger} reveal={revealed} /></div><div className="premium-guardian-side tiger"><small>GOLD GUARDIAN</small><b>TIGER</b><i>虎</i></div>{revealed && round && <div className="premium-temple-result">{round.label}</div>}</div>;
}

function FlightStage({ multiplier, active, round }: { multiplier: number; active: boolean; round: CompletedPremiumRound | null }) {
  const crash = Number(round?.payload?.crashMultiplier ?? 0);
  const cashed = Number(round?.payload?.cashedOutMultiplier ?? round?.multiplier ?? 0);
  const shownMultiplier = active ? multiplier : round ? (round.result === "LOSS" ? crash : cashed) : 1;
  const progress = Math.min(1, Math.log(Math.max(1, shownMultiplier)) / Math.log(100));
  const x = 34 + progress * 326;
  const y = 186 - progress * 132 - Math.sin(progress * Math.PI) * 16;
  const controlY = 178 - progress * 98;
  const path = `M 28 188 C 105 183, 210 ${controlY.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
  const stateLabel = active ? "FLYING · TAP CASH OUT" : round ? (round.result === "WIN" ? "CASHED OUT" : "FLIGHT ENDED") : "READY";

  return <div className={`premium-flight-stage ${active ? "flying" : ""} ${round?.result === "LOSS" ? "crashed" : ""} ${round?.result === "WIN" ? "cashed" : ""}`}>
    <div className="premium-flight-sky" aria-hidden="true">
      <i className="star-field star-a" /><i className="star-field star-b" />
      <i className="flight-cloud cloud-a" /><i className="flight-cloud cloud-b" /><i className="flight-cloud cloud-c" />
      <div className="flight-horizon" />
      <div className="flight-city"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
    </div>

    <div className="premium-flight-status" aria-live="polite">
      <span className={active ? "live" : ""}><i />{stateLabel}</span>
      <small>{active ? "Multiplier rises until the flight ends" : round ? round.label : "Choose an amount and launch"}</small>
    </div>

    <div className="premium-flight-multiplier">
      <small>{active ? "CURRENT MULTIPLIER" : round ? "ROUND MULTIPLIER" : "STARTS AT"}</small>
      <b>{shownMultiplier.toFixed(2)}<span>×</span></b>
      {active && <em>RETURN {Math.max(0, Math.round(shownMultiplier * 100) / 100).toFixed(2)}×</em>}
    </div>

    <svg className="premium-flight-graph" viewBox="0 0 410 220" role="img" aria-label={`Flight X multiplier ${shownMultiplier.toFixed(2)} times`}>
      <defs>
        <linearGradient id="flight-line" x1="0" x2="1"><stop stopColor="#4fe4ff"/><stop offset="1" stopColor="#ffd069"/></linearGradient>
        <linearGradient id="flight-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4fe4ff" stopOpacity=".24"/><stop offset="1" stopColor="#4fe4ff" stopOpacity="0"/></linearGradient>
      </defs>
      <path className="premium-flight-gridline" d="M28 188H390M28 147H390M28 106H390M28 65H390"/>
      <path className="premium-flight-area" d={`${path} L ${x.toFixed(1)} 188 L 28 188 Z`}/>
      <path className="premium-flight-path" d={path}/>
      <circle className="premium-flight-dot" cx={x} cy={y} r="5" />
    </svg>

    <div className="premium-flight-jet" style={{ left: `${8 + progress * 76}%`, bottom: `${15 + progress * 54}%` }} aria-hidden="true">
      <span className="jet-trail"><i /><i /><i /></span>
      <Plane />
      <span className="jet-engine" />
      {round?.result === "LOSS" && <span className="flight-burst"><i /><i /><i /></span>}
    </div>

    <div className="premium-flight-levels" aria-hidden="true"><span>1×</span><span>2×</span><span>5×</span><span>10×</span><span>100×</span></div>
  </div>;
}

export function GameStage({ game, round, active, revealed, flightMultiplier }: { game: PremiumGameDefinition; round: CompletedPremiumRound | null; active: boolean; revealed: boolean; flightMultiplier: number }) {
  switch (game.mode) {
    case "roulette": return <RouletteStage round={round} active={active} revealed={revealed} />;
    case "car-wheel": return <CarStage round={round} active={active} revealed={revealed} />;
    case "tumble": return <TumbleStage round={round} active={active} revealed={revealed} />;
    case "reels": return <MoneyStage round={round} active={active} revealed={revealed} />;
    case "dice": return <SicBoStage round={round} active={active} revealed={revealed} />;
    case "card-duel": return <RedBlackStage round={round} active={active} revealed={revealed} />;
    case "dragon-tiger": return <DragonTigerStage round={round} active={active} revealed={revealed} />;
    case "crash": return <FlightStage multiplier={flightMultiplier} active={active} round={round} />;
  }
}
