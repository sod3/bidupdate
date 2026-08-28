"use client";

import dynamic from "next/dynamic";

const TeenPattiExperience = dynamic(() => import("@/components/teen-patti/TeenPattiExperience"), {
  ssr: false,
  loading: () => <div className="game-screen grid place-items-center bg-[#020706] text-sm font-black uppercase tracking-[.2em] text-amber-200">Opening Teen Patti…</div>,
});

export function TeenPattiLoader() {
  return <TeenPattiExperience />;
}
