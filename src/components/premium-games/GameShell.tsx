"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { GameSessionManager, PremiumGameRequestError, ServerResultService, TransactionManager, type ActiveFlightRound, type CompletedPremiumRound, type FlightBetResult, type PremiumGameState } from "@/lib/premium-games/client";
import { premiumGame, type PremiumBetOption, type PremiumGameId } from "@/lib/premium-games/definitions";
import { flightSnapshot } from "@/lib/premium-games/flightState";
import { committedCrashMultiplier } from "@/lib/premium-games/flightPresentation";
import { SoundManager, type GameSound } from "@/lib/premium-games/soundManager";
import { triggerGameCinematic } from "@/lib/gameCinematics";
import { createRedBlackDemoRound, updateRedBlackBet, type RedBlackLivePhase, type RedBlackSide } from "@/lib/premium-games/redBlackLive";

type RoundPhase = "BETTING" | "CLOSED" | "ANIMATING" | "RESULT" | RedBlackLivePhase;

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
  const refreshWallet = wallet.refreshWallet;
  const sessionClock = useRef(new GameSessionManager());
  const [state, setState] = useState<PremiumGameState | null>(null);
  const [balance, setBalance] = useState(0);
  const [progress, setProgress] = useState(4);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<RoundPhase>("BETTING");
  const [countdown, setCountdown] = useState(0);
  const [redBlackRevealStep, setRedBlackRevealStep] = useState(0);
  const [selectedChip, setSelectedChip] = useState<number>(game.chips[0]);
  const [bets, setBets] = useState<Map<string, number>>(new Map());
  const [lastBets, setLastBets] = useState<Map<string, number>>(new Map());
  const [removing, setRemoving] = useState(false);
  const [round, setRound] = useState<CompletedPremiumRound | null>(null);
  const [activeFlight, setActiveFlight] = useState<ActiveFlightRound | null>(null);
  const [flightMultiplier, setFlightMultiplier] = useState(1);
  const [flightBetResults, setFlightBetResults] = useState<FlightBetResult[]>([]);
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
  const flightLaunchBetsRef = useRef<Map<string, number>>(new Map());
  const finishedFlightRef = useRef<string | null>(null);
  const cashoutPendingRef = useRef<[boolean, boolean]>([false, false]);
  const betsRef = useRef<Map<string, number>>(new Map());
  const balanceRef = useRef(0);
  const premiumStateRef = useRef<PremiumGameState | null>(null);
  const redBlackLoopRef = useRef(0);
  const singleAction = game.mode === "tumble" || game.mode === "reels" || game.mode === "crash";
  const defaultOption = game.options[0].id;

  useEffect(() => { betsRef.current = bets; }, [bets]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { premiumStateRef.current = state; }, [state]);

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
      setFlightBetResults(payload.activeRound.bets);
      setBets(new Map(payload.activeRound.bets.map((bet) => [bet.id, bet.amount])));
      setFlightBays((current) => current.map((bay, index) => ({ ...bay, amount: payload.activeRound?.bets[index]?.amount ?? bay.amount })) as [FlightBetBay, FlightBetBay]);
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
    finishedFlightRef.current = completed.roundId;
    const completedBets = Array.isArray(completed.payload.bets) ? completed.payload.bets as FlightBetResult[] : [];
    setFlightBetResults(completedBets);
    cashoutPendingRef.current = [false, false];
    setActiveFlight(null);
    setFlightMultiplier(committedCrashMultiplier(completed.payload, completed.multiplier));
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
    let lastUiCommit = 0;
    const start = new Date(activeFlight.startedAt).getTime();
    const animate = (now: number) => {
      const elapsed = Math.max(0, sessionClock.current.now() - start);
      // Canvas/SVG motion interpolates on every animation frame. React only
      // receives a compact 20 Hz snapshot for payout text and auto-cashout,
      // avoiding a full component-tree render on every display frame.
      const nextMultiplier = flightSnapshot(elapsed, activeFlight.crashMultiplier).multiplier;
      if (now - lastUiCommit >= 50) {
        lastUiCommit = now;
        setFlightMultiplier((current) => Math.max(current, nextMultiplier));
      }
      if (!stopped) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    const poll = window.setInterval(() => {
      if (polling || stopped || cashoutPendingRef.current.some(Boolean)) return;
      polling = true;
      void ServerResultService.state("flight-x").then((payload) => {
        if (stopped || cashoutPendingRef.current.some(Boolean)) return;
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

  useEffect(() => {
    if (gameId !== "red-vs-black" || !ready) return;
    const token = ++redBlackLoopRef.current;
    const live = () => redBlackLoopRef.current === token;
    const pause = async (milliseconds: number) => {
      await delay(milliseconds);
      return live();
    };

    const runLiveTable = async () => {
      let firstVisibleRound = true;
      let sequence = 0;

      // If a refresh happened after the server accepted a wager, restore a
      // recent completed round instead of silently starting with a blank table.
      const recovered = premiumStateRef.current?.latestRound;
      const recoveredAt = recovered ? new Date(recovered.completedAt).getTime() : 0;
      if (recovered?.gameId === "red-vs-black" && Date.now() - recoveredAt < 15_000) {
        const recoveredSelection = recovered.selections.find((selection) => ["RED", "BLACK"].includes(selection.id));
        const recoveredBets = new Map(recoveredSelection ? [[recoveredSelection.id, recoveredSelection.amount]] : []);
        betsRef.current = recoveredBets;
        setBets(recoveredBets);
        setLastBets(recoveredBets);
        setRound(recovered);
        setRedBlackRevealStep(6);
        setPhase("RESULT");
        if (!await pause(2600)) return;
        firstVisibleRound = false;
      }

      while (live()) {
        if (!firstVisibleRound) {
          const cleared = new Map<string, number>();
          betsRef.current = cleared;
          setBets(cleared);
          setRound(null);
          setRedBlackRevealStep(0);
          setPhase("NEXT_ROUND");
          setCountdown(0);
          if (!await pause(520)) return;
          setPhase("COUNTDOWN");
          for (let value = 3; value >= 1; value -= 1) {
            setCountdown(value);
            SoundManager.play("count");
            if (!await pause(820)) return;
          }
        }

        setRound(null);
        setRedBlackRevealStep(0);
        setPhase("BETTING");
        SoundManager.play("betOpen");
        const bettingSeconds = firstVisibleRound ? 9 : 12;
        for (let value = bettingSeconds; value >= 1; value -= 1) {
          setCountdown(value);
          if (value <= 3) SoundManager.play("count");
          if (!await pause(1000)) return;
        }

        setCountdown(0);
        setPhase("BETTING_CLOSING");
        SoundManager.play("betClose");
        if (!await pause(1150)) return;

        const committedBets = new Map(betsRef.current);
        const committedStake = [...committedBets.values()].reduce((sum, amount) => sum + amount, 0);
        if (committedBets.size) setLastBets(committedBets);
        const liveState = premiumStateRef.current;
        const balanceBeforeRound = balanceRef.current;
        const isRealWager = !!liveState && committedBets.size === 1
          && ["RED", "BLACK"].includes([...committedBets.keys()][0])
          && committedStake >= liveState.setting.minStake
          && committedStake <= liveState.setting.maxStake
          && committedStake <= balanceRef.current;
        let completed: CompletedPremiumRound;

        if (isRealWager) {
          busyRef.current = true;
          setBusy(true);
          const reservedBalance = Math.max(0, Math.round((balanceBeforeRound - committedStake) * 100) / 100);
          balanceRef.current = reservedBalance;
          setBalance(reservedBalance);
          try {
            const response = await ServerResultService.play(
              "red-vs-black",
              TransactionManager.requestId("red-vs-black"),
              TransactionManager.normalizeSelections(committedBets),
            );
            completed = response.round as CompletedPremiumRound;
            balanceRef.current = completed.balance;
          } catch (caught) {
            balanceRef.current = balanceBeforeRound;
            setBalance(balanceBeforeRound);
            setError(caught instanceof Error ? `${caught.message} Your spectator table will keep running.` : "The wager was not accepted. Your spectator table will keep running.");
            completed = createRedBlackDemoRound({
              sequence,
              balance: balanceBeforeRound,
            });
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        } else {
          if (committedStake > 0) {
            setError("Bet not accepted. Choose one side with a stake within the table limits and your balance. No credits were deducted.");
            betsRef.current = new Map();
            setBets(new Map());
          }
          completed = createRedBlackDemoRound({
            sequence,
            balance: balanceRef.current,
          });
        }
        if (!live()) return;

        sequence += 1;
        setRound(completed);
        setPhase("DEALING");
        SoundManager.play("deal");
        if (!await pause(900)) return;

        setPhase("REVEALING");
        for (let step = 1; step <= 6; step += 1) {
          setRedBlackRevealStep(step);
          SoundManager.play("flip");
          if (!await pause(520)) return;
        }

        setPhase("RESULT");
        SoundManager.play("impact");
        if (!await pause(3400)) return;

        setPhase("PAYOUT");
        balanceRef.current = completed.balance;
        setBalance(completed.balance);
        SoundManager.play("payout");
        if (!await pause(1550)) return;

        if (isRealWager && completed.payload.demo !== true) {
          SoundManager.play(completed.result === "WIN" ? "win" : "loss");
          void refreshWallet();
          void loadState().catch(() => null);
        }

        setPhase("ROUND_END");
        if (!await pause(720)) return;
        firstVisibleRound = false;
      }
    };

    void runLiveTable();
    return () => {
      if (redBlackLoopRef.current === token) redBlackLoopRef.current += 1;
    };
  }, [gameId, loadState, ready, refreshWallet]);

  const chooseChip = (chip: number) => {
    setSelectedChip(chip);
    if (singleAction && phase === "BETTING") setBets(new Map([[defaultOption, chip]]));
    SoundManager.play("chip");
  };

  const selectOption = (option: PremiumBetOption) => {
    if (controlsDisabled) return;
    if (gameId === "red-vs-black" && !["RED", "BLACK"].includes(option.id)) return;
    setError(null);
    if (gameId === "red-vs-black") {
      if (!premiumStateRef.current || busyRef.current) return;
      const next = updateRedBlackBet(betsRef.current, option.id as RedBlackSide, selectedChip, removing);
      const amount = [...next.values()].reduce((sum, value) => sum + value, 0);
      if (amount > balanceRef.current || amount > limits.maxStake) {
        setError(amount > balanceRef.current ? "Not enough credits for that chip." : `Maximum total stake is ${limits.maxStake.toLocaleString()} CR.`);
        return;
      }
      betsRef.current = next;
      setBets(next);
      SoundManager.play("chip");
      return;
    }
    setBets((current) => {
      const existing = current.get(option.id) ?? 0;
      const next = new Map(current);
      if (removing) {
        const amount = existing - selectedChip;
        if (amount > 0) next.set(option.id, amount); else next.delete(option.id);
      } else {
        const currentTotal = [...current.values()].reduce((sum, amount) => sum + amount, 0);
        const nextTotal = currentTotal + selectedChip;
        if (nextTotal > limits.maxStake || nextTotal > balanceRef.current) {
          setError(nextTotal > balanceRef.current ? "Not enough credits for that chip." : `Maximum total stake is ${limits.maxStake.toLocaleString()} CR.`);
          return current;
        }
        next.set(option.id, existing + selectedChip);
      }
      betsRef.current = next;
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
        await delay(1000);
      }
      setCountdown(0);
      const submittedBets = gameId === "flight-x" ? new Map(flightLaunchBetsRef.current) : roundBets;
      const response = await ServerResultService.play(gameId, TransactionManager.requestId(gameId), TransactionManager.normalizeSelections(submittedBets));
      if (response.round.status === "PLAYING") {
        const flight = response.round as ActiveFlightRound;
        sessionClock.current.sync(flight.serverNow);
        setActiveFlight(flight);
        setFlightBetResults(flight.bets);
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

  const cashOut = useCallback(async (index: number) => {
    const betId: "FLIGHT_1" | "FLIGHT_2" = index === 0 ? "FLIGHT_1" : "FLIGHT_2";
    const currentBet = flightBetResults.find((bet) => bet.id === betId);
    if (!activeFlight || cashoutPendingRef.current[index] || currentBet?.state !== "active") return;
    const flight = activeFlight;
    if (flightSnapshot(sessionClock.current.now() - new Date(flight.startedAt).getTime(), flight.crashMultiplier).crashed) return;
    cashoutPendingRef.current[index] = true;
    
    // Instant 0ms synchronous lock on exact current multiplier at moment of click
    const lockedMultiplier = Math.max(1, flightMultiplier);
    const lockedPayout = Math.round(currentBet.amount * lockedMultiplier * 100) / 100;
    
    // Immediately mark user bet as cashed out with exact multiplier and payout
    balanceRef.current = Math.round((balanceRef.current + lockedPayout + Number.EPSILON) * 100) / 100;
    flushSync(() => {
      setFlightBetResults((items) => items.map((item) => item.id === betId ? { ...item, state: "cashed_out", cashOutMultiplier: lockedMultiplier, payout: lockedPayout } : item));
      setBalance(balanceRef.current);
      setError(null);
    });
    SoundManager.play("cashout");

    try {
      const response = await ServerResultService.cashout("flight-x", flight.roundId, betId, lockedMultiplier);
      if (finishedFlightRef.current === flight.roundId) return;
      if (response.round.status === "PLAYING") {
        const acceptedBet = response.round.bets.find((bet) => bet.id === betId);
        setActiveFlight(response.round);
        setFlightBetResults((items) => items.map((item) => item.id === betId ? acceptedBet ?? item : item));
        balanceRef.current = response.round.balance;
        setBalance(response.round.balance);
        void wallet.refreshWallet();
      } else {
        finishFlight(response.round);
      }
    } catch (caught) {
      const refreshed = await loadState().catch(() => null);
      if (refreshed?.activeRound?.roundId === flight.roundId) {
        setFlightBetResults(refreshed.activeRound.bets);
        balanceRef.current = refreshed.balance;
        setBalance(refreshed.balance);
      } else if (refreshed?.latestRound?.roundId === flight.roundId) finishFlight(refreshed.latestRound, refreshed);
      else setError(caught instanceof Error ? caught.message : "Cash out could not be completed.");
    } finally {
      cashoutPendingRef.current[index] = false;
    }
  }, [activeFlight, flightBetResults, flightMultiplier, finishFlight, loadState, wallet]);

  useEffect(() => {
    if (!activeFlight) return;
    flightBays.forEach((bay, index) => {
      const id = index === 0 ? "FLIGHT_1" : "FLIGHT_2";
      if (bay.autoEnabled && flightMultiplier >= bay.autoCashout && flightBetResults.find((bet) => bet.id === id)?.state === "active") void cashOut(index);
    });
  }, [activeFlight, cashOut, flightBetResults, flightBays, flightMultiplier]);

  const continueRound = () => {
    setCelebrating(false);
    setRound(null);
    setPhase("BETTING");
    setCountdown(0);
    if (gameId === "flight-x") {
      setActiveFlightBay(null);
      flightLaunchBetsRef.current = new Map();
      setFlightBetResults([]);
    }
    if (!singleAction) setBets(new Map());
  };

  useEffect(() => {
    if (gameId !== "flight-x" || phase !== "RESULT") return;
    let countdownTimer: number | undefined;
    const resultTimer = window.setTimeout(() => {
      let value = 5;
      setPhase("CLOSED");
      setCountdown(value);
      SoundManager.play("count");
      countdownTimer = window.setInterval(() => {
        value -= 1;
        if (value > 0) {
          setCountdown(value);
          SoundManager.play("count");
          return;
        }
        if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
        setRound(null);
        setPhase("BETTING");
        setCountdown(0);
        setActiveFlightBay(null);
        flightLaunchBetsRef.current = new Map();
        setFlightBetResults([]);
      }, 1000);
    }, 2200);
    return () => {
      window.clearTimeout(resultTimer);
      if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
    };
  }, [gameId, phase]);

  const launchFlightBay = (index: number) => {
    const bay = flightBays[index];
    if (!bay) return;
    const id = index === 0 ? "FLIGHT_1" : "FLIGHT_2";
    const next = new Map(flightLaunchBetsRef.current);
    next.set(id, bay.amount);
    const nextStake = [...next.values()].reduce((sum, amount) => sum + amount, 0);
    if (nextStake > balance || nextStake > limits.maxStake) {
      setError(nextStake > balance ? "Your balance is lower than the selected stakes." : `Maximum total stake is ${limits.maxStake.toLocaleString()} CR.`);
      return;
    }
    flightLaunchBetsRef.current = next;
    setFlightBetResults((items) => [...items.filter((item) => item.id !== id), { id, amount: bay.amount, state: "placed", cashOutMultiplier: null, payout: 0 }]);
    if (phase === "BETTING") void runRound(next, index);
  };

  const repeat = () => {
    const repeatBets = gameId === "red-vs-black"
      ? new Map([...lastBets].filter(([id]) => ["RED", "BLACK"].includes(id)).slice(0, 1))
      : new Map(lastBets);
    const amount = [...repeatBets.values()].reduce((sum, value) => sum + value, 0);
    const walletLimitApplies = gameId !== "red-vs-black" || premiumStateRef.current !== null;
    if (!repeatBets.size || (walletLimitApplies && amount > balanceRef.current) || amount > limits.maxStake) return;
    betsRef.current = repeatBets;
    setBets(repeatBets);
    SoundManager.play("chip");
  };

  const double = () => {
    const doubled = new Map([...bets].map(([id, amount]) => [id, amount * 2]));
    const amount = [...doubled.values()].reduce((sum, value) => sum + value, 0);
    if (amount <= balanceRef.current && amount <= limits.maxStake) {
      betsRef.current = doubled;
      setBets(doubled);
    }
    else setError(amount > balanceRef.current ? "Not enough credits to double this bet." : `Maximum total stake is ${limits.maxStake.toLocaleString()} CR.`);
  };

  const reconnect = useCallback(() => { void loadState().catch(() => null); }, [loadState]);

  const toggleSound = () => {
    const nextMuted = !muted;
    SoundManager.setSettings({ muted: nextMuted, master, sfx });
    setMuted(nextMuted);
    if (!nextMuted) SoundManager.play("betOpen");
  };

  const clearBets = () => {
    const cleared = new Map<string, number>();
    betsRef.current = cleared;
    setBets(cleared);
  };

  if (gameId === "red-vs-black") return <GameErrorBoundary><ResponsiveGameLayout>
    <RedBlackTable
      game={game}
      artwork={state?.setting.artwork || game.thumbnail}
      balance={balance}
      username={wallet.user.role === "USER" ? wallet.user.username : "GUEST PLAYER"}
      stake={totalStake}
      possibleReturn={possibleReturn}
      history={state?.history ?? []}
      phase={phase as RedBlackLivePhase}
      countdown={countdown}
      revealStep={redBlackRevealStep}
      round={round}
      bets={bets}
      selectedChip={selectedChip}
      chips={limits.chipDenominations}
      disabled={controlsDisabled || !ready || !state}
      busy={busy}
      minStake={limits.minStake}
      muted={muted}
      connectionLabel={!ready ? "CONNECTING TO TABLE" : !state ? (loadError || "SIGN IN TO PLACE A BET") : null}
      onToggleMuted={toggleSound}
      onRules={() => setRulesOpen(true)}
      onHistory={() => setHistoryOpen(true)}
      onSelect={selectOption}
      onChooseChip={chooseChip}
      onClear={clearBets}
      onRepeat={repeat}
      onDouble={double}
    />
    {error && <div className="premium-game-error"><AlertTriangle /><span>{error}</span><button onClick={() => setError(null)}>DISMISS</button></div>}
    {rulesOpen && <GameRulesModal game={game} close={() => setRulesOpen(false)} />}
    {historyOpen && <ResultHistory items={state?.history ?? []} close={() => setHistoryOpen(false)} />}
  </ResponsiveGameLayout></GameErrorBoundary>;

  if (!ready) return <LoadingScreen game={game} progress={progress} />;
  if (loadError) return <main className="premium-login-gate"><section><AlertTriangle /><h1>GAME UNAVAILABLE</h1><p>{loadError}</p><button onClick={() => location.reload()}>TRY AGAIN</button><Link className="back" href="/games">Back to games</Link></section></main>;
  // A successful protected game-state response already proves the user is
  // authenticated, so do not keep the game behind the separate global wallet
  // request. We only need to wait for WalletProvider when state authorization
  // itself failed (the guest/sign-in path).
  const effectiveState = state ?? (gameId === "flight-x" ? {
    gameId,
    sessionId: "demo-session",
    balance: wallet.user.role === "USER" ? balance : 10000,
    history: [],
    setting: { minStake: game.minStake, maxStake: game.maxStake, chipDenominations: [...game.chips] },
    activeRound: null,
    latestRound: null,
    serverNow: new Date().toISOString(),
    rngVersion: "v1-demo",
  } : null);

  if (!effectiveState) {
    if (wallet.loading) return <LoadingScreen game={game} progress={progress} />;
    if (wallet.user.role !== "USER") return <main className="premium-login-gate" style={{ backgroundImage: `linear-gradient(rgba(2,5,9,.46),rgba(2,5,9,.92)),url(${game.thumbnail})` }}><section><span style={{ color: game.accent }}>{game.icon}</span><small>{game.kicker}</small><h1>{game.title}</h1><p>Sign in to open a protected game session and use your existing Play Arena balance.</p><Link href={`/login?next=/play/${game.id}`}>SIGN IN TO PLAY</Link><Link className="back" href="/games">Back to games</Link></section></main>;
    return <main className="premium-login-gate"><section><AlertTriangle /><h1>GAME UNAVAILABLE</h1><p>The protected game session could not be opened.</p><button onClick={() => location.reload()}>TRY AGAIN</button><Link className="back" href="/games">Back to games</Link></section></main>;
  }

  const activeState = effectiveState;

  const stageActive = phase === "ANIMATING";
  const resultRevealed = phase === "RESULT";
  const actionLabel = game.mode === "tumble" || game.mode === "reels" ? "SPIN" : game.mode === "crash" ? "LAUNCH FLIGHT" : "LOCK BETS & PLAY";

  if (gameId === "flight-x") return <GameErrorBoundary><ResponsiveGameLayout scrollable>
    <FlightXTable
      game={game}
      sessionId={activeState.sessionId}
      balance={balance}
      history={activeState.history ?? []}
      phase={phase as "BETTING" | "CLOSED" | "ANIMATING" | "RESULT"}
      countdown={countdown}
      round={round}
      active={stageActive}
      committedCrash={activeFlight?.crashMultiplier}
      multiplier={flightMultiplier}
      bays={flightBays}
      activeBay={activeFlightBay}
      roundKey={activeFlight?.roundId ?? round?.roundId ?? activeState.sessionId}
      chips={limits.chipDenominations}
      maxStake={limits.maxStake}
      busy={busy}
      betResults={flightBetResults}
      muted={muted}
      onToggleMuted={() => setMuted(!muted)}
      onRules={() => setRulesOpen(true)}
      onHistory={() => setHistoryOpen(true)}
      onBaysChange={setFlightBays}
      onLaunch={launchFlightBay}
      onCashout={(index) => void cashOut(index)}
    />
    {error && <div className="premium-game-error"><AlertTriangle /><span>{error}</span><button onClick={() => setError(null)}>DISMISS</button></div>}
    {rulesOpen && <GameRulesModal game={game} close={() => setRulesOpen(false)} />}
    {historyOpen && <ResultHistory items={activeState.history ?? []} close={() => setHistoryOpen(false)} />}
    <ReconnectHandler onReconnect={reconnect} />
  </ResponsiveGameLayout></GameErrorBoundary>;

  return <GameErrorBoundary><ResponsiveGameLayout><main className={`premium-game-shell game-${game.mode} phase-${phase.toLocaleLowerCase()}`} style={{ "--game-accent": game.accent, "--game-accent-2": game.accent2, "--game-art": `url(${state?.setting.artwork || game.thumbnail})` } as React.CSSProperties}>
    <div className="premium-game-art" />
    <GameCanvas accent={game.accent} accent2={game.accent2} active={stageActive} mode={game.mode} />
    <GameHeader game={game} balance={balance} stake={totalStake} possibleReturn={possibleReturn} muted={muted} setMuted={setMuted} openRules={() => setRulesOpen(true)} openSettings={() => setSettingsOpen(true)} openHistory={() => setHistoryOpen(true)} />
    <div className="premium-history-strip"><ResultHistory items={(state?.history ?? []).slice(0, 8)} inline /></div>
    <BettingTimer phase={phase} countdown={countdown} />
    <section className="premium-game-stage"><GameStage game={game} round={round} active={stageActive} revealed={resultRevealed} flightMultiplier={flightMultiplier} /></section>
    <BettingPanel simple={singleAction} disabled={controlsDisabled} hasBets={bets.size > 0} onClear={clearBets} onRepeat={repeat} onDouble={double} removing={removing} setRemoving={setRemoving}>
      {!singleAction && <div className={`premium-table-scroll table-${game.mode}`}><BettingArea options={game.options} bets={bets} winning={round?.winningOptions ?? []} disabled={controlsDisabled} onSelect={selectOption} compact={game.mode !== "roulette" && game.mode !== "dice"} /></div>}
      {singleAction && <div className="premium-simple-steps" aria-hidden="true"><span><b>1</b><WalletCards /> AMOUNT</span><i>›</i><span><b>2</b>{game.mode === "crash" ? <Plane /> : <Sparkles />} PLAY</span>{game.mode === "crash" && <><i>›</i><span><b>3</b><Coins /> CASH OUT</span></>}</div>}
      <div className={`premium-control-deck ${singleAction ? "simple" : ""}`}>
        <div className="premium-stake-picker"><small>{singleAction ? "1 · CHOOSE AMOUNT" : "CHIPS"}</small><ChipSelector chips={limits.chipDenominations} selected={selectedChip} setSelected={chooseChip} disabled={controlsDisabled} /></div>
        {activeFlight ? <button className="premium-cashout-button" disabled={busy} onClick={() => void cashOut(0)} aria-label={`Cash out ${Math.round(totalStake * flightMultiplier)} credits`}><Plane /><span><small>TAP TO CASH OUT</small><b>{(totalStake * flightMultiplier).toLocaleString("en-PK", { maximumFractionDigits: 2 })} CR</b></span></button> : <button className="premium-play-button" disabled={controlsDisabled || totalStake < limits.minStake || totalStake > balance} onClick={() => void runRound()}><Sparkles /><span><small>{phase === "BETTING" ? actionLabel : phase === "CLOSED" ? `STARTING ${countdown || "…"}` : "ROUND IN MOTION"}</small><b>{totalStake ? `${totalStake.toLocaleString()} CR` : "CHOOSE AMOUNT"}</b></span></button>}
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
