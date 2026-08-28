import type { Metadata } from "next";
import { EightBallExperience } from "@/components/eight-ball/EightBallExperience";

export const metadata: Metadata = {
  title: "8 Ball Cash Arena | Premium 2D Pool",
  description: "Play realistic single-player 8-ball pool instantly against challenging Expert AI.",
};

export default function EightBallPage() {
  return <EightBallExperience />;
}
