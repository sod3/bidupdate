"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Gamepad2, Gift, Search, X } from "lucide-react";
import { GameCard } from "@/components/games/GameCard";
import { customerCopy } from "@/lib/customerCopy";
import { orderedGames } from "@/lib/games";
import { canBackgroundPreload, preloadPremiumCore } from "@/lib/gamePrefetch";

const categories = [
  { id: "popular", label: "Hot", icon: "🔥" },
  { id: "all", label: "All", icon: "🎮" },
  { id: "casual", label: "Casual", icon: "⚡" },
  { id: "reels", label: "Reels", icon: "🎰" },
  { id: "table", label: "Table", icon: "🃏" },
  { id: "skill", label: "Skill", icon: "🎯" },
  { id: "new", label: "New", icon: "⭐" },
] as const;

type CategoryId = (typeof categories)[number]["id"];

export function GameCatalogue({ title = "Games" }: { title?: string }) {
  const router = useRouter();
  const [category, setCategory] = useState<CategoryId>("popular");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowWelcome(new URLSearchParams(window.location.search).get("welcome") === "1"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!canBackgroundPreload()) return;
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let idleId: number | null = null;
    let fallbackTimer: number | null = null;
    let cancelled = false;

    const prepare = () => {
      if (cancelled) return;
      // The first eight catalogue games share this renderer. Warm it only after
      // the browser has finished the initial page load so game JS can never
      // compete with the homepage artwork for the critical network path.
      void preloadPremiumCore().catch(() => undefined);
      orderedGames.slice(0, 10).forEach((game, index) => {
        window.setTimeout(() => { if (!cancelled) router.prefetch(game.slug); }, index * 45);
      });
    };

    const schedule = () => {
      if (idleWindow.requestIdleCallback) idleId = idleWindow.requestIdleCallback(prepare, { timeout: 1000 });
      else fallbackTimer = window.setTimeout(prepare, 350);
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idleId !== null) idleWindow.cancelIdleCallback?.(idleId);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
  }, [router]);

  const availableCategories = useMemo(() => categories.filter(({ id }) => orderedGames.some((game) => (
    id === "all"
      || (id === "popular" && game.isPopular)
      || (id === "new" && game.isNew)
      || game.category === id
  ))), []);

  const visibleGames = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return orderedGames.filter((game) => {
      const categoryMatch = category === "all"
        || (category === "popular" && game.isPopular)
        || (category === "new" && game.isNew)
        || game.category === category;
      return categoryMatch && (!needle || game.name.toLocaleLowerCase().includes(needle));
    });
  }, [category, query]);

  const openSearch = () => {
    setSearchOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 50);
  };

  return (
    <section aria-labelledby="games-heading" className="game-catalogue-shell mx-auto w-full max-w-[1280px]">
      {showWelcome && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm" role="status">
          <Gift className="h-6 w-6 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm font-black sm:text-base">🎁 Welcome! You received Rs 500 to try our games.</p>
          <button type="button" onClick={() => setShowWelcome(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-amber-800 hover:bg-amber-100" aria-label="Dismiss welcome message"><X className="h-4 w-4" /></button>
        </div>
      )}
      <div className="game-catalogue-head -mx-3 rounded-b-3xl border-b border-amber-200/10 bg-[#070b10] px-3 pb-3 pt-3 text-white shadow-xl sm:-mx-5 sm:px-5 lg:mx-0 lg:rounded-3xl lg:border lg:px-5 lg:pb-4 lg:pt-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[9px] font-black uppercase tracking-[.22em] text-amber-300">Premium game collection</p><h1 id="games-heading" className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">{title}</h1></div>
          {searchOpen ? (
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-amber-300/30 bg-white/5 px-3 shadow-sm sm:max-w-sm">
              <Search className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a game"
                className="min-w-0 flex-1 bg-transparent px-2 text-base text-white outline-none placeholder:text-slate-500"
                aria-label="Search games"
              />
              <button type="button" onClick={() => { setQuery(""); setSearchOpen(false); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/10" aria-label="Close search">
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={openSearch} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-amber-200 shadow-sm active:scale-95" aria-label="Search games">
              <Search className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="hide-scrollbar -mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0" role="tablist" aria-label="Game categories">
          {availableCategories.map(({ id, label, icon }) => {
            const selected = category === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setCategory(id)}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition active:scale-[.97] ${selected ? "border-amber-300/70 bg-gradient-to-br from-amber-200 to-amber-500 text-[#241500] shadow-[0_0_20px_rgba(245,158,11,.18)]" : "border-white/10 bg-white/5 text-slate-300"}`}
              >
                <span aria-hidden="true">{icon}</span>{label}
              </button>
            );
          })}
        </div>
      </div>

      {visibleGames.length ? (
        <div className="mt-3 grid grid-cols-1 gap-3 min-[350px]:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
          {visibleGames.map((game, index) => <GameCard key={game.id} game={game} priority={index < 2} />)}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
          <Gamepad2 className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 font-bold text-slate-900">{query ? "No games found" : customerCopy.noGames}</p>
          <button type="button" onClick={() => { setCategory("all"); setQuery(""); }} className="mt-4 min-h-11 rounded-xl bg-teal-700 px-5 font-bold text-white">View all games</button>
        </div>
      )}
    </section>
  );
}
