import { Shield } from "lucide-react";

export function RankBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "rounded-xl border border-amber-300/15 bg-amber-300/[.05] px-3 py-2"}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-amber-200 to-amber-600 text-[#100c03] shadow-[0_0_18px_rgba(251,191,36,.24)]"><Shield className="h-4 w-4 fill-current" /></span>
      <span className="leading-none"><b className="block text-[10px] uppercase tracking-[.16em] text-amber-200">Gold II</b>{!compact && <small className="mt-1 block text-[9px] text-slate-500">72 / 100 RP</small>}</span>
    </div>
  );
}

