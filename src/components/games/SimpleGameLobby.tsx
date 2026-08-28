"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, HelpCircle, Loader2, Play, Plus, WalletCards } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useWallet } from "@/context/WalletContext";
import { HapticManager } from "@/game-engine";
import { customerCopy, formatCredits } from "@/lib/customerCopy";

export interface SimpleTier {
  id: string;
  name: string;
  entry: number;
  reward: number;
}

interface SimpleGameLobbyProps {
  name: string;
  image: string;
  imageAlt: string;
  tiers: SimpleTier[];
  selectedId: string;
  onSelect: (id: string) => void;
  onPlay: () => void;
  howTo: string[];
  error?: string;
  busy?: boolean;
  fullscreen?: boolean;
  backHref?: string;
}

export function SimpleGameLobby({
  name,
  image,
  imageAlt,
  tiers,
  selectedId,
  onSelect,
  onPlay,
  howTo,
  error,
  busy = false,
  fullscreen = true,
  backHref = "/",
}: SimpleGameLobbyProps) {
  const wallet = useWallet();
  const [helpOpen, setHelpOpen] = useState(false);
  const selected = tiers.find((tier) => tier.id === selectedId) ?? tiers[0];
  const signedIn = wallet.user.role === "USER";
  const insufficient = signedIn && wallet.balance < selected.entry;
  const chooseTier = (id: string) => { HapticManager.pulse("tap"); onSelect(id); };
  const startGame = () => { HapticManager.pulse("success"); onPlay(); };

  return (
    <div className={fullscreen ? "game-screen fixed inset-0 z-[110] overflow-hidden bg-[#020509] text-white" : "mx-auto w-full max-w-6xl text-white"}>
      <div className={fullscreen ? "relative min-h-full w-full overflow-hidden bg-[#020509]" : "relative min-h-[650px] overflow-hidden rounded-[2rem] border border-cyan-100/10 bg-[#020509] shadow-[0_30px_100px_rgba(0,0,0,.62),0_0_0_1px_rgba(255,255,255,.025)]"}>
        <Image src={image} alt={imageAlt} fill priority unoptimized decoding="async" sizes={fullscreen ? "100vw" : "(max-width: 1024px) 100vw, 1024px"} className="object-cover object-center scale-[1.02]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_64%_28%,transparent_0_14%,rgba(2,5,9,.10)_39%,rgba(2,5,9,.76)_78%),linear-gradient(to_bottom,rgba(2,5,9,.18),rgba(2,5,9,.04)_28%,rgba(2,5,9,.92)_73%,#020509_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,5,9,.44),transparent_28%,transparent_72%,rgba(2,5,9,.38))]" />
        <div className="game-lobby-light absolute inset-0" aria-hidden="true" />
        <header className="absolute inset-x-0 top-0 z-20 flex min-h-[calc(62px+env(safe-area-inset-top))] items-center justify-between gap-3 bg-gradient-to-b from-black/75 to-transparent px-3 pt-[env(safe-area-inset-top)] sm:px-5">
          <Link href={backHref} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/14 bg-black/38 text-white backdrop-blur-xl active:scale-95" aria-label="Back to games"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1 text-center"><p className="text-[7px] font-black uppercase tracking-[.28em] text-amber-200/70">Play Arena</p><h1 className="truncate text-lg font-black uppercase italic tracking-tight text-white sm:text-xl">{name}</h1></div>
          <Link href="/wallet" className="min-w-[94px] rounded-xl border border-amber-200/18 bg-black/38 px-3 py-2 text-right backdrop-blur-xl" aria-label={`${customerCopy.balance}: ${signedIn ? formatCredits(wallet.balance) : "Log in"}`}>
            <span className="block text-[7px] font-black uppercase tracking-wider text-amber-200/55">{customerCopy.balance}</span>
            <span className="block truncate text-xs font-black tabular-nums text-white sm:text-sm">{signedIn ? formatCredits(wallet.balance) : "Log in"}</span>
          </Link>
        </header>

        <div className={`relative z-10 flex items-end px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-24 sm:px-5 sm:pb-5 ${fullscreen ? "min-h-[100dvh]" : "min-h-[620px]"}`}>
          <div className="relative mx-auto w-full max-w-[960px] overflow-hidden rounded-[1.6rem] border border-cyan-100/16 bg-[linear-gradient(145deg,rgba(5,9,16,.96),rgba(7,17,29,.94)_58%,rgba(12,31,43,.94))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_24px_90px_rgba(0,0,0,.7),0_0_40px_rgba(34,211,238,.07)] backdrop-blur-2xl sm:p-4">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-100/55 to-transparent" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-cyan-300/[.055] blur-3xl" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3 px-1">
              <div><p className="text-[8px] font-black uppercase tracking-[.2em] text-white/40">💰 Choose entry</p><p className="mt-1 text-[10px] font-bold text-amber-100/65">Tap once · play instantly</p></div>
              <button type="button" onClick={() => setHelpOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[.055] text-white/65" aria-label="How to play"><HelpCircle className="h-5 w-5" /></button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
            {tiers.map((tier) => {
              const active = tier.id === selected.id;
              return (
                <button key={tier.id} type="button" onClick={() => chooseTier(tier.id)} aria-pressed={active} className={`relative min-h-[72px] rounded-xl border px-2 py-2 text-center transition duration-200 active:scale-[.96] ${active ? "border-amber-200/70 bg-[radial-gradient(circle_at_50%_0%,rgba(255,239,184,.24),transparent_68%),linear-gradient(145deg,#a85d0d,#542706)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.30),0_0_28px_rgba(245,158,11,.20)]" : "border-slate-300/10 bg-[linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.025))] text-slate-200 hover:border-cyan-100/20 hover:bg-white/[.07]"}`}>
                  {active && <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5" />}
                  <span className="block text-base font-black tabular-nums sm:text-xl">{formatCredits(tier.entry)}</span>
                  <span className={`mt-0.5 block truncate text-[8px] font-black uppercase tracking-wider ${active ? "text-amber-100" : "text-white/35"}`}>{tier.name}</span>
                </button>
              );
            })}
          </div>

            <div className="mt-2 flex items-center justify-between rounded-xl border border-amber-100/10 bg-[linear-gradient(90deg,rgba(245,158,11,.06),rgba(0,0,0,.20),rgba(34,211,238,.04))] px-3 py-2 text-[9px]"><span className="font-bold uppercase tracking-wider text-white/42">🏆 Possible reward</span><b className="text-sm font-black text-amber-200 drop-shadow-[0_0_10px_rgba(251,191,36,.20)]">{formatCredits(selected.reward)}</b></div>
          {(error || insufficient) && <p role="alert" className="mt-2 rounded-xl border border-rose-200/18 bg-rose-950/62 p-2 text-center text-[10px] font-black text-rose-100">{insufficient ? customerCopy.notEnoughBalance : error}</p>}

          {insufficient ? (
            <Link href="/deposit" className="mt-2 flex min-h-14 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 px-5 text-base font-black text-amber-950 shadow-[0_0_26px_rgba(251,191,36,.22)]"><Plus className="h-5 w-5" />{customerCopy.deposit}</Link>
          ) : (
            <button type="button" onClick={startGame} disabled={busy} className="game-lobby-play mt-2 flex min-h-16 w-full items-center justify-center gap-2 rounded-xl border border-amber-100/70 bg-[linear-gradient(90deg,#f7c843,#ffe47b_48%,#f5b82e)] px-5 text-lg font-black text-[#211400] shadow-[inset_0_2px_0_rgba(255,255,255,.48),0_0_34px_rgba(245,158,11,.24)] transition hover:brightness-105 active:scale-[.975] disabled:opacity-50">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-current" />}
              {busy ? "Starting…" : signedIn ? customerCopy.playNow : "Log in to play"}
            </button>
          )}
            <p className="mt-2 flex items-center justify-center gap-1 text-center text-[7px] font-bold uppercase tracking-wider text-white/25"><WalletCards className="h-3 w-3" /> Virtual credits · server-confirmed result</p>
          </div>
        </div>
      </div>

      <BottomSheet isOpen={helpOpen} onClose={() => setHelpOpen(false)} title={`How to play ${name}`}>
        <ol className="space-y-3 p-5">
          {howTo.map((step, index) => <li key={step} className="flex items-center gap-3 rounded-xl bg-slate-100 p-4 text-sm font-bold text-slate-800"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-700 text-white">{["👆", "🎯", "🏆"][index] ?? index + 1}</span>{step}</li>)}
        </ol>
      </BottomSheet>
    </div>
  );
}
