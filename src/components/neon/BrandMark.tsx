import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { customerCopy } from "@/lib/customerCopy";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2" aria-label={`${customerCopy.brand} home`}>
      <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-cyan-200/20 bg-[linear-gradient(145deg,#0f9f98,#087b82)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.24),0_0_22px_rgba(34,211,238,.16)]">
        <span className="absolute inset-x-1 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" aria-hidden="true" />
        <Gamepad2 className="h-5 w-5 drop-shadow-[0_0_8px_rgba(255,255,255,.35)]" />
      </span>
      {!compact && (
        <span className="hidden min-w-0 min-[430px]:block">
          <span className="block truncate text-base font-black tracking-[-.025em] text-white drop-shadow-[0_1px_8px_rgba(0,0,0,.45)] sm:text-lg">{customerCopy.brand}</span>
          <span className="mt-0.5 block text-[6px] font-black uppercase tracking-[.28em] text-amber-200/55">Premium games</span>
        </span>
      )}
    </Link>
  );
}
