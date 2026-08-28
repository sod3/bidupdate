import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Cash Arena | Precision Arena, Tower Clash, 8 Ball, Penalty Kings & Neon Drift",
  description: "Play premium 2D archery, pool, football shootouts, and street racing plus cinematic castle battles instantly against challenging AI opponents.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05080f",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
