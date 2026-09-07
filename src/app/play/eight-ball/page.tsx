import type { Metadata } from "next";
import { EightBallExperience } from "@/components/eight-ball/EightBallExperience";

export const metadata: Metadata = {
  title: "Aurum Club | 8 Ball Pool",
  description: "Play live 8-ball pool with automatic expert AI matchmaking, precision aiming and tournament tables.",
};

export default function EightBallPage() {
  return <EightBallExperience />;
}
