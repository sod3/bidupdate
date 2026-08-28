"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  Check,
  CircleDot,
  Loader2,
  Paintbrush,
  Save,
  Sparkles,
  Wrench,
} from "lucide-react";
import { VEHICLES } from "@/lib/neon/constants";
import { SectionHeading } from "@/components/neon/SectionHeading";

const GarageScene = dynamic(() => import("@/components/neon/GarageScene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <Loader2 className="h-7 w-7 animate-spin text-cyan-300" />
    </div>
  ),
});
const tabs = [
  "My cars",
  "Paint",
  "Wheels",
  "Underglow",
  "Decals",
  "Nitro",
] as const;
const colors = [
  "#14e7ff",
  "#9b5cff",
  "#f2f5ff",
  "#ff365d",
  "#f8bf3c",
  "#12e38d",
];
const glows = ["#00a6ff", "#ff3cd5", "#ff405f", "#7c4dff", "#19ffc6"];

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-slate-600">
        <span>{label}</span>
        <span>{value}/10</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[.06]">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-violet-400"
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  );
}

export default function GaragePage() {
  const [vehicleId, setVehicleId] = useState("nightfang");
  const [tab, setTab] = useState<(typeof tabs)[number]>("My cars");
  const [paint, setPaint] = useState<string>(VEHICLES[0].color);
  const [glow, setGlow] = useState<string>(VEHICLES[0].accent);
  const [saved, setSaved] = useState(false);
  const car = useMemo(
    () => VEHICLES.find((item) => item.id === vehicleId) ?? VEHICLES[0],
    [vehicleId],
  );
  const chooseCar = (id: string) => {
    const next = VEHICLES.find((item) => item.id === id) ?? VEHICLES[0];
    setVehicleId(next.id);
    setPaint(next.color);
    setGlow(next.accent);
    setSaved(false);
  };
  return (
    <div className="space-y-7 pb-10">
      <SectionHeading
        eyebrow="Driver garage"
        title="Build your signature"
        copy="Rotate the car, tune its cosmetic identity, and take the same fair performance package onto the grid."
        action={
          <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-emerald-300">
            <Check className="h-3.5 w-3.5" /> No pay-to-win stats
          </span>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_270px]">
        <aside className="neon-panel rounded-2xl p-3">
          <p className="px-2 py-2 text-[8px] font-black uppercase tracking-[.2em] text-slate-600">
            My cars · 3/3
          </p>
          <div className="space-y-2">
            {VEHICLES.map((item) => (
              <button
                key={item.id}
                onClick={() => chooseCar(item.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${item.id === vehicleId ? "border-cyan-300/35 bg-cyan-300/[.06]" : "border-white/[.05] bg-white/[.015] hover:border-white/15"}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-8 rounded-lg border border-white/10"
                    style={{
                      background: `linear-gradient(145deg, ${item.color}, #111827)`,
                      boxShadow: `0 0 13px ${item.accent}44`,
                    }}
                  />
                  <span>
                    <b className="font-display block text-sm font-black italic uppercase text-white">
                      {item.name}
                    </b>
                    <small className="text-[8px] uppercase tracking-wider text-slate-600">
                      {item.className}
                    </small>
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-violet-300/10 bg-violet-300/[.035] p-3">
            <Sparkles className="h-4 w-4 text-violet-300" />
            <p className="mt-2 text-[9px] font-bold text-white">
              Cosmetic collection
            </p>
            <p className="mt-1 text-[8px] leading-4 text-slate-600">
              12 paints · 8 rims · 6 nitro effects
            </p>
          </div>
        </aside>
        <section className="relative min-h-[510px] overflow-hidden rounded-[2rem] border border-white/[.08] bg-[#050910]">
          <GarageScene name={car.id} color={paint} accent={glow} />
          <div className="pointer-events-none absolute left-5 top-5">
            <p className="neon-eyebrow">Selected vehicle</p>
            <h1 className="font-display mt-1 text-3xl font-black italic uppercase text-white sm:text-5xl">
              {car.name}
            </h1>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[.18em] text-slate-500">
              {car.className}
            </p>
          </div>
          <div className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-[8px] font-black uppercase tracking-widest text-slate-400 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> Lightweight 2D showcase · live neon paint
          </div>
        </section>
        <aside className="neon-panel rounded-2xl p-5">
          <p className="neon-eyebrow">Performance profile</p>
          <h2 className="font-display mt-2 text-2xl font-black italic text-white">
            {car.name}
          </h2>
          <p className="mt-2 text-[10px] leading-5 text-slate-500">
            {car.description}
          </p>
          <div className="mt-5 space-y-3">
            <MiniStat label="Acceleration" value={car.acceleration} />
            <MiniStat label="Top speed" value={car.topSpeed} />
            <MiniStat label="Handling" value={car.handling} />
            <MiniStat label="Nitro" value={car.nitro} />
          </div>
          <div className="mt-6 rounded-xl border border-emerald-300/10 bg-emerald-300/[.035] p-3 text-[8px] font-bold uppercase leading-4 tracking-wider text-emerald-200">
            All vehicles share a normalized competitive rating. Stats describe
            handling character, not a purchase advantage.
          </div>
        </aside>
      </div>
      <section className="neon-panel overflow-hidden rounded-2xl">
        <div className="flex gap-1 overflow-x-auto border-b border-white/[.06] p-2">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`shrink-0 rounded-lg px-4 py-2 text-[9px] font-black uppercase tracking-widest ${tab === item ? "bg-cyan-300 text-[#041117]" : "text-slate-500 hover:text-white"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto]">
          <div>
            {tab === "My cars" ? (
              <div className="grid gap-3 md:grid-cols-3">
                {VEHICLES.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => chooseCar(item.id)}
                    className={`rounded-xl border p-4 text-left ${vehicleId === item.id ? "border-cyan-300/35 bg-cyan-300/[.05]" : "border-white/[.06]"}`}
                  >
                    <Wrench className="h-4 w-4 text-cyan-300" />
                    <p className="font-display mt-3 text-lg font-black italic text-white">
                      {item.name}
                    </p>
                    <p className="text-[8px] uppercase tracking-widest text-slate-600">
                      Race ready
                    </p>
                  </button>
                ))}
              </div>
            ) : tab === "Paint" ? (
              <div>
                <p className="mb-4 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Body paint
                </p>
                <div className="flex flex-wrap gap-3">
                  {colors.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setPaint(item);
                        setSaved(false);
                      }}
                      className={`grid h-12 w-12 place-items-center rounded-xl border-2 ${paint === item ? "border-white" : "border-transparent"}`}
                      style={{
                        backgroundColor: item,
                        boxShadow:
                          paint === item ? `0 0 22px ${item}66` : "none",
                      }}
                    >
                      {paint === item && (
                        <Check className="h-4 w-4 text-black" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : tab === "Underglow" ? (
              <div>
                <p className="mb-4 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Neon underglow
                </p>
                <div className="flex flex-wrap gap-3">
                  {glows.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setGlow(item);
                        setSaved(false);
                      }}
                      className={`grid h-12 w-12 place-items-center rounded-full border ${glow === item ? "border-white" : "border-white/10"}`}
                      style={{
                        backgroundColor: `${item}33`,
                        boxShadow: `inset 0 0 18px ${item}, 0 0 18px ${item}44`,
                      }}
                    >
                      {glow === item && (
                        <CircleDot className="h-4 w-4 text-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  {tab}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {["Street", "Apex", "Eclipse"].map((item, index) => (
                    <button
                      key={item}
                      className="rounded-xl border border-white/[.06] bg-white/[.02] p-5 text-left"
                    >
                      <Paintbrush
                        className={`h-4 w-4 ${index === 0 ? "text-cyan-300" : "text-slate-600"}`}
                      />
                      <p className="mt-3 text-xs font-bold text-white">
                        {item}
                      </p>
                      <p className="mt-1 text-[8px] uppercase tracking-wider text-slate-600">
                        {index === 0 ? "Equipped" : "Unlocked"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1800);
            }}
            className="neon-button h-fit gap-2 px-6 py-3 text-[9px]"
          >
            <Save className="h-4 w-4" />
            {saved ? "Saved" : "Save build"}
          </button>
        </div>
      </section>
    </div>
  );
}
