"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SimpleGameLobby } from "@/components/games/SimpleGameLobby";
import { useWallet } from "@/context/WalletContext";
import { COMPETITION_TIERS, tierById } from "@/lib/neon/constants";
import { canBackgroundPreload, preloadGameExperience } from "@/lib/gamePrefetch";
import { warmRaceSession } from "@/lib/raceSessionWarmup";

function RaceSetup() {
  const params = useSearchParams();
  const router = useRouter();
  const wallet = useWallet();
  const initial = useMemo(() => tierById(params.get("tier")).id, [params]);
  const [tierId, setTierId] = useState(initial);

  useEffect(() => {
    if (!canBackgroundPreload()) return;
    const destination = `/play/race?tier=${tierId}&car=nightfang`;
    router.prefetch(destination);
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const warm = () => {
      void preloadGameExperience("neon-drift").catch(() => undefined);
      if (!wallet.loading && wallet.user.role === "USER") warmRaceSession();
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(warm, { timeout: 700 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(warm, 180);
    return () => window.clearTimeout(timer);
  }, [router, tierId, wallet.loading, wallet.user.role]);

  const play = () => {
    const destination = `/play/race?tier=${tierId}&car=nightfang`;
    if (wallet.user.role !== "USER") router.push(`/login?next=${encodeURIComponent(destination)}`);
    else router.push(destination);
  };

  return (
    <SimpleGameLobby
      name="Neon Drift"
      image="/images/games/neon-drift.webp"
      imageAlt="Sports car drifting around a wet city road at night"
      tiers={COMPETITION_TIERS.map((item) => ({ id: item.id, name: item.name, entry: item.entry, reward: item.pool }))}
      selectedId={tierId}
      onSelect={(id) => setTierId(tierById(id).id)}
      onPlay={play}
      howTo={["Choose an amount", "Steer, drift, and use nitro", "Finish before the AI"]}
      fullscreen={false}
    />
  );
}

export default function PlayPage() {
  return <Suspense fallback={<div className="mx-auto h-[620px] w-full max-w-6xl animate-pulse rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,#07101b,#03070d)] shadow-2xl" />}><RaceSetup /></Suspense>;
}
