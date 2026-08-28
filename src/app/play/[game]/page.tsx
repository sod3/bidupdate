import { notFound } from "next/navigation";
import { GameShell } from "@/components/premium-games/GameShell";
import { isPremiumGameId } from "@/lib/premium-games/definitions";

export default async function PremiumGamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isPremiumGameId(game)) notFound();
  return <GameShell gameId={game} />;
}

