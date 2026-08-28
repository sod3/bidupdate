"use client";

import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin") || pathname.startsWith("/play/")) return null;
  return (
    <footer className="mx-auto w-full max-w-[1440px] px-5 pb-24 pt-8 text-center text-[11px] leading-5 text-slate-500 lg:pb-8">
      Play responsibly. Credits are virtual, non-transferable, and have no cash value.
    </footer>
  );
}
