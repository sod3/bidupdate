"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Coins, Gift, Info, Minus, Plus, Settings, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { AnimationManager, AssetLoader, AudioManager, HapticManager, TutorialManager } from "@/game-engine";
import { formatCredits } from "@/lib/customerCopy";
import { getGameQualityPreference, setGameQualityPreference, type GameQualityPreference } from "@/lib/gamePerformance";
import { SLOT_PAYLINES, SLOT_STAKES, SLOT_SYMBOLS, type SlotGrid, type SlotStake, type SlotSymbolId, type SlotWinningLine } from "@/lib/slots/engine";
import { triggerGameCinematic } from "@/lib/gameCinematics";

interface SpinResult {
  spinId: string;
  stake: SlotStake;
  grid: SlotGrid;
  winningLines: SlotWinningLine[];
  totalMultiplier: number;
  payout: number;
  net: number;
  result: "LOSS" | "WIN" | "JACKPOT";
  balance: number;
  completedAt: string;
}

const INITIAL_GRID: SlotGrid = [
  ["EMERALD", "SEVEN", "CROWN", "RUBY", "WILD"],
  ["COIN", "BELL", "BONUS", "STAR", "COIN"],
  ["CHEST", "RUBY", "SEVEN", "EMERALD", "CROWN"],
];
const symbolMap = new Map(SLOT_SYMBOLS.map((symbol) => [symbol.id, symbol]));
const SlotsReelCanvas = dynamic(() => import("@/components/slots/SlotsReelCanvas"), { ssr: false });
const preloadSlotsReelCanvas = () => { const preload = (SlotsReelCanvas as { preload?: () => unknown }).preload; if (preload) void preload(); };

function requestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `slots_${crypto.randomUUID()}`
    : `slots_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function SlotSymbol({ symbol, compact = false }: { symbol: SlotSymbolId; compact?: boolean }) {
  const definition = symbolMap.get(symbol);
  if (!definition) return null;
  return (
    <span className={`slot-symbol slot-symbol-${symbol.toLocaleLowerCase()} ${compact ? "slot-symbol-compact" : ""}`} aria-label={definition.label}>
      {definition.glyph}
    </span>
  );
}

function validFiveReelGrid(value: unknown): value is SlotGrid {
  return Array.isArray(value) && value.length === 3 && value.every((row) => Array.isArray(row) && row.length === 5 && row.every((symbol) => symbolMap.has(symbol as SlotSymbolId)));
}

function Paytable({ stake, onClose }: { stake: SlotStake; onClose: () => void }) {
  return (
    <div className="slot-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="slot-paytable" role="dialog" aria-modal="true" aria-labelledby="slot-paytable-title">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-300/55">3 matching symbols</p><h2 id="slot-paytable-title" className="mt-1 text-xl font-black text-white">Paytable</h2></div>
          <button type="button" onClick={onClose} className="slot-round-button" aria-label="Close paytable"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...SLOT_SYMBOLS].sort((left, right) => right.multiplier - left.multiplier).map((symbol) => (
            <div className="slot-pay-item" key={symbol.id}>
              <SlotSymbol symbol={symbol.id} compact />
              <div><b>{symbol.multiplier}×</b><small>{formatCredits(stake * symbol.multiplier)}</small></div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-white/45">5 winning lines</span><span className="text-[10px] font-black text-amber-200">BET × MULTIPLIER</span></div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {SLOT_PAYLINES.map((line) => (
              <div className="slot-line-mini" key={line.id} title={line.label}>
              {Array.from({ length: 15 }, (_, index) => {
                  const row = Math.floor(index / 5);
                  const column = index % 5;
                  const active = line.cells.some(([lineRow, lineColumn]) => lineRow === row && lineColumn === column);
                  return <i className={active ? "slot-line-mini-active" : ""} key={index} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ soundOn, setSoundOn, quality, setQuality, onClose }: {
  soundOn: boolean;
  setSoundOn: (value: boolean) => void;
  quality: GameQualityPreference;
  setQuality: (value: GameQualityPreference) => void;
  onClose: () => void;
}) {
  return <div className="slot-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div className="slot-paytable slot-settings" role="dialog" aria-modal="true" aria-labelledby="slot-settings-title"><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-300/55">Game setup</p><h2 id="slot-settings-title" className="mt-1 text-xl font-black text-white">Settings</h2></div><button type="button" onClick={onClose} className="slot-round-button" aria-label="Close settings"><X className="h-5 w-5" /></button></div><button type="button" className="slot-setting-row" onClick={() => setSoundOn(!soundOn)}><span>{soundOn ? <Volume2 /> : <VolumeX />}<b>Sound</b></span><em>{soundOn ? "ON" : "OFF"}</em></button><div className="slot-quality"><small>GRAPHICS</small><div>{(["AUTO", "LOW", "MEDIUM", "HIGH"] as const).map((item) => <button type="button" key={item} onClick={() => setQuality(item)} className={quality === item ? "active" : ""}>{item}</button>)}</div><p>Changes apply when a game renderer is opened again.</p></div></div></div>;
}

export default function SlotsExperience() {
  const wallet = useWallet();
  const [stake, setStake] = useState<SlotStake>(25);
  const [balance, setBalance] = useState(0);
  const [grid, setGrid] = useState<SlotGrid>(INITIAL_GRID);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateAuthorized, setStateAuthorized] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(5);
  const [visualReady, setVisualReady] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [stoppedReels, setStoppedReels] = useState(5);
  const [autoSpin, setAutoSpin] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [quality, setQuality] = useState<GameQualityPreference>("AUTO");
  const [displayedWin, setDisplayedWin] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const spinLock = useRef(false);

  const tone = useCallback((kind: "spin" | "stop" | "win" | "jackpot" | "lose") => {
    AudioManager.setMuted(!soundOn);
    AudioManager.cue(kind === "stop" ? "reel-stop" : kind === "jackpot" ? "mega-win" : kind === "lose" ? "loss" : kind);
  }, [soundOn]);

  useEffect(() => {
    preloadSlotsReelCanvas();
    let cancelled = false;
    const qualityTimer = window.setTimeout(() => { if (!cancelled) setQuality(getGameQualityPreference()); }, 0);
    const pulse = window.setInterval(() => setLoadingProgress((value) => Math.min(88, value + 5)), 80);
    void AssetLoader.images(["/images/slots/nova-mascot.webp"], (progress) => {
      if (!cancelled) setLoadingProgress(Math.max(18, Math.min(90, progress * .9)));
    }).catch(() => null);
    return () => { cancelled = true; window.clearTimeout(qualityTimer); window.clearInterval(pulse); };
  }, []);

  useEffect(() => {
    if (loading || (!stateAuthorized && wallet.loading)) return;
    setLoadingProgress(100);
    const frame = window.requestAnimationFrame(() => {
      setVisualReady(true);
      if (TutorialManager.shouldShow("777-slots")) setTutorialOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, stateAuthorized, wallet.loading]);

  useEffect(() => {
    if (!tutorialOpen) return;
    const timer = window.setTimeout(() => { TutorialManager.complete("777-slots"); setTutorialOpen(false); }, 2400);
    return () => window.clearTimeout(timer);
  }, [tutorialOpen]);

  useEffect(() => {
    if (spinning || !result?.payout) return;
    return AnimationManager.count({ to: result.payout, duration: result.result === "JACKPOT" ? 1100 : 620, onUpdate: (value) => setDisplayedWin(Math.round(value)) });
  }, [result, spinning]);

  useEffect(() => {
    // Start in parallel with the global wallet/session request. This removes a
    // second request waterfall on direct game loads. A guest simply receives
    // 401 here and is shown the existing sign-in gate once wallet auth settles.
    let cancelled = false;
    void fetch("/api/slots", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { balance?: number; recent?: SpinResult[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "The slot machine could not be loaded.");
        if (!cancelled) {
          setStateAuthorized(true);
          setBalance(Number(payload.balance ?? 0));
          if (payload.recent?.[0] && validFiveReelGrid(payload.recent[0].grid)) {
            setGrid(payload.recent[0].grid);
            setResult(payload.recent[0]);
          }
        }
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "The slot machine could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const winningCells = useMemo(() => new Set(result?.winningLines.flatMap((line) => line.cells.map(([row, column]) => `${row}:${column}`)) ?? []), [result]);
  const jackpot = result?.result === "JACKPOT";
  const insufficient = balance < stake;

  const spin = useCallback(async () => {
    if (spinLock.current || spinning) return;
    if (balance < stake) {
      setError("Not enough balance");
      setAutoSpin(false);
      return;
    }
    spinLock.current = true;
    HapticManager.pulse("tap");
    setSpinning(true);
    setDisplayedWin(0);
    setStoppedReels(0);
    setResult(null);
    setError(null);
    triggerGameCinematic({ kind: "start", game: "NOVA 777", kicker: "REELS LOCKED", center: turbo ? "TURBO SPIN" : "SPIN", accent: "#fbbf24", accent2: "#f43f5e", icon: "sparkles", durationMs: turbo ? 1300 : 2300 });
    tone("spin");
    const startedAt = Date.now();
    try {
      const response = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ stake, requestId: requestKey() }),
      });
      const payload = await response.json().catch(() => ({})) as { spin?: SpinResult; error?: string; code?: string };
      if (!response.ok || !payload.spin) {
        const message = payload.code === "INSUFFICIENT_BALANCE" || /insufficient/i.test(payload.error ?? "") ? "Not enough balance" : payload.error || "The spin could not be completed.";
        throw new Error(message);
      }
      await AnimationManager.delay(Math.max(0, (turbo ? 800 : 2200) - (Date.now() - startedAt)));
      setGrid(payload.spin.grid);
      for (let reel = 1; reel <= 5; reel += 1) {
        setStoppedReels(reel);
        tone("stop");
        HapticManager.pulse("impact");
        await AnimationManager.delay(turbo ? 75 : reel === 5 ? 220 : 170);
      }
      setResult(payload.spin);
      setBalance(payload.spin.balance);
      if (payload.spin.result !== "LOSS") triggerGameCinematic({ kind: payload.spin.result === "JACKPOT" ? "jackpot" : "win", game: "NOVA 777", kicker: payload.spin.result === "JACKPOT" ? "JACKPOT" : "WINNER", center: payload.spin.result === "JACKPOT" ? "MEGA JACKPOT" : `${payload.spin.totalMultiplier.toFixed(2)}× WIN`, accent: "#fbbf24", accent2: "#f43f5e", icon: "sparkles", durationMs: payload.spin.result === "JACKPOT" ? 3000 : 2200 });
      if (payload.spin.result === "JACKPOT") { tone("jackpot"); HapticManager.pulse("major"); }
      else if (payload.spin.result === "WIN") { tone("win"); HapticManager.pulse("success"); }
      else { tone("lose"); HapticManager.pulse("failure"); }
      void wallet.refreshWallet();
    } catch (caught) {
      setStoppedReels(5);
      setError(caught instanceof Error ? caught.message : "The spin could not be completed.");
      if (caught instanceof Error && /balance/i.test(caught.message)) setAutoSpin(false);
    } finally {
      spinLock.current = false;
      setSpinning(false);
    }
  }, [balance, spinning, stake, tone, turbo, wallet]);

  useEffect(() => {
    if (!autoSpin || spinning || loading) return;
    const timer = window.setTimeout(() => void spin(), result ? (turbo ? 320 : 850) : 80);
    return () => window.clearTimeout(timer);
  }, [autoSpin, loading, result, spin, spinning, turbo]);

  const changeStake = (direction: -1 | 1) => {
    const current = SLOT_STAKES.indexOf(stake);
    const next = Math.min(SLOT_STAKES.length - 1, Math.max(0, current + direction));
    setStake(SLOT_STAKES[next]);
    setError(null);
  };

  if (loading || (!stateAuthorized && wallet.loading) || !visualReady) {
    return <div className="game-screen slot-screen grid place-items-center"><div className="slot-loader"><span>7</span><b>NOVA 777</b><div className="slot-loading-track"><i style={{ width: `${loadingProgress}%` }} /></div><small>{Math.round(loadingProgress)}%</small></div></div>;
  }

  if (!stateAuthorized && wallet.user.role !== "USER") {
    return (
      <main className="game-screen slot-screen grid place-items-center px-5">
        <div className="slot-login-card"><span className="slot-login-seven">777</span><h1>777 SLOTS</h1><p>Log in to play with your protected Play Arena balance.</p><Link href="/login?next=/play/777-slots">Log in to play</Link><Link href="/" className="slot-login-back">Back to games</Link></div>
      </main>
    );
  }

  const celebration = jackpot ? "jackpot" : result?.payout ? "win" : "none";
  const bigWin = Boolean(result?.payout && result.totalMultiplier >= 20);

  return (
    <main className={`game-screen slot-screen ${jackpot ? "slot-screen-jackpot" : ""} ${bigWin ? "slot-screen-big-win" : ""}`}>
      <div className="slot-ambient" aria-hidden="true" />
      <div className="slot-mascot" aria-hidden="true"><Image src="/images/slots/nova-mascot.webp" alt="" width={768} height={1152} priority /></div>
      <header className="slot-header">
        <Link href="/" className="slot-round-button" aria-label="Back to games"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="slot-jackpot-banner"><small>NOVA JACKPOT</small><b>50× BET</b></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPaytableOpen(true)} className="slot-round-button slot-gift-button" aria-label="Open rewards and paytable"><Gift className="h-4 w-4" /></button>
          <button type="button" onClick={() => { TutorialManager.replay("777-slots"); setTutorialOpen(true); }} className="slot-round-button slot-help-button" aria-label="Replay tutorial"><Info className="h-4 w-4" /></button>
          <button type="button" onClick={() => setSoundOn((value) => !value)} className="slot-round-button slot-sound-button" aria-label={soundOn ? "Mute sounds" : "Enable sounds"}>{soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="slot-round-button slot-settings-button" aria-label="Open game settings"><Settings className="h-4 w-4" /></button>
          <div className="slot-balance"><small>Balance</small><b>{formatCredits(balance)}</b></div>
        </div>
      </header>

      <section className="slot-stage" aria-label="777 slot machine">
        <div className="slot-cabinet">
          <div className="slot-marquee"><i /><span>7</span><span>7</span><span>7</span><b>NOVA</b><i /></div>
          <div className="slot-machine-window">
            <SlotsReelCanvas grid={grid} spinning={spinning} stoppedReels={stoppedReels} winningCells={winningCells} celebration={celebration} />
            <span className="sr-only">{grid.map((row) => row.map((symbol) => symbolMap.get(symbol)?.label ?? symbol).join(", ")).join(". ")}</span>
            {!spinning && result?.winningLines.map((line) => <i className={`slot-win-line slot-win-line-${line.id}`} key={line.id} />)}
            <div className="slot-payline-arrow slot-payline-left">▶</div><div className="slot-payline-arrow slot-payline-right">◀</div>
          </div>
          <div className={`slot-win-panel ${result?.payout ? "slot-win-panel-active" : ""}`} aria-live="polite">
            {spinning ? <><small>GOOD LUCK</small><b className="slot-dots">•••</b></> : result?.payout ? <><small>{jackpot ? "MEGA WIN" : bigWin ? "BIG WIN" : `LINE WIN · ${result.totalMultiplier}×`}</small><b>+{formatCredits(displayedWin)}</b></> : <><small>{result ? "TRY AGAIN" : "READY"}</small><b>WIN: 0 CR</b></>}
          </div>
          {result?.payout ? <div className="slot-coin-rain" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <Coins key={index} style={{ "--coin-index": index } as React.CSSProperties} />)}</div> : null}
          {result?.payout ? <div className={`slot-jackpot-burst ${jackpot ? "mega" : bigWin ? "big" : "small"}`} aria-hidden="true"><Sparkles /><span>{jackpot ? "MEGA WIN" : bigWin ? "BIG WIN" : "NICE!"}</span><Sparkles /></div> : null}
        </div>
      </section>

      <section className="slot-controls-wrap" aria-label="Slot controls">
        {error && <div className="slot-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}
        <div className="slot-stakes" aria-label="Bet presets">
          {SLOT_STAKES.map((preset) => <button type="button" key={preset} onClick={() => { setStake(preset); setError(null); }} disabled={spinning || autoSpin} className={stake === preset ? "slot-stake-active" : ""}>{preset}</button>)}
        </div>
        <div className="slot-controls">
          <div className="slot-bet-control">
            <button type="button" disabled={spinning || autoSpin || stake === SLOT_STAKES[0]} onClick={() => changeStake(-1)} aria-label="Decrease bet"><Minus /></button>
            <div><small>BET</small><b>{formatCredits(stake)}</b></div>
            <button type="button" disabled={spinning || autoSpin || stake === SLOT_STAKES[SLOT_STAKES.length - 1]} onClick={() => changeStake(1)} aria-label="Increase bet"><Plus /></button>
          </div>
          <button type="button" className="slot-spin-button" disabled={spinning || autoSpin || insufficient} onClick={() => void spin()} aria-label={spinning ? "Reels spinning" : `Spin for ${stake} credits`}><span>{spinning ? "•••" : "7"}</span><b>{spinning ? "SPINNING" : "SPIN"}</b></button>
          <div className="slot-mode-buttons"><button type="button" className={`slot-auto-button ${autoSpin ? "slot-auto-stop" : ""}`} disabled={!autoSpin && (spinning || insufficient)} onClick={() => { HapticManager.pulse("tap"); setAutoSpin((value) => !value); }}><span>{autoSpin ? "■" : "↻"}</span><b>{autoSpin ? "STOP" : "AUTO"}</b></button><button type="button" className={`slot-auto-button slot-turbo-button ${turbo ? "slot-turbo-active" : ""}`} disabled={spinning} onClick={() => { HapticManager.pulse("tap"); setTurbo((value) => !value); }}><span>⚡</span><b>TURBO</b></button></div>
        </div>
        {insufficient && <div className="slot-deposit"><b>Not enough balance</b><Link href="/deposit">+ Deposit</Link></div>}
      </section>

      {paytableOpen && <Paytable stake={stake} onClose={() => setPaytableOpen(false)} />}
      {settingsOpen && <SettingsPanel soundOn={soundOn} setSoundOn={setSoundOn} quality={quality} setQuality={(value) => { setQuality(value); setGameQualityPreference(value); }} onClose={() => setSettingsOpen(false)} />}
      {tutorialOpen && <div className="slot-tutorial" role="status" aria-label="Tap the large green spin button"><span className="slot-tutorial-hand">👆</span><b>SPIN</b><i>↓</i></div>}
    </main>
  );
}
