"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Coins, Loader2, Plane, Sparkles, WalletCards } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { GameCanvas } from "@/components/premium-games/GameCanvas";
import { GameErrorBoundary } from "@/components/premium-games/GameErrorBoundary";
import { FlightXTable, type FlightBetBay } from "@/components/premium-games/FlightXTable";
import {
  BettingArea, BettingPanel, BettingTimer, ChipSelector, GameHeader, GameRulesModal, LoadingScreen, LossAnimation,
  ReconnectHandler, ResponsiveGameLayout, ResultHistory, SettingsPanel, WinAnimation,
} from "@/components/premium-games/GameChrome";
import { GameStage } from "@/components/premium-games/GameStage";
import { RedBlackTable } from "@/components/premium-games/RedBlackTable";
import { GameSessionManager, PremiumGameRequestError, ServerResultService, TransactionManager, type ActiveFlightRound, type CompletedPremiumRound, type PremiumGameState } from "@/lib/premium-games/client";
import { premiumGame, type PremiumBetOption, type PremiumGameId } from "@/lib/premium-games/definitions";
import { SoundManager, type GameSound } from "@/lib/premium-games/soundManager";
import { triggerGameCinematic } from "@/lib/gameCinematics";

type RoundPhase = "BETTING" | "CLOSED" | "ANIMATING" | "RESULT";

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}


function playCinematicFor(gameId: PremiumGameId, game: ReturnType<typeof premiumGame>) {
  if (gameId === "red-vs-black") return triggerGameCinematic({ kind: "versus", game: game.title.toUpperCase(), kicker: game.kicker.toUpperCase(), left: "RED KINGDOM", leftMeta: "REGENT AURELIA", right: "BLACK KINGDOM", rightMeta: "SENTINEL VARYN", accent: game.accent, accent2: game.accent2, icon: "swords", durationMs: 3300 });
  if (gameId === "dragon-tiger") return triggerGameCinematic({ kind: "versus", game: game.title.toUpperCase(), kicker: game.kicker.toUpperCase(), left: "DRAGON", leftMeta: "JADE GUARDIAN", right: "TIGER", rightMeta: "GOLD GUARDIAN", accent: game.accent, accent2: game.accent2, icon: "swords", durationMs: 3300 });
  if (gameId === "flight-x") return;
  const center = game.mode === "roulette" ? "NO MORE BETS" : game.mode === "car-wheel" ? "LIGHTS OUT" : game.mode === "dice" ? "ROLL THE DICE" : game.mode === "tumble" ? "CALL THE STORM" : "SPIN THE VAULT";
  triggerGameCinematic({ kind: game.mode === "crash" ? "launch" : "start", game: game.title.toUpperCase(), kicker: game.kicker.toUpperCase(), center, accent: game.accent, accent2: game.accent2, icon: game.mode === "tumble" ? "zap" : "sparkles", durationMs: 2800 });
}

function animationSound(gameId: PremiumGameId): GameSound {
  if (gameId === "royal-roulette" || gameId === "car-roulette") return "wheel";
  if (gameId === "sic-bo") return "dice";
  if (gameId === "red-vs-black" || gameId === "dragon-tiger") return "card";
  if (gameId === "thunder-gods") return "lightning";
  if (gameId === "flight-x") return "launch";
  return "reel";
}

export function GameShell({ gameId }: { gameId: PremiumGameId }) {
  const game = premiumGame(gameId);
  const wallet = useWallet();
  const sessionClock = useRef(new GameSessionManager());
  const [state, setState] = useState<PremiumGameState | null>(null);
  const [balance, setBalance] = useState(0);
  const [progress, setProgress] = useState(4);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<RoundPhase>("BETTING");
  const [countdown, setCountdown] = useState(0);
  const [selectedChip, setSelectedChip] = useState<number>(game.chips[0]);
  const [bets, setBets] = useState<Map<string, number>>(new Map());
  const [lastBets, setLastBets] = useState<Map<string, number>>(new Map());
  const [removing, setRemoving] = useState(false);
  const [round, setRound] = useState<CompletedPremiumRound | null>(null);
  const [activeFlight, setActiveFlight] = useState<ActiveFlightRound | null>(null);
  const [flightMultiplier, setFlightMultiplier] = useState(1);
  const [cashoutPending, setCashoutPending] = useState(false);
  const [flightBays, setFlightBays] = useState<[FlightBetBay, FlightBetBay]>(() => [
    { amount: game.chips[0], autoCashout: 1.58, autoEnabled: false },
    { amount: game.chips[0], autoCashout: 1.58, autoEnabled: false },
  ]);
  const [activeFlightBay, setActiveFlightBay] = useState<number | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [master, setMaster] = useState(0.7);
  const [sfx, setSfx] = useState(0.75);
  const busyRef = useRef(false);
  const singleAction = game.mode === "tumble" || game.mode === "reels" || game.mode === "crash";
  const defaultOption = game.options[0].id;

  const loadState = useCallback(async (signal?: AbortSignal) => {
    const payload = await ServerResultService.state(gameId, signal);
    sessionClock.current.sync(payload.serverNow);
    setState(payload);
    setBalance(payload.balance);
    const firstChip = payload.setting.chipDenominations.find((chip) => chip >= payload.setting.minStake) ?? payload.setting.chipDenominations[0];
    setSelectedChip((current) => payload.setting.chipDenominations.includes(current) ? current : firstChip);
    if (gameId === "flight-x") setFlightBays((current) => current.map((bay) => ({
      ...bay,
      amount: payload.setting.chipDenominations.includes(bay.amount) && bay.amount <= payload.setting.maxStake ? bay.amount : firstChip,
    })) as [FlightBetBay, FlightBetBay]);
    if (singleAction) setBets((current) => current.size ? current : new Map([[defaultOption, firstChip]]));
    if (payload.activeRound) {
      setActiveFlight(payload.activeRound);
      setActiveFlightBay((current) => current ?? 0);
      setBets(new Map([[defaultOption, payload.activeRound.totalStake]]));
      setFlightBays((current) => [{ ...current[0], amount: payload.activeRound?.totalStake ?? current[0].amount }, current[1]]);
      setBalance(payload.activeRound.balance);
      setPhase("ANIMATING");
    }
    return payload;
  }, [defaultOption, gameId, singleAction]);

  useEffect(() => {
    SoundManager.setSettings({ muted, master, sfx });
  }, [master, muted, sfx]);

  useEffect(() => {
    // Start the protected game state request immediately. Previously this waited
    // for the global wallet request first, creating a full extra network/DB
    // waterfall on every game navigation. The two requests can safely run in
    // parallel; the wallet is still used below to decide whether to show the
    // sign-in gate.
    const controller = new AbortController();
    let mounted = true;
    const ticker = window.setInterval(() => setProgress((value) => Math.min(94, value + Math.max(1, (96 - value) * 0.1))), 70);
    void Promise.resolve().then(() => loadState(controller.signal)).then(() => {
      if (!mounted) return;
      setProgress(100);
      // No artificial 220ms hold and no blocking image preload. The background
      // image is already warmed by the catalogue and can decode independently.
      window.requestAnimationFrame(() => { if (mounted) setReady(true); });
    }).catch((caught) => {
      if (!mounted || controller.signal.aborted) return;
      if (!(caught instanceof PremiumGameRequestError && caught.status === 401)) {
        setLoadError(caught instanceof Error ? caught.message : "The game could not be loaded.");
      }
      setProgress(100);
      setReady(true);
    }).finally(() => window.clearInterval(ticker));
    return () => { mounted = false; controller.abort(); window.clearInterval(ticker); };
  }, [loadState]);

  const finishFlight = useCallback((completed: CompletedPremiumRound, nextState?: PremiumGameState) => {
    setCashoutPending(false);
    setActiveFlight(null);
    setFlightMultiplier(Number(completed.payload.cashedOutMultiplier ?? completed.payload.crashMultiplier ?? 1));
    setRound(completed);
    setBalance(completed.balance);
    setPhase("RESULT");
    setCelebrating(false);
    SoundManager.play(completed.result === "WIN" ? "win" : "loss");
    if (nextState) setState(nextState);
    else void loadState().then(setState).catch(() => null);
    void wallet.refreshWallet();
  }, [loadState, wallet]);

  useEffect(() => {
    if (!activeFlight) return;
    let stopped = false;
    let frame = 0;
    let polling = false;
    const start = new Date(activeFlight.startedAt).getTime();
    const animate = () => {
      const elapsed = Math.max(0, sessionClock.current.now() - start);
      setFlightMultiplier((current) => Math.max(current, Math.min(100, Math.round(Math.exp(elapsed / 5500) * 100) / 100)));
      if (!stopped) frame = window.requestAnimationFrame(animate);
    };
    animate();
    const poll = window.setInterval(() => {
      if (polling || stopped) return;
      polling = true;
      void ServerResultService.state("flight-x").then((payload) => {
        sessionClock.current.sync(payload.serverNow);
        setState(payload);
        if (!payload.activeRound && payload.latestRound?.roundId === activeFlight.roundId) {
          stopped = true;
          void finishFlight(payload.latestRound, payload);
        }
      }).catch(() => null).finally(() => { polling = false; });
    }, 350);
    return () => { stopped = true; window.cancelAnimationFrame(frame); window.clearInterval(poll); };
  }, [activeFlight, finishFlight]);

  const totalStake = useMemo(() => [...bets.values()].reduce((sum, amount) => sum + amount, 0), [bets]);
  const possibleReturn = useMemo(() => {
    if (!totalStake) return "—";
    if (game.mode === "crash") return `${(totalStake * flightMultiplier).toLocaleString("en-PK", { maximumFractionDigits: 2 })} CR`;
    if (singleAction) return "UP TO 100×";
    const selected = game.options.filter((option) => bets.has(option.id));
    return selected.length === 1 ? selected[0].payout : `${selected.length} SELECTIONS`;
  }, [bets, flightMultiplier, game.mode, game.options, singleAction, totalStake]);

  const limits = state?.setting ?? { minStake: game.minStake, maxStake: game.maxStake, chipDenominations: [...game.chips] };
  const controlsDisabled = phase !== "BETTING" || busy;

  const chooseChip = (chip: number) => {
    setSelectedChip(chip);
    if (singleAction && phase === "BETTING") setBets(new Map([[defaultOption, chip]]));
    SoundManager.play("chip");
  };

  const selectOption = (option: PremiumBetOption) => {
    if (controlsDisabled) return;
    setError(null);
    setBets((current) => {
      const next = new Map(current);
      const existing = next.get(option.id) ?? 0;
      if (removing) {
        const amount = existing - selectedChip;
        if (amount > 0) next.set(option.id, amount); else next.delete(option.id);
      } else {
        const currentTotal = [...current.values()].reduce((sum, amount) => sum + amount, 0);
        if (currentTotal + selectedChip > limits.maxStake || currentTotal + selectedChip > balance) {
          setError(currentTotal + selectedChip > balance ? "Not enough credits for that chip." : `Maximum total stake is ${limits.maxStake.toLocaleString()} CR.`);
          return current;
        }
        next.set(option.id, existing + selectedChip);
      }
      SoundManager.play("chip");
      return next;
    });
  };

  const runRound = async (overrideBets?: ReadonlyMap<string, number>, launchBay?: number) => {
    if (busyRef.current || phase !== "BETTING") return;
    const roundBets = overrideBets ? new Map(overrideBets) : new Map(bets);
    const roundStake = [...roundBets.values()].reduce((sum, amount) => sum + amount, 0);
    if (!roundBets.size || roundStake < limits.minStake) {
      setError(`Place at least ${limits.minStake.toLocaleString()} CR before starting.`);
      return;
    }
    if (roundStake > balance) {
      setError("Your balance is lower than the selected stake.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setBets(roundBets);
    setLastBets(roundBets);
    if (gameId === "flight-x") setCashoutPending(false);
    if (launchBay !== undefined) setActiveFlightBay(launchBay);
    setRound(null);
    setPhase("CLOSED");
    if (gameId === "red-vs-black") {
      for (let toss = 0; toss < 3; toss += 1) {
        SoundManager.play("chip");
        await delay(230);
      }
      await delay(520);
    }
    playCinematicFor(gameId, game);
    try {
      for (let value = 5; value >= 1; value -= 1) {
        setCountdown(value);
        SoundManager.play("count");
        await delay(600);
      }
      setCountdown(0);
      const response = await ServerResultService.play(gameId, TransactionManager.requestId(gameId), TransactionManager.normalizeSelections(roundBets));
      if (response.round.status === "PLAYING") {
        const flight = response.round as ActiveFlightRound;
        sessionClock.current.sync(flight.serverNow);
        setActiveFlight(flight);
        setBalance(flight.balance);
        setFlightMultiplier(1);
        setPhase("ANIMATING");
        SoundManager.play(animationSound(gameId));
        return;
      }
      const completed = response.round as CompletedPremiumRound;
      setRound(completed);
      setBalance(completed.balance);
      setPhase("ANIMATING");
      SoundManager.play(animationSound(gameId));
      await delay(game.animationMs);
      setPhase("RESULT");
      setCelebrating(true);
      triggerGameCinematic({ kind: completed.result === "WIN" ? (completed.multiplier >= 8 ? "jackpot" : "win") : "loss", game: game.title.toUpperCase(), kicker: completed.result === "WIN" ? "ROUND WON" : "ROUND COMPLETE", center: completed.result === "WIN" ? `${completed.multiplier.toFixed(2)}× WIN` : "NEXT ROUND", accent: game.accent, accent2: game.accent2, icon: "trophy", durationMs: 2200 });
      SoundManager.play(completed.result === "WIN" ? "win" : "loss");
      void wallet.refreshWallet();
      const refreshed = await loadState().catch(() => null);
      if (refreshed) setState(refreshed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The round could not be completed.");
      setPhase("BETTING");
      if (gameId === "flight-x") setActiveFlightBay(null);
      void loadState().catch(() => null);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const cashOut = useCallback(async () => {
    if (!activeFlight || busyRef.current) return;
    const flight = activeFlight;
    busyRef.current = true;
    setBusy(true);
    setCashoutPending(true);
    setActiveFlight(null);
    setError(null);
    SoundManager.play("cashout");
    try {
      const response = await ServerResultService.cashout("flight-x", flight.roundId);
      finishFlight(response.round);
    } catch (caught) {
      setCashoutPending(false);
      const refreshed = await loadState().catch(() => null);
      if (refreshed?.latestRound?.roundId === flight.roundId) finishFlight(refreshed.latestRound, refreshed);
      else setError(caught instanceof Error ? caught.message : "Cash out could not be completed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [activeFlight, finishFlight, loadState]);

  useEffect(() => {
    if (!activeFlight || activeFlightBay === null) return;
    const bay = flightBays[activeFlightBay];
    if (bay?.autoEnabled && flightMultiplier >= bay.autoCashout && !busyRef.current) void cashOut();
  }, [activeFlight, activeFlightBay, cashOut, flightBays, flightMultiplier]);

  const continueRound = () => {
    setCelebrating(false);
    setRound(null);
    setPhase("BETTING");
    setCountdown(0);
    if (gameId === "flight-x") {
      setActiveFlightBay(null);
      setCashoutPending(false);
    }
    if (!singleAction) setBets(new Map());
  };

  useEffect(() => {
    if (gameId !== "flight-x" || phase !== "RESULT") return;
    const timer = window.setTimeout(() => {
      setRound(null);
      setPhase("BETTING");
      setCountdown(0);
      setActiveFlightBay(null);
      setCashoutPending(false);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [gameId, phase]);

  const launchFlightBay = (index: number) => {
    const bay = flightBays[index];
    if (!bay) return;
    const flightBet = new Map([[defaultOption, bay.amount]]);
    void runRound(flightBet, index);
  };

  const repeat = () => {
    const amount = [...lastBets.values()].reduce((sum, value) => sum + value, 0);
    if (!lastBets.size || amount > balance || amount > limits.maxStake) return;
    setBets(new Map(lastBets));
    SoundManager.play("chip");
  };

  const double = () => {
    const doubled = new Map([...bets].map(([id, amount]) => [id, amount * 2]));
    const amount = [...doubled.values()].reduce((sum, value) => sum + value, 0);
    if (amount <= balance && amount <= limits.maxStake) setBets(doubled);
    else setError(amount > balance ? "Not enough credits to double this bet." : `Maximum total stake is ${limits.maxStake.toLocaleString()} CR.`);
  };

  const reconnect = useCallback(() => { void loadState().catch(() => null); }, [loadState]);

  if (!ready) return <LoadingScreen game={game} progress={progress} />;
  if (loadError) return <main className="premium-login-gate"><section><AlertTriangle /><h1>GAME UNAVAILABLE</h1><p>{loadError}</p><button onClick={() => location.reload()}>TRY AGAIN</button><Link className="back" href="/games">Back to games</Link></section></main>;
  // A successful protected game-state response already proves the user is
  // authenticated, so do not keep the game behind the separate global wallet
  // request. We only need to wait for WalletProvider when state authorization
  // itself failed (the guest/sign-in path).
  if (!state) {
    if (wallet.loading) return <LoadingScreen game={game} progress={progress} />;
    if (wallet.user.role !== "USER") return <main className="premium-login-gate" style={{ backgroundImage: `linear-gradient(rgba(2,5,9,.46),rgba(2,5,9,.92)),url(${game.thumbnail})` }}><section><span style={{ color: game.accent }}>{game.icon}</span><small>{game.kicker}</small><h1>{game.title}</h1><p>Sign in to open a protected game session and use your existing Play Arena balance.</p><Link href={`/login?next=/play/${game.id}`}>SIGN IN TO PLAY</Link><Link className="back" href="/games">Back to games</Link></section></main>;
    return <main className="premium-login-gate"><section><AlertTriangle /><h1>GAME UNAVAILABLE</h1><p>The protected game session could not be opened.</p><button onClick={() => location.reload()}>TRY AGAIN</button><Link className="back" href="/games">Back to games</Link></section></main>;
  }

  const stageActive = phase === "ANIMATING";
  const resultRevealed = phase === "RESULT";
  const actionLabel = game.mode === "tumble" || game.mode === "reels" ? "SPIN" : game.mode === "crash" ? "LAUNCH FLIGHT" : "LOCK BETS & PLAY";

  if (gameId === "flight-x") return <GameErrorBoundary><ResponsiveGameLayout>
    <FlightXTable
      game={game}
      sessionId={state.sessionId}
      balance={balance}
      history={state.history ?? []}
      phase={phase}
      countdown={countdown}
      round={round}
      active={stageActive}
      multiplier={flightMultiplier}
      bays={flightBays}
      activeBay={activeFlightBay}
      chips={limits.chipDenominations}
      maxStake={limits.maxStake}
      busy={busy}
      cashoutPending={cashoutPending}
      muted={muted}
      onToggleMuted={() => setMuted(!muted)}
      onRules={() => setRulesOpen(true)}
      onHistory={() => setHistoryOpen(true)}
      onBaysChange={setFlightBays}
      onLaunch={launchFlightBay}
      onCashout={() => void cashOut()}
    />
    {error && <div className="premium-game-error"><AlertTriangle /><span>{error}</span><button onClick={() => setError(null)}>DISMISS</button></div>}
    {rulesOpen && <GameRulesModal game={game} close={() => setRulesOpen(false)} />}
    {historyOpen && <ResultHistory items={state.history ?? []} close={() => setHistoryOpen(false)} />}
    <ReconnectHandler onReconnect={reconnect} />
  </ResponsiveGameLayout></GameErrorBoundary>;

  if (gameId === "red-vs-black") return <GameErrorBoundary><ResponsiveGameLayout>
    <RedBlackTable
      game={game}
      artwork={state.setting.artwork || game.thumbnail}
      balance={balance}
      stake={totalStake}
      possibleReturn={possibleReturn}
      history={state.history ?? []}
      phase={phase}
      countdown={countdown}
      round={round}
      active={stageActive}
      revealed={resultRevealed}
      bets={bets}
      selectedChip={selectedChip}
      chips={limits.chipDenominations}
      disabled={controlsDisabled}
      busy={busy}
      minStake={limits.minStake}
      muted={muted}
      onToggleMuted={() => setMuted(!muted)}
      onRules={() => setRulesOpen(true)}
      onHistory={() => setHistoryOpen(true)}
      onSelect={selectOption}
      onChooseChip={chooseChip}
      onClear={() => setBets(new Map())}
      onRepeat={repeat}
      onDouble={double}
      onPlay={() => void runRound()}
    />
    {error && <div className="premium-game-error"><AlertTriangle /><span>{error}</span><button onClick={() => setError(null)}>DISMISS</button></div>}
    {celebrating && round && (round.result === "WIN" ? <WinAnimation round={round} skip={continueRound} /> : <LossAnimation round={round} skip={continueRound} />)}
    {rulesOpen && <GameRulesModal game={game} close={() => setRulesOpen(false)} />}
    {historyOpen && <ResultHistory items={state.history ?? []} close={() => setHistoryOpen(false)} />}
    <ReconnectHandler onReconnect={reconnect} />
  </ResponsiveGameLayout></GameErrorBoundary>;

  return <GameErrorBoundary><ResponsiveGameLayout><main className={`premium-game-shell game-${game.mode} phase-${phase.toLocaleLowerCase()}`} style={{ "--game-accent": game.accent, "--game-accent-2": game.accent2, "--game-art": `url(${state?.setting.artwork || game.thumbnail})` } as React.CSSProperties}>
    <div className="premium-game-art" />
    <GameCanvas accent={game.accent} accent2={game.accent2} active={stageActive} mode={game.mode} />
    <GameHeader game={game} balance={balance} stake={totalStake} possibleReturn={possibleReturn} muted={muted} setMuted={setMuted} openRules={() => setRulesOpen(true)} openSettings={() => setSettingsOpen(true)} openHistory={() => setHistoryOpen(true)} />
    <div className="premium-history-strip"><ResultHistory items={(state?.history ?? []).slice(0, 8)} inline /></div>
    <BettingTimer phase={phase} countdown={countdown} />
    <section className="premium-game-stage"><GameStage game={game} round={round} active={stageActive} revealed={resultRevealed} flightMultiplier={flightMultiplier} /></section>
    <BettingPanel simple={singleAction} disabled={controlsDisabled} hasBets={bets.size > 0} onClear={() => setBets(new Map())} onRepeat={repeat} onDouble={double} removing={removing} setRemoving={setRemoving}>
      {!singleAction && <div className={`premium-table-scroll table-${game.mode}`}><BettingArea options={game.options} bets={bets} winning={round?.winningOptions ?? []} disabled={controlsDisabled} onSelect={selectOption} compact={game.mode !== "roulette" && game.mode !== "dice"} /></div>}
      {singleAction && <div className="premium-simple-steps" aria-hidden="true"><span><b>1</b><WalletCards /> AMOUNT</span><i>›</i><span><b>2</b>{game.mode === "crash" ? <Plane /> : <Sparkles />} PLAY</span>{game.mode === "crash" && <><i>›</i><span><b>3</b><Coins /> CASH OUT</span></>}</div>}
      <div className={`premium-control-deck ${singleAction ? "simple" : ""}`}>
        <div className="premium-stake-picker"><small>{singleAction ? "1 · CHOOSE AMOUNT" : "CHIPS"}</small><ChipSelector chips={limits.chipDenominations} selected={selectedChip} setSelected={chooseChip} disabled={controlsDisabled} /></div>
        {activeFlight ? <button className="premium-cashout-button" disabled={busy} onClick={() => void cashOut()} aria-label={`Cash out ${Math.round(totalStake * flightMultiplier)} credits`}><Plane /><span><small>{busy ? "CASHING OUT…" : "TAP TO CASH OUT"}</small><b>{(totalStake * flightMultiplier).toLocaleString("en-PK", { maximumFractionDigits: 2 })} CR</b></span></button> : <button className="premium-play-button" disabled={controlsDisabled || totalStake < limits.minStake || totalStake > balance} onClick={() => void runRound()}><Sparkles /><span><small>{phase === "BETTING" ? actionLabel : phase === "CLOSED" ? `STARTING ${countdown || "…"}` : "ROUND IN MOTION"}</small><b>{totalStake ? `${totalStake.toLocaleString()} CR` : "CHOOSE AMOUNT"}</b></span></button>}
      </div>
    </BettingPanel>
    {error && <div className="premium-game-error"><AlertTriangle /><span>{error}</span><button onClick={() => setError(null)}>DISMISS</button></div>}
    {celebrating && round && (round.result === "WIN" ? <WinAnimation round={round} skip={continueRound} /> : <LossAnimation round={round} skip={continueRound} />)}
    {rulesOpen && <GameRulesModal game={game} close={() => setRulesOpen(false)} />}
    {settingsOpen && <SettingsPanel muted={muted} setMuted={setMuted} master={master} setMaster={setMaster} sfx={sfx} setSfx={setSfx} close={() => setSettingsOpen(false)} />}
    {historyOpen && <ResultHistory items={state?.history ?? []} close={() => setHistoryOpen(false)} />}
    <ReconnectHandler onReconnect={reconnect} />
    <div className="premium-audit-pill"><Coins /><span>SERVER-LOCKED ROUND</span><i>{state?.rngVersion ?? "RNG"}</i></div>
    {phase === "CLOSED" && countdown === 0 && busy && <div className="premium-securing"><Loader2 /><span>SECURING ROUND…</span></div>}
  </main></ResponsiveGameLayout></GameErrorBoundary>;
}

export const GameShellComponent = GameShell;
