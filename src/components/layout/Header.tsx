"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { BrandMark } from "@/components/neon/BrandMark";
import { customerCopy, formatCredits } from "@/lib/customerCopy";
import { useAppShell } from "./AppShell";

export function Header() {
  const pathname = usePathname();
  const { user, balance, loading } = useWallet();
  const { openSidebar } = useAppShell();

  if (pathname.startsWith("/admin")) return null;
  const signedIn = user.role === "USER";

  return (
    <header className="sticky top-0 z-50 border-b border-amber-200/10 bg-[#070b10]/95 text-white shadow-[0_10px_35px_rgba(2,6,12,.24)] backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-1.5 px-3 sm:gap-2 sm:px-5 lg:px-8">
        <BrandMark />
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="h-10 w-14 animate-pulse rounded-xl bg-white/10 sm:w-24" aria-label="Loading balance" />
          ) : (
            <Link href={signedIn ? "/wallet" : "/login"} className="min-w-0 rounded-xl px-1 py-1 text-right outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:px-2" aria-label={`${customerCopy.balance}: ${formatCredits(signedIn ? balance : 0)}`}>
              <span className="block text-[9px] font-bold uppercase tracking-wide text-amber-200/55 sm:text-[10px]">{customerCopy.balance}</span>
              <span className="block whitespace-nowrap text-xs font-black tabular-nums text-white sm:text-base">{formatCredits(signedIn ? balance : 0)}</span>
            </Link>
          )}
          <Link href="/deposit" className="flex min-h-11 items-center gap-1 rounded-xl bg-amber-400 px-2.5 text-sm font-black text-amber-950 shadow-sm transition active:scale-[.97] sm:px-4">
            <Plus className="h-5 w-5" /> <span className="hidden xs:inline">{customerCopy.deposit}</span><span className="xs:hidden">Add</span>
          </Link>
          <button type="button" onClick={openSidebar} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.055] text-slate-200 hover:bg-white/10" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        </div>
      </div>
    </header>
  );
}
