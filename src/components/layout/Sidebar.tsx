"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleUserRound, Gamepad2, Gift, HandHeart, History, Landmark, LogOut, ShieldCheck, Trophy, WalletCards, Wrench, X } from "lucide-react";
import { useAppShell } from "./AppShell";
import { useWallet } from "@/context/WalletContext";

const links = [
  { label: "Profile", href: "/profile", icon: CircleUserRound },
  { label: "Wallet", href: "/wallet", icon: WalletCards },
  { label: "Refer & Earn", href: "/refer", icon: Gift },
  { label: "Game history", href: "/history", icon: History },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "Missions", href: "/missions", icon: Gamepad2 },
  { label: "Garage", href: "/garage", icon: Wrench },
  { label: "Support", href: "/support", icon: HandHeart },
  { label: "Responsible Play", href: "/responsible-play", icon: ShieldCheck },
] as const;

export function Sidebar() {
  const { sidebarOpen, closeSidebar } = useAppShell();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useWallet();

  useEffect(() => closeSidebar(), [pathname, closeSidebar]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [sidebarOpen]);

  const signOut = async () => {
    await logout();
    closeSidebar();
    router.push("/");
    router.refresh();
  };

  if (!sidebarOpen || pathname.startsWith("/admin")) return null;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" className="absolute inset-0 bg-slate-950/55" onClick={closeSidebar} aria-label="Close menu" />
      <aside className="absolute bottom-0 right-0 top-0 flex w-[min(88vw,360px)] flex-col bg-white shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <div>
            <p className="text-sm font-black text-slate-950">Menu</p>
            {user.role === "USER" && <p className="text-xs text-slate-500">{user.username}</p>}
          </div>
          <button type="button" onClick={closeSidebar} className="grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Account and help">
          <div className="grid gap-1">
            {links.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-800 hover:bg-slate-100 active:bg-slate-200">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-teal-700"><Icon className="h-5 w-5" /></span>{label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="border-t border-slate-200 p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {user.role === "USER" ? (
            <button type="button" onClick={() => void signOut()} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-rose-700 hover:bg-rose-50"><LogOut className="h-5 w-5" />Log out</button>
          ) : (
            <Link href="/login" className="flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-4 font-bold text-white">Log in</Link>
          )}
          <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-slate-400"><Landmark className="h-3 w-3" /> Virtual credits have no cash value.</p>
        </div>
      </aside>
    </div>
  );
}
