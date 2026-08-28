import Link from "next/link";
import { ArrowRight, Bot, CircleDot, Crosshair, Sparkles, Zap } from "lucide-react";

export function EightBallFeature({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`relative overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-[#030711] shadow-[0_35px_100px_rgba(0,0,0,.5)] ${compact ? "min-h-[410px]" : "min-h-[610px]"}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_27%,rgba(34,211,238,.2),transparent_18%),radial-gradient(circle_at_82%_58%,rgba(139,92,246,.2),transparent_24%),linear-gradient(115deg,#030711,#071326_58%,#02040a)]" />
      <div className="absolute right-[4%] top-[14%] h-[70%] w-[48%] origin-center rotate-[-7deg] rounded-[2rem] border-[14px] border-[#24160f] bg-[#075c4d] shadow-[0_30px_90px_rgba(0,0,0,.7),inset_0_0_40px_rgba(0,0,0,.35)] [transform:perspective(900px)_rotateX(54deg)_rotateZ(-7deg)]">
        {[[48,23,"#f8fafc"],[58,45,"#f4c430"],[68,50,"#2563eb"],[78,56,"#080808"],[72,38,"#dc2626"],[61,62,"#7c3aed"],[84,68,"#f97316"]].map(([left,top,color], index) => <span key={index} className="absolute h-7 w-7 rounded-full border border-white/30 shadow-[0_4px_10px_rgba(0,0,0,.55)]" style={{ left: `${left}%`, top: `${top}%`, backgroundColor: color as string }} />)}
        {["-left-3 -top-3","-right-3 -top-3","-left-3 -bottom-3","-right-3 -bottom-3","-left-4 top-1/2","-right-4 top-1/2"].map((position) => <span key={position} className={`absolute h-8 w-8 rounded-full bg-black ${position}`} />)}
        <span className="absolute bottom-[18%] left-[18%] h-1 w-[58%] origin-left rotate-[-18deg] bg-gradient-to-r from-white/90 to-transparent shadow-[0_0_12px_rgba(255,255,255,.4)]" />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,5,12,.98)_0%,rgba(2,5,12,.9)_36%,rgba(2,5,12,.3)_68%,rgba(2,5,12,.05))]" />
      <div className={`relative z-10 flex max-w-3xl flex-col justify-center px-6 py-12 sm:px-11 lg:px-16 ${compact ? "min-h-[410px]" : "min-h-[610px]"}`}>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.22em] text-cyan-100"><CircleDot className="h-3.5 w-3.5 text-cyan-300" /> Premium 2D pool</div>
        <p className="mt-6 text-[9px] font-black uppercase tracking-[.46em] text-violet-300">The table is yours</p>
        <h2 className={`mt-2 font-black italic leading-[.75] tracking-[-.08em] text-white ${compact ? "text-5xl sm:text-7xl" : "text-[clamp(4rem,9vw,8.3rem)]"}`}>8 BALL<br /><span className="bg-gradient-to-r from-cyan-200 to-violet-300 bg-clip-text text-transparent">CASH ARENA</span></h2>
        <p className="mt-6 max-w-lg text-sm leading-6 text-white/58">Real aim, power, spin, banks and ball-in-hand placement on a polished top-down 2D table. Start instantly against a very hard CPU rival with a fresh fictional name.</p>
        <div className="mt-5 flex flex-wrap gap-3 text-[8px] font-black uppercase tracking-[.14em] text-white/42"><span className="flex items-center gap-1.5"><Crosshair className="h-3.5 w-3.5 text-cyan-300" /> Precision physics</span><span className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-violet-300" /> Expert CPU</span><span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-300" /> Instant racks</span><span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-cyan-300" /> Premium hall</span></div>
        <Link href="/play/eight-ball" className="mt-7 inline-flex w-fit items-center gap-2 rounded-xl border border-cyan-100/60 bg-gradient-to-r from-cyan-300 to-blue-500 px-7 py-4 text-[10px] font-black uppercase tracking-[.15em] text-[#02121a] shadow-[0_0_35px_rgba(34,211,238,.24)]">Play 8 Ball now <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </section>
  );
}
