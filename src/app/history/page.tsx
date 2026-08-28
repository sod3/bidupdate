"use client";

import Link from "next/link";
import { useEffect } from "react";
import { History } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { TransactionList } from "@/components/wallet/TransactionList";

export default function HistoryPage() {
  const wallet = useWallet();
  useEffect(() => {
    if (!wallet.loading && wallet.user.role === "USER") void wallet.refreshWallet({ details: true });
  }, [wallet.loading, wallet.refreshWallet, wallet.user.role]);
  if (wallet.loading) return <div className="mx-auto h-64 max-w-3xl animate-pulse rounded-3xl bg-white" />;
  if (wallet.user.role !== "USER") return <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center"><History className="mx-auto h-10 w-10 text-teal-700" /><h1 className="mt-4 text-2xl font-black">Log in to view history</h1><Link href="/login?next=/history" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-teal-700 px-7 font-black text-white">Log in</Link></div>;
  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <h1 className="flex items-center gap-2 text-2xl font-black text-slate-950"><History className="h-6 w-6 text-teal-700" />Game history</h1>
      <p className="mt-1 text-sm text-slate-500">Server-confirmed game entries, wins, and wallet activity.</p>
      <div className="mt-4"><TransactionList transactions={wallet.transactions} /></div>
    </section>
  );
}
