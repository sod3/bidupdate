import { ArrowDownLeft, ArrowUpRight, Gamepad2 } from "lucide-react";
import type { WalletTransaction } from "@/context/WalletContext";
import { customerCopy, formatCredits } from "@/lib/customerCopy";

const labels: Record<WalletTransaction["type"], string> = {
  STARTING_BONUS: "Bonus",
  REFERRAL_BONUS: "Referral reward",
  ADMIN_ADJUSTMENT: "Balance update",
  RACE_ENTRY: "Game",
  RACE_REWARD: "Win",
  TOP_UP: "Deposit",
  WITHDRAWAL_RESERVE: "Withdraw",
  WITHDRAWAL_REFUND: "Refund",
};

export function TransactionList({ transactions, limit }: { transactions: WalletTransaction[]; limit?: number }) {
  const items = typeof limit === "number" ? transactions.slice(0, limit) : transactions;
  if (!items.length) {
    return <div className="py-10 text-center"><Gamepad2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">{customerCopy.noTransactions}</p></div>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => {
        const positive = item.amount >= 0;
        return (
          <div key={item.id} className="flex min-h-16 items-center gap-3 py-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${positive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
              {positive ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900">{labels[item.type]}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{item.description} · {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}{item.balanceKind === "PROMOTIONAL" ? " · Promotional" : ""}</p>
            </div>
            <p className={`whitespace-nowrap text-sm font-black tabular-nums ${positive ? "text-emerald-700" : "text-slate-900"}`}>{positive ? "+" : "−"} {formatCredits(Math.abs(item.amount))}</p>
          </div>
        );
      })}
    </div>
  );
}
