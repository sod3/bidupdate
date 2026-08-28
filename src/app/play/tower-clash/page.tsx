import type { Metadata } from "next";
import { TowerClashExperience } from "@/components/tower-clash/TowerClashExperience";

export const metadata: Metadata = {
  title: "Tower Clash | Premium 3D Castle Battle",
  description: "Destroy a boss AI castle with wind-aware cannon ballistics in an instant cinematic 3D siege.",
};

export default function TowerClashPage() {
  return <TowerClashExperience />;
}
