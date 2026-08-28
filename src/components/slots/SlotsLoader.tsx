"use client";

import dynamic from "next/dynamic";

const SlotsExperience = dynamic(() => import("@/components/slots/SlotsExperience"), {
  ssr: false,
  loading: () => <div className="game-screen slot-screen grid place-items-center text-sm font-black uppercase tracking-[.2em] text-amber-200">Opening 777 Slots…</div>,
});

export function SlotsLoader() {
  return <SlotsExperience />;
}

