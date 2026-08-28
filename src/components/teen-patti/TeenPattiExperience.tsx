"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Bot, Coins, Crown, Eye, EyeOff, Hand, Loader2, ShieldCheck,
  Sparkles, Trophy, TrendingUp, Volume2, VolumeX, X,
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { TEEN_PATTI_STAKES, type TeenPattiAction, type TeenPattiActionEvent } from "@/lib/teen-patti/engine";
import { isRedSuit, rankLabel, suitSymbol, type TeenPattiCard } from "@/lib/teen-patti/rules";
import { triggerGameCinematic } from "@/lib/gameCinematics";

type PublicCard = TeenPattiCard | null;

interface PublicPlayer {
  id: string;
  name: string;
  isHuman: boolean;
  seen: boolean;
  folded: boolean;
  contribution: number;
  lastAction: string;
  cards: PublicCard[];
  handName: string | null;
}

interface ResultHand {
  id: string;
  name: string;
  folded: boolean;
  cards: TeenPattiCard[];
  handName: string;
}

interface PublicRound {
  roundId: string;
  status: "PLAYING" | "COMPLETED";
  stake: number;
  pot: number;
  currentBet: number;
  playerPaid: number;
  balance: number;
  activePlayerId: string;
  actionCount: number;
  playerBetTurns: number;
  targetBetTurns: number;
  players: PublicPlayer[];
  controls: {
    canPack: boolean;
    canSeen: boolean;
    canChaal: boolean;
    canRaise: boolean;
    canShow: boolean;
    callAmount: number;
    raiseAmount: number;
    showAmount: number;
  };
  events: TeenPattiActionEvent[];
  result: null | {
    winner: { id: string; name: string; cards: TeenPattiCard[]; handName: string; reason: string };
    playerWon: boolean;
    payout: number;
    net: number;
    hands: ResultHand[];
  };
}

function formatCredits(value: number) {
  return `${Math.round(value).toLocaleString()} CR`;
}

function requestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function teenPattiRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/teen-patti", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { round?: PublicRound; error?: string };
  if (!response.ok || !payload.round) throw new Error(payload.error || "The table server could not complete that action.");
  return payload.round;
}

function PlayingCard({ card, index = 0, small = false, winning = false }: { card: PublicCard; index?: number; small?: boolean; winning?: boolean }) {
  const style = { "--deal-delay": `${index * 90}ms` } as React.CSSProperties;
  if (!card) {
    return (
      <span className={`tp-card tp-card-back ${small ? "tp-card-small" : ""}`} style={style} aria-label="Face-down card">
        <span className="tp-card-back-inner"><Crown aria-hidden="true" /></span>
      </span>
    );
  }
  const red = isRedSuit(card.suit);
  return (
    <span className={`tp-card tp-card-face ${small ? "tp-card-small" : ""} ${winning ? "tp-card-winning" : ""}`} style={style} aria-label={`${rankLabel(card.rank)} ${suitSymbol(card.suit)}`}>
      <span className={red ? "tp-card-red" : "tp-card-black"}><b>{rankLabel(card.rank)}</b><i>{suitSymbol(card.suit)}</i></span>
      <span className={`tp-card-suit ${red ? "tp-card-red" : "tp-card-black"}`}>{suitSymbol(card.suit)}</span>
      <span className={`${red ? "tp-card-red" : "tp-card-black"} rotate-180`}><b>{rankLabel(card.rank)}</b><i>{suitSymbol(card.suit)}</i></span>
    </span>
  );
}

function CardFan({ cards, small = false, winning = false }: { cards: PublicCard[]; small?: boolean; winning?: boolean }) {
  return <div className={`tp-card-fan ${small ? "tp-card-fan-small" : ""}`}>{cards.map((card, index) => <PlayingCard key={`${card?.rank ?? "x"}${card?.suit ?? "x"}-${index}`} card={card} index={index} small={small} winning={winning} />)}</div>;
}

function PlayerSeat({ player, position, active }: { player: PublicPlayer; position: number; active: boolean }) {
  return (
    <div className={`tp-seat tp-seat-${position} ${active ? "tp-seat-active" : ""} ${player.folded ? "tp-seat-folded" : ""}`}>
      <div className="tp-seat-cards"><CardFan cards={player.cards} small /></div>
      <div className="tp-avatar"><Bot className="h-4 w-4" /><span className="tp-turn-dot" /></div>
      <div className="min-w-0 text-center">
        <p className="truncate text-[10px] font-black tracking-wide text-white sm:text-xs">{player.name}</p>
        <p className="mt-0.5 text-[7px] font-bold uppercase tracking-widest text-amber-100/60">{player.folded ? "Packed" : player.lastAction}</p>
      </div>
    </div>
  );
}

function ControlButton({ label, detail, icon, tone, disabled, onClick }: {
  label: string;
  detail?: string;
  icon: React.ReactNode;
  tone: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`tp-control ${tone}`}>
      <span className="tp-control-icon">{icon}</span>
      <span className="tp-control-label">{label}</span>
      <span className="tp-control-detail">{detail || "\u00a0"}</span>
    </button>
  );
}

function StakesLobby({ stake, balance, busy, error, onStake, onStart }: {
  stake: number;
  balance: number;
  busy: boolean;
  error: string | null;
  onStake: (stake: number) => void;
  onStart: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-[#020807]/78 px-4 py-20 backdrop-blur-md">
      <div className="tp-lobby-card w-full max-w-md p-5 text-center sm:p-7">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-amber-200/30 bg-amber-300/10 text-amber-200 shadow-[0_0_30px_rgba(251,191,36,.12)]"><Crown className="h-7 w-7" /></div>
        <p className="mt-4 text-[9px] font-black uppercase tracking-[.34em] text-amber-300">Royal three card</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.05em] text-white sm:text-5xl">TEEN PATTI</h1>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-white/50">Pick a boot. Every deal, bet and payout is verified by the table server.</p>
        <div className="mt-5 grid grid-cols-4 gap-2" aria-label="Stake presets">
          {TEEN_PATTI_STAKES.map((value) => (
            <button key={value} type="button" onClick={() => onStake(value)} className={`min-h-14 rounded-xl border text-sm font-black transition active:scale-95 ${stake === value ? "border-amber-200/70 bg-amber-300 text-[#211504] shadow-[0_0_24px_rgba(251,191,36,.2)]" : "border-white/10 bg-white/[.05] text-white/70 hover:border-white/25"}`}>
              {value}<span className="block text-[7px] uppercase tracking-wider opacity-60">CR</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[.08] bg-black/25 px-4 py-3 text-left">
          <span><span className="block text-[7px] font-black uppercase tracking-widest text-white/35">Your balance</span><b className="mt-0.5 block text-sm text-white">{formatCredits(balance)}</b></span>
          <span className="text-right"><span className="block text-[7px] font-black uppercase tracking-widest text-white/35">Table</span><b className="mt-0.5 block text-sm text-amber-200">3 Expert AI</b></span>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-[.13em] text-emerald-200/75"><ShieldCheck className="h-3.5 w-3.5" /> Fresh opponents · naturally shuffled hands</div>
        {error && <p className="mt-3 rounded-lg border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-100" role="alert">{error}</p>}
        <button type="button" disabled={busy || balance < stake} onClick={onStart} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-amber-100/60 bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-500 px-5 text-sm font-black uppercase tracking-[.12em] text-[#231603] shadow-[0_0_35px_rgba(251,191,36,.22)] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-40">
          {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Dealing…</> : <><Sparkles className="h-5 w-5" /> Play {stake} CR</>}
        </button>
        {balance < stake && <p className="mt-2 text-[10px] font-bold text-rose-200">Not enough credits for this boot.</p>}
      </div>
    </div>
  );
}

function RoundResult({ round, onAgain }: { round: PublicRound; onAgain: () => void }) {
  const result = round.result;
  if (!result) return null;
  return (
    <div className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-[#010504]/84 px-3 py-16 backdrop-blur-md">
      <div className={`tp-result-card w-full max-w-2xl p-5 text-center sm:p-8 ${result.playerWon ? "tp-result-win" : ""}`}>
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl border ${result.playerWon ? "border-amber-200/40 bg-amber-300/15 text-amber-200" : "border-rose-200/25 bg-rose-300/10 text-rose-200"}`}>{result.playerWon ? <Trophy className="h-8 w-8" /> : <Crown className="h-8 w-8" />}</div>
        <p className="mt-4 text-[9px] font-black uppercase tracking-[.3em] text-amber-300">Round complete</p>
        <h2 className="mt-1 text-3xl font-black tracking-[-.04em] text-white sm:text-5xl">{result.playerWon ? "YOU TOOK THE POT" : `${result.winner.name} WINS`}</h2>
        <p className="mt-2 text-base font-black text-amber-200">{result.winner.handName}</p>
        <div className="mt-4 flex justify-center"><CardFan cards={result.winner.cards} winning /></div>
        <div className="mx-auto mt-4 flex w-fit gap-5 rounded-full border border-white/10 bg-black/25 px-5 py-2 text-xs font-black">
          <span className="text-white/50">Pot {formatCredits(round.pot)}</span>
          <span className={result.net >= 0 ? "text-emerald-300" : "text-rose-300"}>{result.net >= 0 ? "+" : "−"}{formatCredits(Math.abs(result.net))}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {result.hands.map((hand) => (
            <div key={hand.id} className={`rounded-xl border p-2 ${hand.id === result.winner.id ? "border-amber-300/45 bg-amber-300/[.08]" : "border-white/[.08] bg-white/[.025]"}`}>
              <div className="flex justify-center"><CardFan cards={hand.cards} small winning={hand.id === result.winner.id} /></div>
              <p className="mt-2 truncate text-[9px] font-black text-white">{hand.name}</p>
              <p className="mt-0.5 truncate text-[7px] font-bold uppercase tracking-wide text-white/40">{hand.handName}{hand.folded ? " · packed" : ""}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onAgain} className="min-h-13 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 px-5 text-sm font-black uppercase tracking-wider text-[#251704]">Play again</button>
          <Link href="/" className="inline-flex min-h-13 items-center justify-center rounded-xl border border-white/15 bg-white/[.04] px-5 text-xs font-black uppercase tracking-wider text-white/70">Game lobby</Link>
        </div>
      </div>
    </div>
  );
}

function holdFor(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function TeenPattiExperience() {
  const router = useRouter();
  const wallet = useWallet();
  const [round, setRound] = useState<PublicRound | null>(null);
  const [stake, setStake] = useState<number>(50);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stateAuthorized, setStateAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animatedActor, setAnimatedActor] = useState<string | null>(null);
  const busyRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);

  const tone = useCallback((kind: "card" | "chip" | "win" | "lose") => {
    if (!soundOn || typeof window === "undefined") return;
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const context = audioRef.current ?? new AudioCtor();
      audioRef.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const frequencies = { card: 330, chip: 520, win: 760, lose: 180 };
      oscillator.frequency.value = frequencies[kind];
      oscillator.type = kind === "chip" ? "sine" : "triangle";
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (kind === "win" ? 0.34 : 0.12));
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + (kind === "win" ? 0.36 : 0.14));
    } catch { /* Audio is an optional enhancement. */ }
  }, [soundOn]);

  useEffect(() => {
    // Load table state immediately instead of waiting for the separate wallet
    // request. Both protected requests can run in parallel.
    let cancelled = false;
    void fetch("/api/teen-patti", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { round?: PublicRound | null; balance?: number; error?: string };
        if (!response.ok) throw new Error(payload.error || "The table could not be loaded.");
        if (!cancelled) {
          setStateAuthorized(true);
          setRound(payload.round ?? null);
          setBalance(Number(payload.balance ?? payload.round?.balance ?? 0));
        }
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "The table could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!round?.events.length) return;
    const timers = round.events.map((event, index) => window.setTimeout(() => {
      setAnimatedActor(event.actorId);
      tone(event.amount > 0 ? "chip" : "card");
    }, index * 260));
    timers.push(window.setTimeout(() => setAnimatedActor(null), round.events.length * 260 + 420));
    return () => timers.forEach(window.clearTimeout);
  }, [round?.roundId, round?.actionCount, round?.events, tone]);

  useEffect(() => {
    if (!round?.result) return;
    tone(round.result.playerWon ? "win" : "lose");
    triggerGameCinematic({ kind: round.result.playerWon ? "win" : "loss", game: "TEEN PATTI", kicker: "SHOW COMPLETE", center: round.result.playerWon ? "POT WON" : `${round.result.winner.name.toUpperCase()} WINS`, accent: "#fbbf24", accent2: "#fb7185", icon: "crown", durationMs: 2200 });
  }, [round?.result, tone]);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    triggerGameCinematic({ kind: "versus", game: "TEEN PATTI", kicker: "ROYAL TABLE", left: "YOU", leftMeta: `${stake} CR BOOT`, right: "3 RIVALS", rightMeta: "CARDS READY", accent: "#fbbf24", accent2: "#fb7185", icon: "crown", durationMs: 3200 });
    tone("card");
    try {
      const [next] = await Promise.all([
        teenPattiRequest({ action: "START", stake, requestId: requestKey() }),
        holdFor(3_000),
      ]);
      setDealing(true);
      setRound(next);
      setBalance(next.balance);
      await wallet.refreshWallet();
      window.setTimeout(() => setDealing(false), 900);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The round could not start.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [stake, tone, wallet]);

  const act = useCallback(async (action: TeenPattiAction) => {
    if (!round || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    tone(action === "SEEN" ? "card" : "chip");
    try {
      const next = await teenPattiRequest({ action, roundId: round.roundId, requestId: requestKey() });
      setRound(next);
      setBalance(next.balance);
      await wallet.refreshWallet();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action could not be completed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [round, tone, wallet]);

  const human = round?.players.find((player) => player.isHuman);
  const aiPlayers = useMemo(() => round?.players.filter((player) => !player.isHuman) ?? [], [round]);
  const activeCount = round?.players.filter((player) => !player.folded).length ?? 0;
  const tableActive = animatedActor ?? round?.activePlayerId;

  if (loading || (!stateAuthorized && wallet.loading)) {
    return <div className="game-screen grid place-items-center bg-[#020706] text-amber-200"><div className="text-center"><Loader2 className="mx-auto h-9 w-9 animate-spin" /><p className="mt-3 text-[9px] font-black uppercase tracking-[.3em]">Opening royal table</p></div></div>;
  }

  if (!stateAuthorized && wallet.user.role !== "USER") {
    return (
      <div className="game-screen relative grid place-items-center overflow-hidden bg-[#020706] px-4 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(4,120,87,.25),transparent_48%),linear-gradient(#06140f,#010403)]" />
        <div className="relative w-full max-w-sm rounded-3xl border border-amber-200/20 bg-black/45 p-7 text-center backdrop-blur-xl"><Crown className="mx-auto h-10 w-10 text-amber-300" /><h1 className="mt-4 text-3xl font-black">TEEN PATTI</h1><p className="mt-2 text-sm leading-6 text-white/50">Log in to use your server-protected Play Arena balance and preserve every round.</p><Link href="/login?next=/play/teen-patti" className="mt-6 inline-flex min-h-13 w-full items-center justify-center rounded-xl bg-amber-300 px-5 font-black text-[#251704]">Log in to play</Link><Link href="/" className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-white/55">Back to games</Link></div>
      </div>
    );
  }

  return (
    <div className={`tp-screen game-screen ${dealing ? "tp-is-dealing" : ""}`}>
      <div className="tp-ambient" />
      <header className="tp-header">
        <button type="button" onClick={() => router.push("/")} className="tp-header-button" aria-label="Back to games"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 text-center"><p className="truncate text-base font-black tracking-[-.03em] text-white sm:text-lg"><span className="mr-1.5 text-amber-300">♠</span>Teen Patti</p><p className="text-[7px] font-black uppercase tracking-[.18em] text-amber-200/45">Royal table</p></div>
        <div className="flex items-center gap-1.5"><button type="button" onClick={() => setSoundOn((value) => !value)} className="tp-header-button" aria-label={soundOn ? "Mute sounds" : "Enable sounds"}>{soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button><div className="tp-balance"><span>Balance</span><b>{formatCredits(balance)}</b></div></div>
      </header>

      <main className="tp-stage" aria-live="polite">
        <div className="tp-table-shadow" />
        <div className="tp-table">
          <div className="tp-table-inlay" />
          <div className="tp-table-mark"><Crown /><span>PLAY ARENA</span></div>
          {aiPlayers.map((player, index) => <PlayerSeat key={player.id} player={player} position={index + 1} active={tableActive === player.id} />)}

          {round && (
            <div className="tp-pot">
              <span className="tp-chip-stack" aria-hidden="true"><i /><i /><i /></span>
              <span><small>Pot</small><b>{formatCredits(round.pot)}</b></span>
              <em>Bet {formatCredits(round.currentBet)}</em>
            </div>
          )}

          {round && human && (
            <div className={`tp-human ${tableActive === human.id ? "tp-human-active" : ""}`}>
              <div className="tp-human-label"><span className="tp-you-avatar"><Hand className="h-4 w-4" /></span><span><b>YOU</b><small>{human.folded ? "Packed" : human.seen ? human.handName || "Seen" : "Blind"}</small></span>{tableActive === human.id && round.status === "PLAYING" && <em>Your turn</em>}</div>
              <button type="button" disabled={!round.controls.canSeen || busy} onClick={() => void act("SEEN")} className="tp-human-cards" aria-label={human.seen ? "Your Teen Patti cards" : "See your Teen Patti cards"}><CardFan cards={human.cards} /></button>
            </div>
          )}

          {animatedActor && round?.events.at(-1)?.amount ? <span className="tp-flying-chip"><Coins className="h-5 w-5" /></span> : null}
        </div>
      </main>

      {!round && <StakesLobby stake={stake} balance={balance} busy={busy} error={error} onStake={setStake} onStart={() => void start()} />}

      {round?.status === "PLAYING" && (
        <div className="tp-controls-wrap">
          <div className="tp-turn-strip"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />{busy ? "Table verifying…" : tableActive === "PLAYER" ? `Bet ${Math.min(round.playerBetTurns + 1, round.targetBetTurns)} of ${round.targetBetTurns} · your turn` : `${round.players.find((player) => player.id === tableActive)?.name ?? "Dealer"} is playing`}</div>
          <div className="tp-controls">
            <ControlButton label="PACK" icon={<X />} tone="tp-control-pack" disabled={busy || !round.controls.canPack} onClick={() => void act("PACK")} />
            <ControlButton label={human?.seen ? "SEEN" : "SEE"} detail={human?.seen ? "Cards open" : "Free"} icon={human?.seen ? <Eye /> : <EyeOff />} tone="tp-control-see" disabled={busy || !round.controls.canSeen} onClick={() => void act("SEEN")} />
            <ControlButton label="CHAAL" detail={balance < round.controls.callAmount ? "Low balance" : formatCredits(round.controls.callAmount)} icon={<Coins />} tone="tp-control-chaal" disabled={busy || !round.controls.canChaal || balance < round.controls.callAmount} onClick={() => void act("CHAAL")} />
            <ControlButton label="RAISE" detail={balance < round.controls.raiseAmount ? "Low balance" : formatCredits(round.controls.raiseAmount)} icon={<TrendingUp />} tone="tp-control-raise" disabled={busy || !round.controls.canRaise || balance < round.controls.raiseAmount} onClick={() => void act("RAISE")} />
            <ControlButton label="SHOW" detail={!human?.seen && activeCount === 2 ? "See first" : !round.controls.canShow ? "2 left" : balance < round.controls.showAmount ? "Low balance" : formatCredits(round.controls.showAmount)} icon={<Trophy />} tone="tp-control-show" disabled={busy || !round.controls.canShow || balance < round.controls.showAmount} onClick={() => void act("SHOW")} />
          </div>
        </div>
      )}

      {round?.status === "COMPLETED" && <RoundResult round={round} onAgain={() => { setRound(null); setError(null); }} />}
      {error && round && <div className="tp-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}
      {busy && round && <div className="pointer-events-none absolute inset-0 z-20 cursor-wait" />}
    </div>
  );
}
