"use client";

import Link from "next/link";
import { CircleUserRound, Gamepad2, History, ShieldCheck, WalletCards } from "lucide-react";
import { useWallet } from "@/context/WalletContext";

const actions = [
  { label: "Wallet", href: "/wallet", icon: WalletCards },
  { label: "Game history", href: "/history", icon: History },
  { label: "All games", href: "/games", icon: Gamepad2 },
  { label: "Responsible Play", href: "/responsible-play", icon: ShieldCheck },
] as const;

export default function ProfilePage() {
  const { user, loading } = useWallet();
  if (loading) return <div className="mx-auto h-64 max-w-2xl animate-pulse rounded-3xl bg-white" />;
  if (user.role !== "USER") return <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center"><CircleUserRound className="mx-auto h-10 w-10 text-teal-700" /><h1 className="mt-4 text-2xl font-black">Log in to view your profile</h1><Link href="/login?next=/profile" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-teal-700 px-7 font-black text-white">Log in</Link></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="grid h-20 w-20 place-items-center rounded-3xl bg-teal-50 text-2xl font-black uppercase text-teal-700">{user.username.slice(0, 2)}</span>
        <h1 className="mt-4 text-3xl font-black text-slate-950">{user.username}</h1>
        <p className="mt-1 text-sm text-slate-600">{user.fullName}</p>
        <p className="mt-1 text-sm text-slate-500">{user.email}</p>
      </section>
      <section className="grid grid-cols-2 gap-3">
        {actions.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className="flex min-h-28 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 font-black text-slate-900 shadow-sm active:scale-[.99]"><Icon className="h-6 w-6 text-teal-700" /><span>{label}</span></Link>)}
      </section>
    </div>
  );
}
