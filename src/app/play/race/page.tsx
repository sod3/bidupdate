"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RaceExperience } from "@/components/neon/RaceExperience";
import { tierById, vehicleById } from "@/lib/neon/constants";

function RacePageContent() {
  const params = useSearchParams();
  return <RaceExperience tierId={tierById(params.get("tier")).id} vehicleId={vehicleById(params.get("car")).id} />;
}

export default function RacePage() {
  return <Suspense fallback={<div className="fixed inset-0 z-[100] bg-[#03060b]" />}><RacePageContent /></Suspense>;
}
