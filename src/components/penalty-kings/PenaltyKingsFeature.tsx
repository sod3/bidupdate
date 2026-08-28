import Link from "next/link";
import { ArrowRight, Bot, ShieldCheck, Sparkles, Target } from "lucide-react";

export function PenaltyKingsFeature() {
  return (
    <section className="relative min-h-[620px] overflow-hidden rounded-[2rem] border border-emerald-200/15 bg-[#020906] shadow-[0_40px_110px_rgba(0,0,0,.55)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_30%,rgba(74,222,128,.25),transparent_17%),linear-gradient(115deg,#03100a_0%,#04160f_43%,#020706_100%)]" />
      <div className="absolute inset-x-0 top-[17%] h-[36%] border-y border-white/[.07] bg-[repeating-linear-gradient(96deg,rgba(255,255,255,.07)_0_2px,transparent_2px_14px),linear-gradient(#15231f,#07100c)] opacity-75" />
      <div className="absolute left-[8%] right-[8%] top-[9%] flex justify-between">{[0, 1, 2, 3].map((item) => <span key={item} className="h-2.5 w-20 rounded-full bg-white shadow-[0_0_15px_4px_rgba(225,248,255,.85),0_0_80px_28px_rgba(170,221,255,.18)] sm:w-28" />)}</div>
      <div className="absolute inset-x-[-12%] bottom-[-30%] h-[72%] origin-bottom [transform:perspective(560px)_rotateX(62deg)] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.02)_0_70px,rgba(25,107,53,.12)_70px_140px),linear-gradient(#1f7b3f,#0a3e21)]" />
      <div className="absolute bottom-[15%] right-[11%] h-[30%] w-[38%] border-[5px] border-b-0 border-white/70 opacity-80 shadow-[0_0_30px_rgba(255,255,255,.1)]"><div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_14px,rgba(255,255,255,.15)_14px_15px),repeating-linear-gradient(90deg,transparent_0_18px,rgba(255,255,255,.15)_18px_19px)]" /><span className="absolute bottom-[-20px] left-1/2 h-10 w-10 -translate-x-1/2 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,.4)]" /></div>
      <div className="absolute bottom-[15%] right-[25%] h-24 w-10 rounded-t-full bg-rose-500 shadow-[0_8px_35px_rgba(244,63,94,.35)] after:absolute after:left-1/2 after:top-[-24px] after:h-8 after:w-8 after:-translate-x-1/2 after:rounded-full after:bg-[#8f4d2f]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(1,7,4,.98)_0%,rgba(1,7,4,.88)_34%,rgba(1,7,4,.24)_67%,rgba(1,7,4,.04)_100%)]" />

      <div className="relative z-10 flex min-h-[620px] max-w-3xl flex-col justify-center px-6 py-14 sm:px-11 lg:px-16">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200/20 bg-amber-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.22em] text-amber-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_9px_#4ade80]" /> New flagship game</div>
        <p className="mt-6 text-[10px] font-black uppercase tracking-[.48em] text-emerald-300">The pressure is real</p>
        <h1 className="mt-2 text-[clamp(4.2rem,10vw,8.8rem)] font-black italic leading-[.72] tracking-[-.085em] text-white">PENALTY<br /><span className="bg-gradient-to-b from-white to-emerald-300 bg-clip-text text-transparent">KINGS</span></h1>
        <p className="mt-7 max-w-lg text-lg font-black italic uppercase tracking-[.06em] text-white">Aim. Dive. Become king.</p>
        <p className="mt-3 max-w-lg text-sm leading-6 text-white/55">A cinematic single-player football shootout against a very hard CPU rival with a rotating fictional name, where every swipe, top-corner strike and split-second dive is controlled by you.</p>
        <div className="mt-6 flex flex-wrap gap-3 text-[8px] font-black uppercase tracking-[.15em] text-white/45"><span className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-emerald-300" /> Expert CPU</span><span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-emerald-300" /> Skill controls</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Very hard difficulty</span><span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-amber-300" /> Premium 2D replays</span></div>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/play/penalty-kings" className="group inline-flex items-center gap-2 rounded-xl border border-emerald-200/50 bg-gradient-to-r from-emerald-500 to-lime-400 px-7 py-4 text-[11px] font-black uppercase tracking-[.15em] text-[#02150b] shadow-[0_0_35px_rgba(74,222,128,.26)] transition hover:-translate-y-0.5">⚽ Enter Champions Arena <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link><Link href="/leaderboard" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/35 px-6 py-4 text-[9px] font-black uppercase tracking-[.15em] text-white/70 backdrop-blur hover:border-white/30">View rankings</Link></div>
      </div>
      <div className="absolute bottom-4 right-5 z-10 hidden rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-right backdrop-blur sm:block"><p className="text-[7px] font-black uppercase tracking-[.2em] text-white/35">Featured stadium</p><p className="mt-1 text-xs font-black text-emerald-200">CHAMPIONS ARENA · NIGHT</p></div>
    </section>
  );
}
