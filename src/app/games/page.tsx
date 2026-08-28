import type { Metadata } from "next";
import { GameCatalogue } from "@/components/games/GameCatalogue";

export const metadata: Metadata = {
  title: "Games | Play Arena",
  description: "Browse all available Play Arena games.",
};

export default function GamesPage() {
  return <GameCatalogue title="All games" />;
}
