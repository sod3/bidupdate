"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, Home, Menu, Plus, WalletCards } from "lucide-react";
import { useAppShell } from "./AppShell";
import { customerCopy } from "@/lib/customerCopy";

const items = [
  { label: customerCopy.home, href: "/", icon: Home },
  { label: customerCopy.games, href: "/games", icon: Gamepad2 },
  { label: customerCopy.wallet, href: "/wallet", icon: WalletCards },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { openSidebar } = useAppShell();
  if (pathname.startsWith("/admin") || pathname === "/login" || pathname === "/register" || pathname.startsWith("/play/")) return null;

  const renderLink = (item: (typeof items)[number]) => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-extrabold ${active ? "text-amber-300" : "text-slate-400"}`}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} />{item.label}
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[80] isolate border-t border-white/10 bg-[#070b10] pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(2,6,12,.55)] md:hidden" aria-label="Primary navigation">
      <div className="grid h-16 grid-cols-5 bg-[#070b10]">
        {renderLink(items[0])}
        {renderLink(items[1])}
        <Link href="/deposit" className="relative flex flex-col items-center justify-end gap-0.5 pb-1 text-[11px] font-black text-amber-950" aria-label="Deposit">
          <span className="absolute -top-5 grid h-14 w-14 place-items-center rounded-2xl border-4 border-[#070b10] bg-amber-400 shadow-[0_0_24px_rgba(251,191,36,.28)]"><Plus className="h-7 w-7" /></span>
          <span>{customerCopy.deposit}</span>
        </Link>
        {renderLink(items[2])}
        <button type="button" onClick={openSidebar} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-extrabold text-slate-400" aria-label="Open menu"><Menu className="h-[22px] w-[22px]" />{customerCopy.menu}</button>
      </div>
    </nav>
  );
}
