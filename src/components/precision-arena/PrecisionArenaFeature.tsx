import Link from "next/link";
import { ArrowRight, Bot, Crosshair, Feather, Sparkles, Wind, Zap } from "lucide-react";

export function PrecisionArenaFeature({ compact = false }: { compact?: boolean }) {
  return <section className={`relative overflow-hidden rounded-[2rem] border border-cyan-100/15 bg-[#06191d] shadow-[0_35px_100px_rgba(0,0,0,.5)] ${compact ? "min-h-[430px]" : "min-h-[620px]"}`}>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_79%_20%,rgba(255,224,138,.54),transparent_10%),linear-gradient(180deg,#6fb8cb_0%,#aed7d1_47%,#315c4c_48%,#0c2421_100%)]" />
    <div className="absolute inset-x-0 bottom-[25%] h-[34%] bg-[linear-gradient(150deg,transparent_0_22%,#6d8f8c_23%_35%,transparent_36%),linear-gradient(205deg,transparent_0_25%,#335f59_26%_44%,transparent_45%)] opacity-90" />
    <div className="absolute inset-x-0 bottom-0 h-[35%] bg-[linear-gradient(172deg,transparent_0_13%,#275646_14%_37%,#102d27_38%)]" />
    {Array.from({ length: 10 }, (_, index) => <span key={index} className="absolute bottom-[26%] h-24 w-3 bg-[#17362d] before:absolute before:-left-6 before:-top-9 before:h-16 before:w-16 before:rounded-full before:bg-[#326f56]" style={{ left: `${51 + index * 5}%`, transform: `scale(${.65 + index % 3 * .16})` }} />)}
    <div className="absolute bottom-[25%] right-[13%] h-44 w-2 bg-[#50392a] before:absolute before:-left-[68px] before:-top-2 before:h-36 before:w-36 before:rounded-full before:border-[14px] before:border-[#33241e] before:bg-[radial-gradient(circle,#ffe46b_0_9%,#ef4059_10%_27%,#f2ead7_28%_46%,#3185c4_47%_67%,#f2ead7_68%)]" />
    <div className="absolute bottom-[27%] right-[56%] h-1 w-[39%] origin-left -rotate-[8deg] bg-gradient-to-r from-white via-cyan-100 to-transparent shadow-[0_0_14px_rgba(207,250,254,.85)]" />
    <div className="absolute bottom-[34%] right-[21%] h-3 w-16 -rotate-[8deg] rounded-full bg-amber-100 shadow-[0_0_16px_rgba(255,255,255,.85)]" />
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,15,18,.98)_0%,rgba(3,15,18,.9)_40%,rgba(3,15,18,.23)_72%,rgba(3,15,18,.05))]" />
    <div className={`relative z-10 flex max-w-3xl flex-col justify-center px-6 py-12 sm:px-11 lg:px-16 ${compact ? "min-h-[430px]" : "min-h-[620px]"}`}>
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-100/20 bg-cyan-100/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.22em] text-cyan-50"><Feather className="h-3.5 w-3.5 text-amber-200" /> Premium 2D archery duel</div>
      <p className="mt-6 text-[9px] font-black uppercase tracking-[.46em] text-amber-200">Every arrow is yours</p>
      <h2 className={`mt-2 font-black italic leading-[.75] tracking-[-.08em] text-white ${compact ? "text-5xl sm:text-7xl" : "text-[clamp(4rem,9vw,8.5rem)]"}`}>PRECISION<br /><span className="bg-gradient-to-r from-cyan-100 via-emerald-200 to-amber-200 bg-clip-text text-transparent">ARENA</span></h2>
      <p className="mt-6 max-w-lg text-sm leading-6 text-white/62">Drag, aim, judge wind and moving targets, then release a physics-driven arrow against an instant expert CPU rival.</p>
      <div className="mt-5 flex flex-wrap gap-3 text-[8px] font-black uppercase tracking-[.14em] text-white/45"><span className="flex items-center gap-1.5"><Crosshair className="h-3.5 w-3.5 text-cyan-200" /> Skill-based release</span><span className="flex items-center gap-1.5"><Wind className="h-3.5 w-3.5 text-violet-200" /> Wind & distance</span><span className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-rose-200" /> Expert CPU</span><span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-amber-200" /> Cinematic arrows</span></div>
      <Link href="/play/precision-arena" className="mt-7 inline-flex w-fit items-center gap-2 rounded-xl border border-cyan-50/60 bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200 px-7 py-4 text-[10px] font-black uppercase tracking-[.15em] text-[#041618] shadow-[0_0_35px_rgba(103,232,249,.22)]">Play Precision Arena <Zap className="h-4 w-4" /><ArrowRight className="h-4 w-4" /></Link>
    </div>
  </section>;
}
