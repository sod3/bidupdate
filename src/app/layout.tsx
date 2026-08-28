import React from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RouteShell } from "@/components/layout/RouteShell";
import { WalletProvider } from "@/context/WalletContext";
import { AppShellProvider } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Play Arena | Pick a game and play",
  description: "Play Teen Patti, archery, pool, football, castle battles, and racing from one fast, mobile-first game catalogue.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05080e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen overflow-x-hidden bg-[#05080e] text-slate-100 antialiased">
        <WalletProvider>
          <AppShellProvider>
            <ToastProvider>
              <RouteShell>{children}</RouteShell>
            </ToastProvider>
          </AppShellProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
