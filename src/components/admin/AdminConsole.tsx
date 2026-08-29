"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, CheckCircle2, Coins, Download,
  ExternalLink, FileCheck2, Gamepad2, Landmark, LayoutDashboard, Loader2, LogOut, RefreshCw, Search, Settings2, ShieldCheck,
  TrendingDown, TrendingUp, UserCheck, UserRoundCog, Users, WalletCards, XCircle,
} from "lucide-react";
import { PAYMENT_PROOF_ACCEPT, PAYMENT_RECEIVER_NUMBER } from "@/lib/paymentConfig";
import { PremiumGameAdmin } from "@/components/admin/PremiumGameAdmin";

type Tab = "overview" | "users" | "ledger" | "requests" | "matches" | "game-library" | "audit" | "controls";
type GameProfile = { rounds: number; wins: number; losses: number; rank?: string; rankPoints?: number; xp?: number; lastPlayedAt?: string | null } | null;
type ReviewChecks = { providerHistoryConfirmed: boolean; amountAndAccountConfirmed: boolean; proofConfirmed: boolean };

interface AdminPaymentRequest {
  id: string; reference: string; type: "TOP_UP" | "WITHDRAWAL"; amount: number; method: string;
  transactionId?: string | null; payerMobile?: string | null; recipientMobile?: string | null;
  accountTitle?: string | null; hasPaymentProof?: boolean; payoutTransactionId?: string | null;
  hasPayoutProof?: boolean; details?: Record<string, unknown>;
  verification?: ReviewChecks; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewedBy?: string | null; reviewNote?: string | null; reviewedAt?: string | null; createdAt: string;
  user: { id: string; username: string; email: string } | null;
}

interface AdminUser {
  id: string; username: string; fullName: string; email: string; country: string; dateOfBirth: string;
  status: "ACTIVE" | "SUSPENDED"; createdAt: string; lastLoginAt: string | null; lastPlayedAt: string | null;
  balance: number; reservedBalance: number; gameSpent: number; gameRewards: number; profitLoss: number; netProfit: number; netLoss: number;
  purchased: number; withdrawn: number; netFunding: number; startingCredits: number; adminNet: number;
  adminCredits: number; adminDebits: number; transactionCount: number; lastTransactionAt: string | null;
  totalWins: number; totalLosses: number; winRate: number; games: Record<string, GameProfile>;
}

interface DashboardPayload {
  generatedAt: string;
  overview: Record<string, number>;
  users: AdminUser[];
  transactions: Array<{
    id: string; user: { id: string; username: string; email: string } | null; type: string; amount: number;
    balanceBefore: number; balanceAfter: number; referenceId?: string | null; description: string;
    metadata?: Record<string, unknown>; createdAt: string;
  }>;
  requests: AdminPaymentRequest[];
  matches: Array<{
    id: string; game: string; matchId: string; tierId: string; status: string; entryCredits: number;
    possibleReward: number; winnerType: string; winner: { id: string; username: string; email: string } | null;
    players: Array<{ id: string; username: string; email: string }>; startedAt: string; finishedAt?: string | null;
  }>;
  gameTotals: Array<{ game: string; matches: number; completed: number }>;
  dailyLedger: Array<{ date: string; entries: number; rewards: number; gamingNet: number; topUps: number; adjustments: number; transactions: number }>;
  audit: Array<{
    id: string; actor: string; actorEmail?: string | null; userId?: string; action: string; targetType: string;
    targetId?: string | null; details?: Record<string, unknown>; createdAt: string;
  }>;
}

const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Command Center", icon: LayoutDashboard },
  { id: "users", label: "Real Players", icon: Users },
  { id: "ledger", label: "Money Ledger", icon: Banknote },
  { id: "requests", label: "Cash Requests", icon: Landmark },
  { id: "matches", label: "All Games", icon: Gamepad2 },
  { id: "game-library", label: "Game Library", icon: Settings2 },
  { id: "audit", label: "Audit Trail", icon: ShieldCheck },
  { id: "controls", label: "Control Policy", icon: Settings2 },
];

async function adminRequest<T = Record<string, unknown>>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Administration request failed.");
  return body;
}

function credits(value: number) {
  return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} CR`;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${credits(value)}`;
}

function when(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const csv = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, tone = "text-white", note, icon: Icon }: { label: string; value: string; tone?: string; note: string; icon: React.ElementType }) {
  return <div className="rounded-2xl border border-white/[.07] bg-[#090f18] p-4 shadow-[0_18px_55px_rgba(0,0,0,.2)]"><div className="flex items-center justify-between"><p className="text-[8px] font-black uppercase tracking-[.17em] text-slate-600">{label}</p><Icon className="h-4 w-4 text-slate-600" /></div><p className={`font-display mt-3 text-2xl font-black italic ${tone}`}>{value}</p><p className="mt-2 text-[8px] leading-4 text-slate-600">{note}</p></div>;
}

function Profit({ value }: { value: number }) {
  return <span className={`inline-flex items-center gap-1 font-black ${value > 0 ? "text-emerald-300" : value < 0 ? "text-rose-300" : "text-slate-500"}`}>{value > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : value < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}{signed(value)}</span>;
}

function SearchBar({ value, setValue, placeholder }: { value: string; setValue: (value: string) => void; placeholder: string }) {
  return <div className="relative min-w-60 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/[.07] bg-[#080d16] py-3 pl-10 pr-4 text-xs text-white outline-none focus:border-cyan-300/30" /></div>;
}

export function AdminConsole({ adminEmail }: { adminEmail: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adjustMode, setAdjustMode] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjustAmount, setAdjustAmount] = useState(1000);
  const [actionReason, setActionReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewChecks, setReviewChecks] = useState<Record<string, ReviewChecks>>({});
  const [payoutTransactionIds, setPayoutTransactionIds] = useState<Record<string, string>>({});
  const [payoutProofs, setPayoutProofs] = useState<Record<string, File | null>>({});

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError("");
    try { setData(await adminRequest<DashboardPayload>("/api/admin/dashboard")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Operations data failed."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(true), 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [load]);

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3500);
  };

  const logout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const selectedUser = data?.users.find((user) => user.id === selectedUserId) ?? null;
  const needle = search.trim().toLowerCase();
  const users = useMemo(() => (data?.users ?? []).filter((user) => (!needle || `${user.username} ${user.fullName} ${user.email} ${user.country}`.toLowerCase().includes(needle)) && (filter === "ALL" || user.status === filter)), [data, filter, needle]);
  const transactions = useMemo(() => (data?.transactions ?? []).filter((row) => (!needle || `${row.user?.username} ${row.user?.email} ${row.description} ${row.referenceId}`.toLowerCase().includes(needle)) && (filter === "ALL" || row.type === filter)), [data, filter, needle]);
  const requests = useMemo(() => (data?.requests ?? []).filter((row) => (!needle || `${row.user?.username} ${row.user?.email} ${row.reference} ${row.method} ${row.transactionId} ${row.payoutTransactionId} ${row.payerMobile} ${row.recipientMobile}`.toLowerCase().includes(needle)) && (filter === "ALL" || row.status === filter || row.type === filter)), [data, filter, needle]);
  const matches = useMemo(() => (data?.matches ?? []).filter((row) => (!needle || `${row.game} ${row.matchId} ${row.players.map((player) => player.username).join(" ")}`.toLowerCase().includes(needle)) && (filter === "ALL" || row.game === filter || row.status === filter)), [data, filter, needle]);
  const audit = useMemo(() => (data?.audit ?? []).filter((row) => !needle || `${row.actor} ${row.actorEmail} ${row.action} ${row.targetType} ${row.targetId} ${JSON.stringify(row.details)}`.toLowerCase().includes(needle)), [data, needle]);
  const chooseTab = (nextTab: Tab) => { setTab(nextTab); setSearch(""); setFilter("ALL"); };

  const adjustBalance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    setBusy(true); setError("");
    try {
      const amount = Math.abs(adjustAmount) * (adjustMode === "DEBIT" ? -1 : 1);
      await adminRequest("/api/admin/users/adjust-balance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: selectedUser.id, amount, reason: actionReason }) });
      notify(`${selectedUser.username}'s wallet was updated.`); setActionReason(""); await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Balance adjustment failed."); }
    finally { setBusy(false); }
  };

  const changeStatus = async () => {
    if (!selectedUser) return;
    setBusy(true); setError("");
    try {
      const status = selectedUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      await adminRequest(`/api/admin/users/${selectedUser.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, reason: actionReason }) });
      notify(`${selectedUser.username} is now ${status.toLowerCase()}.`); setActionReason(""); await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Status update failed."); }
    finally { setBusy(false); }
  };

  const reviewRequest = async (paymentRequest: AdminPaymentRequest, status: "APPROVED" | "REJECTED") => {
    setBusy(true); setError("");
    try {
      const checks = reviewChecks[paymentRequest.id] ?? { providerHistoryConfirmed: false, amountAndAccountConfirmed: false, proofConfirmed: false };
      const form = new FormData();
      form.set("requestId", paymentRequest.id);
      form.set("status", status);
      form.set("reviewNote", reviewNotes[paymentRequest.id] ?? "");
      form.set("providerHistoryConfirmed", String(checks.providerHistoryConfirmed));
      form.set("amountAndAccountConfirmed", String(checks.amountAndAccountConfirmed));
      form.set("proofConfirmed", String(checks.proofConfirmed));
      form.set("payoutTransactionId", payoutTransactionIds[paymentRequest.id] ?? "");
      const payoutProof = payoutProofs[paymentRequest.id];
      if (payoutProof) form.set("payoutProof", payoutProof);
      await adminRequest("/api/admin/credit-requests", { method: "PATCH", body: form });
      notify(`Request ${status.toLowerCase()}.`);
      setReviewNotes((current) => { const next = { ...current }; delete next[paymentRequest.id]; return next; });
      setReviewChecks((current) => { const next = { ...current }; delete next[paymentRequest.id]; return next; });
      setPayoutTransactionIds((current) => { const next = { ...current }; delete next[paymentRequest.id]; return next; });
      setPayoutProofs((current) => { const next = { ...current }; delete next[paymentRequest.id]; return next; });
      await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Request review failed."); }
    finally { setBusy(false); }
  };

  const setReviewCheck = (requestId: string, key: keyof ReviewChecks, value: boolean) => {
    setReviewChecks((current) => {
      const previous = current[requestId] ?? { providerHistoryConfirmed: false, amountAndAccountConfirmed: false, proofConfirmed: false };
      return { ...current, [requestId]: { ...previous, [key]: value } };
    });
  };

  if (loading || !data) return <div className="grid min-h-[65vh] place-items-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" /><p className="mt-3 text-xs text-slate-500">Loading verified player activity…</p></div></div>;

  const overview = data.overview;
  const topWinners = data.users.filter((user) => user.netProfit > 0).sort((a, b) => b.netProfit - a.netProfit).slice(0, 6);
  const topLosers = data.users.filter((user) => user.netLoss > 0).sort((a, b) => b.netLoss - a.netLoss).slice(0, 6);
  const maxTrend = Math.max(1, ...data.dailyLedger.map((row) => Math.max(row.entries, row.rewards)));

  return <div className="mx-auto max-w-[1600px] space-y-5 pb-12">
    <section className="relative overflow-hidden rounded-3xl border border-cyan-300/15 bg-[radial-gradient(circle_at_80%_0%,rgba(34,211,238,.12),transparent_32%),linear-gradient(125deg,#0b111c,#070b12)] p-5 sm:p-7"><div className="relative flex flex-wrap items-center justify-between gap-4"><div><p className="neon-eyebrow">Live financial & game operations</p><h1 className="font-display mt-1 text-3xl font-black italic text-white sm:text-4xl">PLATFORM COMMAND CENTER</h1><p className="mt-2 text-[9px] text-slate-500">{adminEmail} · refreshed {when(data.generatedAt)} · only accounts with verified game entries appear as players</p></div><div className="flex gap-2"><button onClick={() => void load()} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-slate-400" title="Refresh"><RefreshCw className="h-4 w-4" /></button><button onClick={() => void logout()} className="flex h-11 items-center gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[.05] px-4 text-[9px] font-black uppercase tracking-widest text-rose-200"><LogOut className="h-4 w-4" />Logout</button></div></div></section>
    <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => chooseTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[8px] font-black uppercase tracking-wider ${tab === item.id ? "bg-cyan-300 text-[#041117]" : "border border-white/[.06] bg-white/[.02] text-slate-500"}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div>
    {message && <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[.06] p-3 text-xs font-bold text-emerald-200">{message}</div>}
    {error && <div className="rounded-xl border border-rose-300/20 bg-rose-300/[.06] p-3 text-xs text-rose-200">{error}</div>}

    {tab === "overview" && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Real wallet liability" value={credits(overview.walletLiability)} tone="text-cyan-200" note={`${credits(overview.totalBalance)} available + ${credits(overview.totalReserved)} reserved`} icon={WalletCards} />
        <StatCard label="Credits purchased" value={credits(overview.purchased)} tone="text-emerald-300" note={`${credits(overview.pendingTopUps)} pending top-up review`} icon={ArrowDownRight} />
        <StatCard label="Approved withdrawals" value={credits(overview.withdrawn)} tone="text-amber-200" note={`${credits(overview.pendingWithdrawals)} still pending`} icon={ArrowUpRight} />
        <StatCard label="Net customer funding" value={signed(overview.netFunding)} tone={overview.netFunding >= 0 ? "text-emerald-300" : "text-rose-300"} note="Approved purchases minus approved withdrawals" icon={Landmark} />
        <StatCard label="Game entry volume" value={credits(overview.totalWagered)} note="All verified entry deductions across every game" icon={Coins} />
        <StatCard label="Rewards paid" value={credits(overview.totalWon)} tone="text-violet-200" note="All verified player victory rewards" icon={TrendingUp} />
        <StatCard label="Platform gaming net" value={signed(overview.gamingNet)} tone={overview.gamingNet >= 0 ? "text-emerald-300" : "text-rose-300"} note="Entries less rewards; excludes purchases and admin adjustments" icon={Activity} />
        <StatCard label="Players / pending" value={`${overview.users.toLocaleString()} / ${overview.pendingRequests.toLocaleString()}`} note={`${overview.activeUsers} active · ${overview.suspendedUsers} suspended · ${overview.newToday} started today`} icon={Users} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><section className="rounded-2xl border border-white/[.07] bg-[#090f18] p-5"><p className="text-xs font-black text-white">14-day entry and reward movement</p><p className="mt-1 text-[8px] text-slate-600">Calculated directly from wallet ledger timestamps</p><div className="mt-6 flex h-44 items-end gap-2">{data.dailyLedger.length ? data.dailyLedger.map((row) => <div key={row.date} className="flex min-w-0 flex-1 items-end justify-center gap-1" title={`${row.date}: ${credits(row.entries)} entries, ${credits(row.rewards)} rewards`}><div className="w-2 rounded-t bg-cyan-300/75" style={{ height: `${Math.max(3, row.entries / maxTrend * 100)}%` }} /><div className="w-2 rounded-t bg-violet-400/70" style={{ height: `${Math.max(3, row.rewards / maxTrend * 100)}%` }} /></div>) : <div className="grid w-full place-items-center text-xs text-slate-600">No ledger movement yet</div>}</div><div className="mt-4 flex gap-5 text-[8px] text-slate-500"><span>■ <b className="text-cyan-300">Entries</b></span><span>■ <b className="text-violet-300">Rewards</b></span></div></section><section className="rounded-2xl border border-white/[.07] bg-[#090f18] p-5"><p className="text-xs font-black text-white">Game completion health</p><div className="mt-4 space-y-4">{data.gameTotals.map((game) => { const rate = game.matches ? Math.round(game.completed / game.matches * 100) : 0; return <div key={game.game}><div className="flex justify-between text-[9px]"><b className="text-slate-300">{game.game}</b><span className="text-slate-600">{game.completed}/{game.matches} · {rate}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300" style={{ width: `${rate}%` }} /></div></div>; })}</div></section></div>
      <div className="grid gap-4 lg:grid-cols-2"><Ranking title="Highest player profit" users={topWinners} tone="profit" open={(id) => { setSelectedUserId(id); chooseTab("users"); }} /><Ranking title="Highest player loss" users={topLosers} tone="loss" open={(id) => { setSelectedUserId(id); chooseTab("users"); }} /></div>
    </div>}

    {tab === "users" && <div className="grid gap-4 xl:grid-cols-[1fr_390px]"><section className="min-w-0 space-y-3"><div className="flex flex-wrap gap-2"><SearchBar value={search} setValue={setSearch} placeholder="Search real players by name, email or country" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-white/[.07] bg-[#080d16] px-3 text-xs text-slate-300"><option value="ALL">All real players</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select><button onClick={() => downloadCsv("real-player-financial-report", users.map((user) => ({ username: user.username, email: user.email, status: user.status, lastLogin: user.lastLoginAt, lastPlayed: user.lastPlayedAt, balance: user.balance, wagered: user.gameSpent, earnings: user.gameRewards, netLoss: user.netLoss, netProfit: user.netProfit, wins: user.totalWins, losses: user.totalLosses })))} className="rounded-xl border border-white/[.07] px-3 text-slate-400" title="Download real-player earnings report"><Download className="h-4 w-4" /></button></div><UserTable users={users} selectedUserId={selectedUserId} select={setSelectedUserId} /></section><UserPanel user={selectedUser} busy={busy} mode={adjustMode} setMode={setAdjustMode} amount={adjustAmount} setAmount={setAdjustAmount} reason={actionReason} setReason={setActionReason} adjust={adjustBalance} status={() => void changeStatus()} /></div>}

    {tab === "ledger" && <section className="space-y-3"><div className="flex flex-wrap gap-2"><SearchBar value={search} setValue={setSearch} placeholder="Search user, description or reference" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-white/[.07] bg-[#080d16] px-3 text-xs text-slate-300"><option value="ALL">All ledger types</option>{Array.from(new Set(data.transactions.map((row) => row.type))).map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select><button onClick={() => downloadCsv("wallet-ledger", transactions.map((row) => ({ timestamp: row.createdAt, username: row.user?.username, email: row.user?.email, type: row.type, amount: row.amount, before: row.balanceBefore, after: row.balanceAfter, reference: row.referenceId, description: row.description })))} className="inline-flex items-center gap-2 rounded-xl border border-white/[.07] px-4 text-[8px] font-black uppercase text-slate-400"><Download className="h-4 w-4" />CSV</button></div><LedgerTable rows={transactions} /><p className="text-[8px] text-slate-600">Latest 250 attributable ledger entries. Simulated leaderboard balances are not stored here.</p></section>}

    {tab === "requests" && (
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <SearchBar value={search} setValue={setSearch} placeholder="Search request, username, email or transaction ID" />
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-white/[.07] bg-[#080d16] px-3 text-xs text-slate-300">
            <option value="ALL">All requests</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option><option value="TOP_UP">Top-ups</option><option value="WITHDRAWAL">Withdrawals</option>
          </select>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {requests.map((request) => (
            <PaymentRequestCard
              key={request.id}
              request={request}
              busy={busy}
              reviewNote={reviewNotes[request.id] ?? ""}
              setReviewNote={(value) => setReviewNotes((current) => ({ ...current, [request.id]: value }))}
              checks={reviewChecks[request.id] ?? { providerHistoryConfirmed: false, amountAndAccountConfirmed: false, proofConfirmed: false }}
              setCheck={(key, value) => setReviewCheck(request.id, key, value)}
              payoutTransactionId={payoutTransactionIds[request.id] ?? ""}
              setPayoutTransactionId={(value) => setPayoutTransactionIds((current) => ({ ...current, [request.id]: value }))}
              payoutProof={payoutProofs[request.id] ?? null}
              setPayoutProof={(value) => setPayoutProofs((current) => ({ ...current, [request.id]: value }))}
              review={(status) => void reviewRequest(request, status)}
            />
          ))}
        </div>
      </section>
    )}

    {tab === "matches" && <section className="space-y-3"><div className="flex flex-wrap gap-2"><SearchBar value={search} setValue={setSearch} placeholder="Search match id, game or player" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-white/[.07] bg-[#080d16] px-3 text-xs text-slate-300"><option value="ALL">All games / states</option>{data.gameTotals.map((row) => <option key={row.game} value={row.game}>{row.game}</option>)}<option value="COMPLETED">Completed</option><option value="PLAYING">Playing</option><option value="ABANDONED">Abandoned</option></select></div><MatchTable rows={matches} /></section>}

    {tab === "game-library" && <PremiumGameAdmin />}

    {tab === "audit" && <section className="space-y-3"><SearchBar value={search} setValue={setSearch} placeholder="Search actor, action, target or details" /><div className="space-y-2">{audit.map((row) => <div key={row.id} className="grid gap-2 rounded-xl border border-white/[.06] bg-[#090f18] p-4 md:grid-cols-[150px_190px_1fr_180px]"><span className="text-[8px] text-slate-600">{when(row.createdAt)}</span><span><b className="block text-[9px] text-cyan-200">{row.actor} · {row.actorEmail || "system"}</b><small className="text-[7px] text-slate-600">{row.targetType} {row.targetId}</small></span><span className="text-[9px] font-black text-white">{row.action.replaceAll("_", " ")}</span><code className="max-h-12 overflow-auto text-[7px] text-slate-600">{JSON.stringify(row.details)}</code></div>)}</div><p className="text-[8px] text-slate-600">Latest 250 privileged and value-moving audit events. Wallet transactions remain in the separate ledger.</p></section>}

    {tab === "controls" && <div className="grid gap-4 lg:grid-cols-2"><PolicyCard icon={ShieldCheck} title="Audited controls available" tone="text-emerald-300" items={["Credit or debit a wallet with a required reason", "Suspend or reactivate accounts", "Approve or reject top-ups and withdrawals", "Inspect per-user and platform-wide financial performance", "Export filtered user and ledger reports"]} /><PolicyCard icon={AlertTriangle} title="Outcome manipulation disabled" tone="text-amber-200" items={["No per-user win-more or lose-more setting", "No forced winner selection", "The same server validation applies to every account", "Every game result remains attributable to verified gameplay", "Operational adjustments stay separate from game outcomes"]} /></div>}
  </div>;
}

function PaymentRequestCard({
  request,
  busy,
  reviewNote,
  setReviewNote,
  checks,
  setCheck,
  payoutTransactionId,
  setPayoutTransactionId,
  payoutProof,
  setPayoutProof,
  review,
}: {
  request: AdminPaymentRequest;
  busy: boolean;
  reviewNote: string;
  setReviewNote: (value: string) => void;
  checks: ReviewChecks;
  setCheck: (key: keyof ReviewChecks, value: boolean) => void;
  payoutTransactionId: string;
  setPayoutTransactionId: (value: string) => void;
  payoutProof: File | null;
  setPayoutProof: (value: File | null) => void;
  review: (status: "APPROVED" | "REJECTED") => void;
}) {
  const isDeposit = request.type === "TOP_UP";
  const allChecked = checks.providerHistoryConfirmed && checks.amountAndAccountConfirmed && checks.proofConfirmed;
  const payoutReady = isDeposit || (payoutTransactionId.trim().replace(/\s+/g, "").length >= 6 && Boolean(payoutProof));
  const verificationLabels: Record<keyof ReviewChecks, string> = isDeposit ? {
    providerHistoryConfirmed: `Transaction is present in the real ${request.method} account history`,
    amountAndAccountConfirmed: `${credits(request.amount)} and recipient ${PAYMENT_RECEIVER_NUMBER} both match`,
    proofConfirmed: "Receipt, transaction ID, sender and provider record all match",
  } : {
    providerHistoryConfirmed: `Payout is completed in the real ${request.method} account history`,
    amountAndAccountConfirmed: `${credits(request.amount)} and the recipient wallet both match`,
    proofConfirmed: "Payout receipt and provider transaction ID match",
  };

  return (
    <article className={`rounded-2xl border p-4 ${request.status === "PENDING" ? "border-amber-300/15 bg-amber-300/[.025]" : "border-white/[.07] bg-[#090f18]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[8px] font-black uppercase tracking-widest text-cyan-300">{request.reference}</p>
          <h3 className="mt-1 text-sm font-black text-white">{request.user?.username ?? "Unknown"} · {credits(request.amount)}</h3>
          <p className="mt-1 text-[8px] text-slate-600">{request.user?.email} · {request.type.replace("_", " ")} · {when(request.createdAt)}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[8px] font-black ${request.status === "PENDING" ? "bg-amber-300/10 text-amber-200" : request.status === "APPROVED" ? "bg-emerald-300/10 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>{request.status}</span>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl bg-black/20 p-3 text-[9px] sm:grid-cols-2">
        <p><span className="block text-[7px] uppercase tracking-widest text-slate-600">Provider</span><b className="mt-1 block text-white">{request.method}</b></p>
        {isDeposit ? (
          <>
            <p><span className="block text-[7px] uppercase tracking-widest text-slate-600">Paid from</span><b className="mt-1 block text-white">{request.payerMobile || "Missing"}</b></p>
            <p><span className="block text-[7px] uppercase tracking-widest text-slate-600">Transaction ID</span><b className="mt-1 block break-all font-mono text-amber-200">{request.transactionId || "Missing"}</b></p>
            <p><span className="block text-[7px] uppercase tracking-widest text-slate-600">Deposit receipt</span>{request.hasPaymentProof ? <a href={`/api/admin/credit-requests/${request.id}/proof`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-black text-cyan-200"><ExternalLink className="h-3.5 w-3.5" />Open protected receipt</a> : <b className="mt-1 block text-rose-300">Missing</b>}</p>
          </>
        ) : (
          <>
            <p><span className="block text-[7px] uppercase tracking-widest text-slate-600">Account title</span><b className="mt-1 block text-white">{request.accountTitle || "Missing"}</b></p>
            <p><span className="block text-[7px] uppercase tracking-widest text-slate-600">Receiving wallet</span><b className="mt-1 block text-amber-200">{request.recipientMobile || "Missing"}</b></p>
            <p><span className="block text-[7px] uppercase tracking-widest text-slate-600">Payout transaction ID</span><b className="mt-1 block break-all font-mono text-white">{request.payoutTransactionId || "Not paid yet"}</b></p>
          </>
        )}
      </div>

      <div className="mt-2 rounded-xl bg-black/20 p-3">
        <p className="text-[7px] uppercase tracking-widest text-slate-600">User note</p>
        <p className="mt-1 text-[10px] text-slate-300">{String(request.details?.note || "No note provided")}</p>
      </div>

      {request.status === "PENDING" ? (
        <div className="mt-3 space-y-3">
          {!isDeposit && (
            <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[.025] p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-cyan-200">Record payout before approval</p>
              <input value={payoutTransactionId} onChange={(event) => setPayoutTransactionId(event.target.value)} maxLength={80} placeholder="Provider payout transaction ID" className="mt-2 w-full rounded-xl border border-white/[.07] bg-black/20 p-3 font-mono text-xs uppercase text-white" />
              <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/[.12] p-3 text-[9px] text-slate-400">
                <FileCheck2 className="h-4 w-4 text-cyan-200" />
                <span className="min-w-0 flex-1 truncate">{payoutProof?.name ?? "Upload payout receipt (JPG, PNG, or WebP; max 4 MB)"}</span>
                <input type="file" accept={PAYMENT_PROOF_ACCEPT} className="sr-only" onChange={(event) => setPayoutProof(event.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}

          <fieldset className="rounded-xl border border-amber-300/10 bg-amber-300/[.02] p-3">
            <legend className="px-1 text-[8px] font-black uppercase tracking-widest text-amber-200">Required verification</legend>
            <div className="space-y-2">
              {(Object.keys(verificationLabels) as Array<keyof ReviewChecks>).map((key) => (
                <label key={key} className="flex cursor-pointer items-start gap-2 text-[9px] leading-4 text-slate-300">
                  <input type="checkbox" checked={checks[key]} onChange={(event) => setCheck(key, event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-400" />
                  <span>{verificationLabels[key]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={240} placeholder="Review note (optional)" className="w-full rounded-xl border border-white/[.07] bg-black/20 p-3 text-xs text-white" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || !allChecked || !payoutReady} onClick={() => review("APPROVED")} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-300 py-2.5 text-[8px] font-black uppercase text-[#04120c] disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-4 w-4" />{isDeposit ? "Approve credit" : "Mark paid"}</button>
            <button type="button" disabled={busy} onClick={() => review("REJECTED")} className="flex items-center justify-center gap-2 rounded-xl bg-rose-300 py-2.5 text-[8px] font-black uppercase text-[#170609] disabled:opacity-40"><XCircle className="h-4 w-4" />Reject</button>
          </div>
          {!allChecked || !payoutReady ? <p className="text-[8px] leading-4 text-amber-200">Approval stays locked until every verification item{isDeposit ? " is confirmed." : ", payout ID, and payout receipt are present."}</p> : null}
        </div>
      ) : (
        <div className="mt-3 text-[8px] leading-4 text-slate-600">
          <p>Reviewed by {request.reviewedBy || "system"} at {when(request.reviewedAt)}{request.reviewNote ? ` · ${request.reviewNote}` : ""}</p>
          {request.hasPayoutProof && <a href={`/api/admin/credit-requests/${request.id}/proof?kind=payout`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-black text-cyan-200"><ExternalLink className="h-3.5 w-3.5" />Open protected payout receipt</a>}
        </div>
      )}
    </article>
  );
}

function Ranking({ title, users, tone, open }: { title: string; users: AdminUser[]; tone: "profit" | "loss"; open: (id: string) => void }) {
  return <section className={`rounded-2xl border p-5 ${tone === "profit" ? "border-emerald-300/10 bg-emerald-300/[.025]" : "border-rose-300/10 bg-rose-300/[.025]"}`}><p className="flex items-center gap-2 text-xs font-black text-white">{tone === "profit" ? <TrendingUp className="h-4 w-4 text-emerald-300" /> : <TrendingDown className="h-4 w-4 text-rose-300" />}{title}</p><div className="mt-3 space-y-2">{users.map((user, index) => <button key={user.id} onClick={() => open(user.id)} className="grid w-full grid-cols-[28px_1fr_auto] items-center rounded-xl border border-white/[.05] p-3 text-left"><span className="text-[9px] font-black text-slate-600">#{index + 1}</span><span><b className="block text-[10px] text-white">{user.username}</b><small className="text-[8px] text-slate-600">{user.totalWins}W / {user.totalLosses}L · earned {credits(user.gameRewards)}</small></span><Profit value={user.profitLoss} /></button>)}{!users.length && <p className="rounded-xl border border-white/[.05] p-4 text-center text-[9px] text-slate-600">No verified player {tone === "profit" ? "profits" : "losses"} yet.</p>}</div></section>;
}

function UserTable({ users, selectedUserId, select }: { users: AdminUser[]; selectedUserId: string | null; select: (id: string) => void }) {
  return <div className="overflow-x-auto rounded-2xl border border-white/[.07] bg-[#080d16]"><table className="w-full min-w-[1150px] text-left"><thead className="border-b border-white/[.06] text-[8px] uppercase tracking-widest text-slate-600"><tr>{["Real player", "Earnings", "Net losses", "Net profit", "Win / loss record", "Last played", "Wallet", "Status", ""].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{users.map((user) => <tr key={user.id} className={`border-b border-white/[.045] text-[10px] last:border-0 ${selectedUserId === user.id ? "bg-cyan-300/[.04]" : ""}`}><td className="px-4 py-3"><b className="block text-white">{user.username}</b><span className="text-[8px] text-slate-600">{user.email}<br />{user.fullName} · {user.country}</span></td><td className="px-4 py-3"><b className="text-violet-200">{credits(user.gameRewards)}</b><span className="block text-[8px] text-slate-600">from {credits(user.gameSpent)} wagered</span></td><td className="px-4 py-3"><b className={user.netLoss > 0 ? "text-rose-300" : "text-slate-500"}>{credits(user.netLoss)}</b></td><td className="px-4 py-3"><b className={user.netProfit > 0 ? "text-emerald-300" : "text-slate-500"}>{credits(user.netProfit)}</b></td><td className="px-4 py-3"><b className="text-white">{user.totalWins}W / {user.totalLosses}L</b><span className="block text-[8px] text-slate-600">{user.winRate}% win rate</span></td><td className="px-4 py-3"><b className="text-cyan-200">{when(user.lastPlayedAt)}</b><span className="block text-[8px] text-slate-600">login {when(user.lastLoginAt)}</span></td><td className="px-4 py-3"><b className="text-cyan-200">{credits(user.balance)}</b><span className="block text-[8px] text-slate-600">{credits(user.reservedBalance)} reserved</span></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[8px] font-black ${user.status === "ACTIVE" ? "bg-emerald-300/10 text-emerald-300" : "bg-rose-300/10 text-rose-300"}`}>{user.status}</span></td><td className="px-4 py-3"><button onClick={() => select(user.id)} className="rounded-lg border border-cyan-300/15 px-3 py-2 text-[8px] font-black uppercase text-cyan-200">Manage</button></td></tr>)}{!users.length && <tr><td colSpan={9} className="px-4 py-12 text-center text-xs text-slate-600">No authenticated players with verified gameplay found.</td></tr>}</tbody></table></div>;
}

function UserPanel({ user, busy, mode, setMode, amount, setAmount, reason, setReason, adjust, status }: { user: AdminUser | null; busy: boolean; mode: "CREDIT" | "DEBIT"; setMode: (mode: "CREDIT" | "DEBIT") => void; amount: number; setAmount: (amount: number) => void; reason: string; setReason: (reason: string) => void; adjust: (event: React.FormEvent) => void; status: () => void }) {
  return <aside className="h-fit rounded-2xl border border-white/[.08] bg-[#090f18] p-5 xl:sticky xl:top-20">{user ? <div><div className="flex items-start justify-between"><div><p className="text-[8px] font-black uppercase tracking-widest text-cyan-300">Verified player profile</p><h2 className="font-display mt-1 text-2xl font-black italic text-white">{user.username}</h2><p className="text-[9px] text-slate-600">{user.email} · joined {when(user.createdAt)}</p></div><UserRoundCog className="h-5 w-5 text-violet-300" /></div><div className="mt-4 grid grid-cols-2 gap-2">{[["Wallet", credits(user.balance)], ["Earnings", credits(user.gameRewards)], ["Net loss", credits(user.netLoss)], ["Net profit", credits(user.netProfit)], ["Wagered", credits(user.gameSpent)], ["Last played", when(user.lastPlayedAt)], ["Last login", when(user.lastLoginAt)], ["Transactions", user.transactionCount.toLocaleString()]].map(([label, row]) => <div key={label} className="rounded-xl border border-white/[.05] p-3"><p className="text-[7px] uppercase tracking-widest text-slate-600">{label}</p><p className="mt-1 text-[10px] font-black text-white">{row}</p></div>)}</div><p className="mt-4 text-[8px] font-black uppercase tracking-widest text-slate-500">Performance by game</p><div className="mt-2 space-y-1.5">{Object.entries(user.games).map(([game, profile]) => <div key={game} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-[8px]"><b className="capitalize text-slate-300">{game}</b><span className="text-slate-500">{profile ? `${profile.wins}W / ${profile.losses}L · ${profile.rank ?? `${profile.rounds} rounds`}` : "No play"}</span></div>)}</div><form onSubmit={adjust} className="mt-5 border-t border-white/[.06] pt-4"><p className="text-[9px] font-black text-white">Audited wallet adjustment</p><div className="mt-3 grid grid-cols-2 gap-2">{(["CREDIT", "DEBIT"] as const).map((item) => <button type="button" key={item} onClick={() => setMode(item)} className={`rounded-lg py-2 text-[8px] font-black ${mode === item ? item === "CREDIT" ? "bg-emerald-300 text-[#05120c]" : "bg-rose-300 text-[#190609]" : "border border-white/[.06] text-slate-500"}`}>{item}</button>)}</div><input type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/[.07] bg-black/20 p-3 text-xs text-white" /><textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={240} rows={2} placeholder="Required audit reason" className="mt-2 w-full resize-none rounded-xl border border-white/[.07] bg-black/20 p-3 text-xs text-white" /><button disabled={busy} className={`mt-2 w-full rounded-xl py-3 text-[9px] font-black uppercase ${mode === "CREDIT" ? "bg-emerald-300 text-[#05120c]" : "bg-rose-300 text-[#190609]"}`}>{busy ? "Saving…" : `${mode} ${credits(amount)}`}</button><button type="button" disabled={busy || reason.trim().length < 3} onClick={status} className="mt-2 w-full rounded-xl border border-amber-300/15 py-3 text-[9px] font-black uppercase text-amber-200">{user.status === "ACTIVE" ? "Suspend account" : "Reactivate account"}</button></form><div className="mt-4 rounded-xl border border-cyan-300/10 bg-cyan-300/[.03] p-3"><p className="text-[8px] leading-4 text-slate-500">Changes record administrator, target, amount, reason, timestamp and resulting balance. Game outcomes stay gameplay-controlled.</p></div></div> : <div className="py-12 text-center"><UserCheck className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 text-xs text-slate-500">Select a real player to inspect verified earnings and results.</p></div>}</aside>;
}

function LedgerTable({ rows }: { rows: DashboardPayload["transactions"] }) {
  return <div className="overflow-x-auto rounded-2xl border border-white/[.07] bg-[#080d16]"><table className="w-full min-w-[1000px] text-left"><thead className="border-b border-white/[.06] text-[8px] uppercase tracking-widest text-slate-600"><tr>{["Timestamp", "User", "Type / description", "Amount", "Before", "After", "Reference"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-white/[.045] text-[9px] last:border-0"><td className="px-4 py-3 text-slate-500">{when(row.createdAt)}</td><td className="px-4 py-3"><b className="text-white">{row.user?.username ?? "Unknown"}</b><span className="block text-[8px] text-slate-600">{row.user?.email}</span></td><td className="px-4 py-3"><b className="text-cyan-200">{row.type.replaceAll("_", " ")}</b><span className="block max-w-xs truncate text-[8px] text-slate-500">{row.description}</span></td><td className={`px-4 py-3 font-black ${row.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{signed(row.amount)}</td><td className="px-4 py-3 text-slate-400">{credits(row.balanceBefore)}</td><td className="px-4 py-3 text-white">{credits(row.balanceAfter)}</td><td className="px-4 py-3 font-mono text-[8px] text-slate-600">{row.referenceId || "—"}</td></tr>)}</tbody></table></div>;
}

function MatchTable({ rows }: { rows: DashboardPayload["matches"] }) {
  return <div className="overflow-x-auto rounded-2xl border border-white/[.07] bg-[#080d16]"><table className="w-full min-w-[1050px] text-left"><thead className="border-b border-white/[.06] text-[8px] uppercase tracking-widest text-slate-600"><tr>{["Game / match", "Player", "Winner", "Entry", "Possible reward", "Platform exposure", "Status / time"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{rows.map((match) => <tr key={`${match.game}:${match.id}`} className="border-b border-white/[.045] text-[9px] last:border-0"><td className="px-4 py-3"><b className="text-white">{match.game}</b><span className="block font-mono text-[8px] text-slate-600">{match.matchId}</span></td><td className="px-4 py-3 text-slate-300">{match.players.map((player) => player.username).join(", ") || "Unknown"}</td><td className="px-4 py-3"><b className={match.winnerType === "PLAYER" ? "text-emerald-300" : "text-violet-300"}>{match.winner?.username ?? match.winnerType}</b></td><td className="px-4 py-3 text-rose-300">{credits(match.entryCredits)}</td><td className="px-4 py-3 text-violet-200">{credits(match.possibleReward)}</td><td className="px-4 py-3"><Profit value={match.winnerType === "PLAYER" ? match.entryCredits - match.possibleReward : match.entryCredits} /></td><td className="px-4 py-3"><b className="text-cyan-200">{match.status}</b><span className="block text-[8px] text-slate-600">{when(match.finishedAt || match.startedAt)}</span></td></tr>)}</tbody></table></div>;
}

function PolicyCard({ icon: Icon, title, tone, items }: { icon: React.ElementType; title: string; tone: string; items: string[] }) {
  return <section className="rounded-2xl border border-white/[.07] bg-[#090f18] p-5"><p className="flex items-center gap-2 text-xs font-black text-white"><Icon className={`h-5 w-5 ${tone}`} />{title}</p><div className="mt-4 space-y-2">{items.map((item) => <p key={item} className="flex gap-2 rounded-xl bg-black/20 p-3 text-[9px] leading-5 text-slate-400"><span className={tone}>●</span>{item}</p>)}</div></section>;
}
