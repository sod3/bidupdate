"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, Clock3, Gift, Landmark, Plus, WalletCards, X } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { TransactionList } from "@/components/wallet/TransactionList";
import { customerCopy, formatCredits } from "@/lib/customerCopy";

const statusStyle = {
  PENDING: "bg-amber-50 text-amber-800",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-600",
} as const;

const statusLabel = {
  PENDING: "Pending",
  APPROVED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
} as const;

export default function WalletPage() {
  const wallet = useWallet();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.loading && wallet.user.role === "USER") void wallet.refreshWallet({ details: true });
  }, [wallet.loading, wallet.refreshWallet, wallet.user.role]);

  const cancel = async (requestId: string) => {
    setCancelling(requestId); setError(null);
    try { await wallet.cancelCreditRequest(requestId); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Request could not be cancelled."); }
    finally { setCancelling(null); }
  };

  if (wallet.loading) return <div className="mx-auto h-80 max-w-3xl animate-pulse rounded-3xl bg-white" aria-label="Loading wallet" />;
  if (wallet.user.role !== "USER") {
    return <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><WalletCards className="mx-auto h-10 w-10 text-teal-700" /><h1 className="mt-4 text-2xl font-black text-slate-950">Log in to view your wallet</h1><p className="mt-2 text-sm text-slate-500">Balances and history are loaded from the server.</p><Link href="/login?next=/wallet" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-teal-700 px-7 font-black text-white">Log in</Link></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <p className="text-sm font-bold text-slate-400">Your balance</p>
        <h1 className="mt-1 text-4xl font-black tabular-nums sm:text-5xl">{formatCredits(wallet.balance)}</h1>
        {wallet.reservedBalance > 0 && <p className="mt-2 text-sm text-slate-400">{formatCredits(wallet.reservedBalance)} reserved</p>}
        <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-slate-900 p-3"><p className="flex items-center gap-1.5 text-xs font-bold text-slate-400"><Landmark className="h-4 w-4" />Withdrawable</p><p className="mt-1 font-black tabular-nums">{formatCredits(wallet.cashBalance)}</p></div>
          <div className="rounded-xl bg-slate-900 p-3"><p className="flex items-center gap-1.5 text-xs font-bold text-amber-300"><Gift className="h-4 w-4" />Promotional</p><p className="mt-1 font-black tabular-nums">{formatCredits(wallet.bonusBalance)}</p></div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link href="/deposit" className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 font-black text-amber-950 transition active:scale-[.98]"><Plus className="h-5 w-5" />{customerCopy.deposit}</Link>
          <Link href="/withdraw" className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 font-black text-white transition active:scale-[.98]"><ArrowDown className="h-5 w-5" />{customerCopy.withdraw}</Link>
        </div>
      </section>

      {wallet.bonusBalance > 0 && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><b>Promotional credit is separate.</b> It can be used in eligible games but cannot be withdrawn or silently converted into withdrawable credit.</p>}

      {wallet.creditRequests.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><Clock3 className="h-5 w-5 text-amber-600" />Requests</h2>
          <div className="mt-3 grid gap-2">
            {wallet.creditRequests.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{item.type === "TOP_UP" ? "Deposit" : "Withdraw"} · {formatCredits(item.amount)}</p><p className="mt-0.5 truncate text-xs text-slate-500">{item.reference} · {item.method === "EASYPAISA" ? "Easypaisa" : "JazzCash"}</p>{item.payoutTransactionId && <p className="mt-0.5 truncate font-mono text-[11px] text-emerald-700">Payout ID: {item.payoutTransactionId}</p>}</div>
                <span className={`rounded-lg px-2 py-1 text-xs font-black ${statusStyle[item.status]}`}>{statusLabel[item.status]}</span>
                {item.status === "PENDING" && item.type === "WITHDRAWAL" && <button type="button" disabled={cancelling === item.id} onClick={() => void cancel(item.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-rose-700 hover:bg-rose-50 disabled:opacity-50" aria-label={`Cancel request ${item.reference}`}><X className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-slate-950">Recent transactions</h2><Link href="/history" className="min-h-11 content-center rounded-xl px-3 text-sm font-bold text-teal-700">View all</Link></div>
        <TransactionList transactions={wallet.transactions} limit={8} />
      </section>
    </div>
  );
}
