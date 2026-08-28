"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Castle,
  ChevronDown,
  CircleDot,
  CircleUserRound,
  Crosshair,
  Flag,
  Gauge,
  Goal,
  Home,
  LogOut,
  Menu,
  Trophy,
  UserRound,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useAppShell } from "@/components/layout/AppShell";
import { RankBadge } from "@/components/neon/RankBadge";

const headerLinks = [
  { label: "Home", href: "/" },
  { label: "Archery", href: "/play/precision-arena" },
  { label: "Tower Clash", href: "/play/tower-clash" },
  { label: "8 Ball", href: "/play/eight-ball" },
  { label: "Penalty Kings", href: "/play/penalty-kings" },
  { label: "Play", href: "/play" },
  { label: "Garage", href: "/garage" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Missions", href: "/missions" },
];

const sidebarMain = [
  { label: "Home", href: "/", icon: Home },
  { label: "Precision Arena", href: "/play/precision-arena", icon: Crosshair },
  { label: "Tower Clash", href: "/play/tower-clash", icon: Castle },
  { label: "8 Ball Cash Arena", href: "/play/eight-ball", icon: CircleDot },
  { label: "Penalty Kings", href: "/play/penalty-kings", icon: Goal },
  { label: "Find Race", href: "/play", icon: Flag },
  { label: "Garage", href: "/garage", icon: Wrench },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
];

const sidebarAccount = [
  { label: "Driver Profile", href: "/profile", icon: CircleUserRound },
  { label: "Credits", href: "/wallet", icon: Wallet },
];

const bottomItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "Archery", href: "/play/precision-arena", icon: Crosshair },
  { label: "Tower", href: "/play/tower-clash", icon: Castle },
  { label: "Pool", href: "/play/eight-ball", icon: CircleDot },
  { label: "Race", href: "/play", icon: Flag },
  { label: "Kings", href: "/play/penalty-kings", icon: Goal },
];

function isActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : href === "/play"
      ? pathname === "/play" || pathname === "/play/race"
      : pathname.startsWith(href);
}

function LegacyBrandMark() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Neon Drift home">
      <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-cyan-300/30 bg-[#071321] shadow-[0_0_24px_rgba(12,226,255,.24)]">
        <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_25%,rgba(20,231,255,.18)_50%,transparent_72%)]" />
        <span className="neon-logo-mark text-sm font-black italic text-cyan-200">N</span>
      </span>
      <span className="font-display hidden text-lg font-black italic tracking-[-0.04em] text-white sm:inline">
        NEON <span className="text-cyan-300">DRIFT</span>
      </span>
    </Link>
  );
}

function LegacyHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { toggleSidebar } = useAppShell();
  const { user, balance, logout, loading } = useWallet();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const signedIn = user.role === "USER";
  const signOut = async () => {
    await logout();
    setOpen(false);
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-white/[.07] bg-[#070b13]/90 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1720px] items-center justify-between gap-2 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={toggleSidebar} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/[.06] hover:text-white lg:hidden" aria-label="Toggle navigation menu">
            <Menu className="h-5 w-5" />
          </button>
          <LegacyBrandMark />
        </div>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {headerLinks.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={`relative rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-[.12em] transition ${active ? "text-cyan-300" : "text-slate-400 hover:text-white"}`}>
                {item.href === "/play/precision-arena" && <Crosshair className="mr-1 inline h-3 w-3 text-amber-200" />}
                {item.href === "/play/tower-clash" && <Castle className="mr-1 inline h-3 w-3 text-orange-300" />}
                {item.label}
                {active && <span className="absolute inset-x-3 -bottom-[13px] h-px bg-cyan-300 shadow-[0_0_12px_#22d3ee]" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded-xl bg-navy-800" />
          ) : signedIn ? (
            <>
              <div className="hidden xl:block"><RankBadge compact /></div>
              <Link href="/wallet" className="flex items-center gap-1.5 rounded-xl border border-cyan-300/15 bg-cyan-300/[.05] px-2.5 py-2 text-sm font-bold transition hover:border-cyan-300/40" aria-label={`Wallet: ${balance.toLocaleString()} credits`}>
                <Wallet className="h-3.5 w-3.5 text-cyan-300" />
                <span className="text-xs font-black text-cyan-200 sm:text-sm">{balance.toLocaleString()}</span>
              </Link>
              <div className="relative" ref={menu}>
                <button onClick={() => setOpen((value) => !value)} className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[.04] p-1.5" aria-label="User menu" aria-expanded={open}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-[10px] font-bold uppercase text-violet-200">{user.username.slice(0, 2)}</span>
                  <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="absolute right-0 z-[100] mt-2 w-60 rounded-2xl border border-white/10 bg-[#0b111d] py-1.5 shadow-2xl">
                    <div className="border-b border-navy-800 px-4 py-2.5">
                      <p className="truncate text-sm font-bold text-white">{user.username}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{user.email}</p>
                    </div>
                    <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-xs text-slate-300 hover:bg-white/[.05]"><CircleUserRound className="h-3.5 w-3.5" />Driver profile</Link>
                    <Link href="/garage" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-xs text-cyan-200 hover:bg-white/[.05]"><Gauge className="h-3.5 w-3.5" />Garage</Link>
                    <Link href="/wallet" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-xs text-slate-300 hover:bg-white/[.05]"><Wallet className="h-3.5 w-3.5" />Credits & history</Link>
                    <button onClick={() => void signOut()} className="mt-1 flex w-full items-center gap-2 border-t border-navy-800 px-4 py-2 text-left text-xs text-rose-400 hover:bg-navy-800"><LogOut className="h-3.5 w-3.5" />Log out</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link href="/login" className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white">Log In</Link>
              <Link href="/register" className="neon-button px-3 py-2 text-xs"><UserRound className="mr-1 inline h-3.5 w-3.5" />Join</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SidebarContent({ close }: { close?: () => void }) {
  const pathname = usePathname();
  const nav = (item: { label: string; href: string; icon: ElementType }) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} onClick={close} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-brand-teal text-navy-950" : "text-slate-300 hover:bg-navy-800/70 hover:text-white"}`}>
        <Icon className="h-4 w-4" />{item.label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-2 py-3">
      <div className="mx-2 mb-5 rounded-2xl border border-white/[.07] bg-white/[.025] p-3">
        <RankBadge />
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full w-[72%] bg-gradient-to-r from-amber-500 to-amber-200" /></div>
        <p className="mt-2 text-[9px] uppercase tracking-widest text-slate-600">28 RP to Gold I</p>
      </div>
      <p className="mb-1 px-3 text-[9px] font-extrabold uppercase tracking-[.2em] text-slate-600">Game Hub</p>
      {sidebarMain.map(nav)}
      <p className="mb-1 mt-5 px-3 text-[9px] font-extrabold uppercase tracking-[.2em] text-slate-600">Driver</p>
      {sidebarAccount.map(nav)}
      <div className="mx-2 mt-auto rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-3">
        <Gauge className="h-4 w-4 text-cyan-300" />
        <p className="mt-2 text-[10px] font-bold text-white">Night City Circuit</p>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-500">Rain · 00:14 local · light traffic</p>
      </div>
    </div>
  );
}

function LegacySidebar() {
  const { sidebarOpen, closeSidebar } = useAppShell();
  const pathname = usePathname();

  useEffect(() => closeSidebar(), [pathname, closeSidebar]);
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  return (
    <>
      <aside className="sticky top-16 hidden min-h-[calc(100vh-64px)] w-[228px] shrink-0 flex-col self-start overflow-y-auto border-r border-white/[.06] bg-[#070b13]/55 lg:flex"><SidebarContent /></aside>
      {sidebarOpen && <div className="fixed inset-0 z-[80] bg-black/65 lg:hidden" onClick={closeSidebar} aria-hidden="true" />}
      <aside className={`fixed bottom-0 left-0 top-0 z-[90] w-[280px] border-r border-white/10 bg-[#080d17] shadow-2xl transition-transform lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between border-b border-white/[.07] px-4">
          <span className="font-display font-black italic text-white">NEON <b className="text-cyan-300">DRIFT</b></span>
          <button onClick={closeSidebar} className="rounded-lg p-2 text-slate-400 hover:bg-white/[.06]" aria-label="Close navigation menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="h-[calc(100%-56px)]"><SidebarContent close={closeSidebar} /></div>
      </aside>
    </>
  );
}

function LegacyBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[.08] bg-[#080d17]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="grid h-[60px] grid-cols-6">
        {bottomItems.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`relative flex flex-col items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider ${active ? "text-cyan-300" : "text-slate-600"}`}>
              {active && <span className="absolute top-0 h-px w-8 bg-cyan-300 shadow-[0_0_8px_#22d3ee]" />}
              <Icon className="h-4 w-4" />{item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function LegacyFooter() {
  return (
    <footer className="mt-auto border-t border-white/[.06] bg-[#060a11] px-5 pb-24 pt-8 lg:pb-8">
      <div className="mx-auto grid max-w-6xl gap-6 text-xs text-slate-500 sm:grid-cols-3">
        <div><h4 className="font-display font-black italic text-white">NEON <span className="text-cyan-300">DRIFT</span></h4><p className="mt-2">Race. Drift. Dominate.</p><p className="mt-3 text-[10px] leading-relaxed text-slate-600">Competitive outcomes are based on verified race performance. Credits are virtual and have no cash value.</p></div>
        <div><h4 className="font-bold text-white">Game Hub</h4><div className="mt-2 flex flex-col gap-2"><Link href="/play/precision-arena">Precision Arena</Link><Link href="/play/tower-clash">Tower Clash</Link><Link href="/play/eight-ball">8 Ball Cash Arena</Link><Link href="/play">All games</Link><Link href="/leaderboard">Leaderboards</Link></div></div>
        <div><h4 className="font-bold text-white">Driver</h4><div className="mt-2 flex flex-col gap-2"><Link href="/profile">Profile</Link><Link href="/wallet">Wallet / Credits</Link><Link href="/support">Support</Link><Link href="/admin">Platform Operations</Link></div></div>
      </div>
      <p className="mx-auto mt-6 max-w-6xl border-t border-white/[.06] pt-4 text-[10px] text-slate-700">© {new Date().getFullYear()} Neon Arcade. Original fictional games and worlds.</p>
    </footer>
  );
}

export function AdminLegacyShell({ children }: { children: ReactNode }) {
  return (
    <div className="admin-legacy-root dark min-h-screen overflow-x-hidden text-slate-100">
      <LegacyHeader />
      <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1720px]">
        <LegacySidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden px-3 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4 sm:px-5 lg:px-7 lg:pb-8 lg:pt-6">{children}</main>
      </div>
      <LegacyBottomNav />
      <LegacyFooter />
    </div>
  );
}
