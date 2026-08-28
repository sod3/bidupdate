import Link from "next/link";
import { ArrowRight, Bomb, Bot, Castle, Sparkles, Wind, Zap } from "lucide-react";

function CastleSilhouette({ enemy = false }: { enemy?: boolean }) {
  return (
    <div className={`absolute bottom-[15%] ${enemy ? "right-[5%] scale-[.92] opacity-75" : "right-[30%]"}`}>
      <div className={`relative h-44 w-52 ${enemy ? "rotate-2" : "-rotate-1"}`}>
        <div className="absolute bottom-0 left-4 right-4 h-24 border border-white/10 bg-gradient-to-b from-[#6c6470] to-[#2d2930] shadow-[0_18px_40px_rgba(0,0,0,.6)]" />
        <div className="absolute bottom-0 left-0 h-36 w-14 border border-white/10 bg-gradient-to-r from-[#27242b] to-[#69616c]" />
        <div className="absolute bottom-0 right-0 h-36 w-14 border border-white/10 bg-gradient-to-l from-[#27242b] to-[#69616c]" />
        <div className="absolute bottom-24 left-[72px] h-20 w-[64px] border border-white/10 bg-[#57515d]" />
        <div className="absolute -top-3 left-0 h-16 w-14 bg-gradient-to-b from-rose-900 to-[#252027] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
        <div className="absolute -top-3 right-0 h-16 w-14 bg-gradient-to-b from-rose-900 to-[#252027] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
        {Array.from({ length: 10 }, (_, index) => <span key={index} className="absolute h-2 w-5 bg-[#77717b]" style={{ left: `${14 + index % 5 * 35}px`, bottom: `${93 + Math.floor(index / 5) * 35}px` }} />)}
        <div className="absolute bottom-0 left-[86px] h-12 w-8 rounded-t-full bg-[#171318]" />
        <span className="absolute left-[102px] top-[-35px] h-14 w-px bg-amber-100/70" />
        <span className={`absolute left-[103px] top-[-30px] h-7 w-12 ${enemy ? "bg-rose-500" : "bg-cyan-400"} [clip-path:polygon(0_0,100%_18%,72%_52%,100%_88%,0_100%)]`} />
      </div>
    </div>
  );
}

export function TowerClashFeature({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`relative overflow-hidden rounded-[2rem] border border-orange-200/15 bg-[#090404] shadow-[0_35px_100px_rgba(0,0,0,.55)] ${compact ? "min-h-[420px]" : "min-h-[620px]"}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_79%_22%,rgba(251,146,60,.24),transparent_17%),radial-gradient(circle_at_72%_66%,rgba(244,63,94,.2),transparent_28%),linear-gradient(118deg,#080404,#29100c_58%,#090305)]" />
      <div className="absolute inset-x-0 bottom-0 h-[36%] bg-[linear-gradient(174deg,transparent_0_14%,#2b1710_15%_45%,#0c0706_46%)]" />
      <div className="absolute right-[7%] top-[15%] h-36 w-36 rounded-full bg-orange-200/80 shadow-[0_0_80px_rgba(251,146,60,.55)]" />
      <CastleSilhouette enemy />
      <CastleSilhouette />
      <div className="absolute bottom-[20%] right-[48%] h-5 w-[15%] origin-left -rotate-[18deg] rounded-full bg-gradient-to-r from-orange-100 via-orange-400 to-transparent blur-[2px] shadow-[0_0_25px_rgba(251,146,60,.8)]" />
      <span className="absolute bottom-[35%] right-[36%] h-9 w-9 rounded-full bg-white shadow-[0_0_18px_#fff,0_0_45px_#fb923c,0_0_85px_#fb7185]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,3,3,.99)_0%,rgba(7,3,3,.93)_39%,rgba(7,3,3,.28)_70%,rgba(7,3,3,.06))]" />
      <div className={`relative z-10 flex max-w-3xl flex-col justify-center px-6 py-12 sm:px-11 lg:px-16 ${compact ? "min-h-[420px]" : "min-h-[620px]"}`}>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-200/20 bg-orange-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.22em] text-orange-100"><Castle className="h-3.5 w-3.5 text-orange-300" /> Premium 3D castle warfare</div>
        <p className="mt-6 text-[9px] font-black uppercase tracking-[.46em] text-rose-300">Bring down the kingdom</p>
        <h2 className={`mt-2 font-black italic leading-[.75] tracking-[-.08em] text-white ${compact ? "text-5xl sm:text-7xl" : "text-[clamp(4rem,9vw,8.5rem)]"}`}>TOWER<br /><span className="bg-gradient-to-r from-orange-200 via-rose-300 to-violet-300 bg-clip-text text-transparent">CLASH</span></h2>
        <p className="mt-6 max-w-lg text-sm leading-6 text-white/58">Aim through changing wind, unleash specialized siege payloads, and collapse a expert CPU fortress in cinematic 3D.</p>
        <div className="mt-5 flex flex-wrap gap-3 text-[8px] font-black uppercase tracking-[.14em] text-white/42"><span className="flex items-center gap-1.5"><Bomb className="h-3.5 w-3.5 text-orange-300" /> Destruction physics</span><span className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-rose-300" /> Expert CPU</span><span className="flex items-center gap-1.5"><Wind className="h-3.5 w-3.5 text-cyan-300" /> Wind ballistics</span><span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-amber-300" /> Cinematic impacts</span></div>
        <Link href="/play/tower-clash" className="mt-7 inline-flex w-fit items-center gap-2 rounded-xl border border-orange-100/60 bg-gradient-to-r from-orange-300 to-rose-500 px-7 py-4 text-[10px] font-black uppercase tracking-[.15em] text-[#210803] shadow-[0_0_35px_rgba(251,113,133,.26)]">Play Tower Clash <Zap className="h-4 w-4" /><ArrowRight className="h-4 w-4" /></Link>
      </div>
    </section>
  );
}
