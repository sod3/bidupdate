"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { Play } from "lucide-react";
import type { GameItem } from "@/lib/games";
import { preloadGameExperience } from "@/lib/gamePrefetch";

export function GameCard({ game, priority = false }: { game: GameItem; priority?: boolean }) {
  const router = useRouter();
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const routeWarmed = useRef(false);
  const experienceWarmed = useRef(false);
  const badge = game.isNew ? "NEW" : game.isPopular ? "HOT" : null;
  const category = game.category.toLocaleUpperCase();
  const motif = game.id === "777-slots" || game.id === "money-machine" || game.id === "thunder-gods" ? "7"
    : game.id === "penalty-kings" ? "⚽"
      : game.id === "eight-ball" ? "8"
        : game.id === "precision-arena" ? "➵"
          : game.id === "tower-clash" ? "✦"
            : game.id === "neon-drift" || game.id === "car-roulette" ? "»"
              : game.id === "teen-patti" || game.id === "red-vs-black" || game.id === "dragon-tiger" ? "A"
                : "◆";

  const warmRoute = useCallback(() => {
    if (routeWarmed.current) return;
    routeWarmed.current = true;
    router.prefetch(game.slug);
  }, [game.slug, router]);

  const warmExperience = useCallback(() => {
    warmRoute();
    if (experienceWarmed.current) return;
    experienceWarmed.current = true;
    void preloadGameExperience(game.id).catch(() => { experienceWarmed.current = false; });
  }, [game.id, warmRoute]);

  // Route data is tiny compared with the render engines, so prepare it shortly
  // before a card enters view. Heavy Pixi/Babylon code is still only fetched on
  // intent (hover/focus/touch) or by the catalogue's idle warmup.
  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        warmRoute();
        // These two routes contain an additional client-only loader chunk. By
        // the time their card actually reaches the viewport, warming that chunk
        // prevents a second loading waterfall when it is tapped.
        if (game.id === "777-slots" || game.id === "teen-patti") warmExperience();
        observer.disconnect();
      }
    }, { rootMargin: "260px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [game.id, warmExperience, warmRoute]);

  return (
    <Link
      ref={cardRef}
      href={game.slug}
      prefetch
      onPointerEnter={warmExperience}
      onPointerDown={warmExperience}
      onFocus={warmExperience}
      onTouchStart={warmExperience}
      className={`game-card game-card-${game.id} premium-catalogue-card group block touch-manipulation overflow-hidden rounded-2xl border border-amber-200/10 bg-[#090d13] shadow-[0_12px_30px_rgba(2,6,12,.16)] outline-none focus-visible:ring-4 focus-visible:ring-amber-400/25`}
      aria-label={`Play ${game.name}`}
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-[#111720]">
        <Image
          src={game.thumbnail}
          alt={game.alt}
          fill
          priority={priority}
          unoptimized
          decoding="async"
          sizes="(max-width: 349px) calc(100vw - 24px), (max-width: 1023px) calc(50vw - 18px), (max-width: 1279px) 33vw, 25vw"
          className="object-cover transition duration-500 group-hover:scale-[1.075] group-hover:saturate-[1.16] group-active:scale-[.985]"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-[#04070b] via-transparent to-black/10" />
        <span className="game-card-light" aria-hidden="true" />
        <span className="game-card-motif" aria-hidden="true">{motif}</span>
        {badge && (
          <span className={`absolute left-2 top-2 rounded-md border px-2 py-1 text-[9px] font-black tracking-wider text-white shadow-lg backdrop-blur ${game.isNew ? "border-emerald-200/25 bg-emerald-700/85" : "border-rose-200/25 bg-rose-700/85"}`}>
            {badge}
          </span>
        )}
        <span className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <span className="min-w-0"><small className="block text-[8px] font-black uppercase tracking-[.17em] text-amber-300/80">{category}</small><b className="game-card-title mt-1 block truncate text-base font-black text-white drop-shadow-lg sm:text-lg">{game.name}</b></span>
          <span className="game-card-play flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-amber-100/30 bg-gradient-to-br from-amber-200 to-amber-500 px-3 text-[9px] font-black text-[#251600] shadow-[0_0_20px_rgba(245,158,11,.2)] transition group-hover:brightness-110 group-active:scale-90" aria-hidden="true"><Play className="h-3.5 w-3.5 fill-current" /><span className="game-card-play-label">PLAY</span></span>
        </span>
      </span>
      <span className="flex min-h-10 items-center justify-between border-t border-white/[.05] px-3 py-2"><span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Server verified</span><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_7px_#34d399]" /></span>
    </Link>
  );
}
