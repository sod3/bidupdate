"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { GameCinematicLayer } from "@/components/games/GameCinematicLayer";

const AdminLegacyShell = dynamic(() => import("@/components/admin/AdminLegacyShell").then((module) => module.AdminLegacyShell), {
  ssr: false,
});

export function RouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return <AdminLegacyShell>{children}</AdminLegacyShell>;
  }

  // Game routes own the entire viewport. Avoid mounting the customer chrome
  // behind WebGL/canvas experiences where it adds work and can steal space.
  if (pathname.startsWith("/play/")) {
    return <main className="relative min-h-[100dvh] w-full overflow-hidden bg-[#020509]">{children}<GameCinematicLayer /></main>;
  }

  if (pathname === "/play") {
    return (
      <>
        <Header />
        <main className="relative min-h-[calc(100dvh-64px)] w-full overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,rgba(14,165,233,.12),transparent_34rem),radial-gradient(circle_at_88%_18%,rgba(245,158,11,.09),transparent_28rem),#03070d] px-3 py-4 sm:px-5 sm:py-5 lg:px-8">{children}</main>
        <Sidebar />
        <BottomNav />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto min-h-[calc(100vh-64px)] w-full max-w-[1440px] overflow-x-hidden px-3 pb-[calc(104px+env(safe-area-inset-bottom))] pt-3 sm:px-5 md:pb-8 lg:px-8 lg:pt-5">{children}</main>
      <Sidebar />
      <BottomNav />
    </>
  );
}
