import type { Metadata } from "next";
import { PrecisionArenaExperience } from "@/components/precision-arena/PrecisionArenaExperience";

export const metadata: Metadata = {
  title: "Precision Arena | Premium 2D Archery Duel",
  description: "Master drag-and-release archery, moving targets, wind and distance in an instant five-arrow duel against intelligent AI.",
};

export default function PrecisionArenaPage() {
  return <PrecisionArenaExperience />;
}
