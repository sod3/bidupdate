"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, Save, ShieldCheck, Wrench } from "lucide-react";

interface GameControl {
  gameId: string; title: string; artwork: string; enabled: boolean; maintenanceMode: boolean; minStake: number; maxStake: number;
  chipDenominations: number[]; updatedAt?: string | null; updatedBy?: string | null; probabilityNote: string;
}

interface PremiumAdminPayload {
  games: GameControl[];
  rounds?: Array<{ id: string; roundId: string; gameId: string; user?: { username?: string; email?: string }; status: string; result: string; stake: number; payout: number; commitment: string; resultHash?: string | null; startedAt: string; completedAt?: string | null }>;
  stats?: Array<{ gameId: string; players: number; rounds: number; wins: number; totalStaked: number; totalPaid: number }>;
  fraudFlags?: Array<{ id: string; gameId?: string; roundId?: string; code: string; severity: string; status: string }>;
  rngRounds?: Array<{ id: string; roundId: string; gameId: string; version: string; commitment: string; resultHash?: string | null; revealedAt?: string | null }>;
}

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Game administration request failed.");
  return payload;
}

function credits(value: number) { return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} CR`; }

export function PremiumGameAdmin() {
  const [payload, setPayload] = useState<PremiumAdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try { setPayload(await request<PremiumAdminPayload>("/api/admin/premium-games")); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load premium games."); }
  };
  useEffect(() => { void Promise.resolve().then(load); }, []);

  const update = (gameId: string, game: GameControl) => setPayload((current) => current ? { ...current, games: current.games.map((row) => row.gameId === gameId ? game : row) } : current);
  const save = async (game: GameControl) => {
    setBusy(game.gameId); setError(null); setSaved(null);
    try {
      const response = await request<PremiumAdminPayload>("/api/admin/premium-games", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(game) });
      setPayload((current) => current ? { ...current, games: response.games } : response);
      setSaved(`${game.title} settings saved and audited.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save game settings."); }
    finally { setBusy(null); }
  };

  if (!payload) return <div className="grid min-h-64 place-items-center"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-cyan-300" /><p className="mt-3 text-xs text-slate-500">Loading game operations…</p>{error && <p className="mt-2 text-rose-300">{error}</p>}</div></div>;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Premium games" value={String(payload.games.length)} note={`${payload.games.filter((game) => game.enabled && !game.maintenanceMode).length} available now`} />
      <Metric label="Recorded rounds" value={String(payload.stats?.reduce((sum, row) => sum + row.rounds, 0) ?? 0)} note="Immutable server-settled rounds" />
      <Metric label="Open fraud flags" value={String(payload.fraudFlags?.length ?? 0)} note="No outcome-control capability" warning={Boolean(payload.fraudFlags?.length)} />
      <Metric label="RNG audit records" value={String(payload.rngRounds?.length ?? 0)} note="Latest commitments and result hashes" />
    </div>
    {saved && <div className="flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[.05] p-3 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4" />{saved}</div>}
    {error && <div className="flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.05] p-3 text-xs text-rose-200"><AlertTriangle className="h-4 w-4" />{error}</div>}
    <section><div className="mb-3"><p className="text-xs font-black text-white">Game availability & stakes</p><p className="mt-1 text-[8px] text-slate-600">Settings affect new rounds only. Existing committed rounds always restore unchanged.</p></div><div className="grid gap-4 xl:grid-cols-2">{payload.games.map((game) => <GameControlCard key={game.gameId} game={game} busy={busy === game.gameId} update={(next) => update(game.gameId, next)} save={() => void save(game)} />)}</div></section>
    <section className="rounded-2xl border border-white/[.07] bg-[#090f18] p-5"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-cyan-300" /><p className="text-xs font-black text-white">Aggregate premium-game statistics</p></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[9px]"><thead className="text-[7px] uppercase tracking-widest text-slate-600"><tr>{["Game","Players","Rounds","Wins","Staked","Paid","Platform net"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{(payload.stats ?? []).map((row) => <tr key={row.gameId} className="border-t border-white/[.05]"><td className="px-3 py-3 font-black text-white">{row.gameId}</td><td className="px-3 text-slate-400">{row.players}</td><td className="px-3 text-slate-400">{row.rounds}</td><td className="px-3 text-emerald-300">{row.wins}</td><td className="px-3 text-rose-300">{credits(row.totalStaked)}</td><td className="px-3 text-violet-200">{credits(row.totalPaid)}</td><td className="px-3 font-black text-cyan-200">{credits(row.totalStaked - row.totalPaid)}</td></tr>)}</tbody></table></div></section>
    <section className="rounded-2xl border border-white/[.07] bg-[#090f18] p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><p className="text-xs font-black text-white">Latest committed rounds</p></div><div className="mt-4 max-h-[420px] overflow-auto"><table className="w-full min-w-[950px] text-left text-[8px]"><thead className="sticky top-0 bg-[#090f18] text-[7px] uppercase tracking-widest text-slate-600"><tr>{["Time","Game / round","Player","Result","Stake","Payout","RNG commitment"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{(payload.rounds ?? []).map((round) => <tr key={round.id} className="border-t border-white/[.05]"><td className="px-3 py-3 text-slate-600">{new Date(round.completedAt || round.startedAt).toLocaleString()}</td><td className="px-3"><b className="block text-white">{round.gameId}</b><code className="text-[6px] text-slate-600">{round.roundId.slice(0,28)}…</code></td><td className="px-3 text-slate-400">{round.user?.username ?? "Unknown"}</td><td className="px-3 font-black text-cyan-200">{round.status} · {round.result}</td><td className="px-3 text-rose-300">{credits(round.stake)}</td><td className="px-3 text-violet-200">{credits(round.payout)}</td><td className="px-3"><code className="text-[6px] text-slate-600">{round.commitment.slice(0,30)}…</code></td></tr>)}</tbody></table></div></section>
  </div>;
}

function Metric({ label, value, note, warning = false }: { label: string; value: string; note: string; warning?: boolean }) { return <div className={`rounded-2xl border p-4 ${warning ? "border-amber-300/15 bg-amber-300/[.035]" : "border-white/[.07] bg-[#090f18]"}`}><p className="text-[7px] font-black uppercase tracking-widest text-slate-600">{label}</p><p className={`mt-2 text-2xl font-black ${warning ? "text-amber-200" : "text-white"}`}>{value}</p><p className="mt-1 text-[7px] text-slate-600">{note}</p></div>; }

function GameControlCard({ game, busy, update, save }: { game: GameControl; busy: boolean; update: (game: GameControl) => void; save: () => void }) {
  const chips = game.chipDenominations.join(", ");
  return <article className="overflow-hidden rounded-2xl border border-white/[.08] bg-[#090f18]"><div className="grid grid-cols-[120px_1fr] gap-4 p-4"><Image src={game.artwork} alt="" width={480} height={360} unoptimized className="aspect-[4/3] w-full rounded-xl object-cover" /><div className="min-w-0"><p className="text-[7px] font-black uppercase tracking-widest text-cyan-300">{game.gameId}</p><h3 className="mt-1 text-lg font-black text-white">{game.title}</h3><p className="mt-2 line-clamp-2 text-[7px] leading-3 text-slate-600">{game.probabilityNote}</p><div className="mt-3 flex gap-2"><label className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[7px] font-black ${game.enabled ? "border-emerald-300/20 text-emerald-300" : "border-rose-300/20 text-rose-300"}`}><input type="checkbox" checked={game.enabled} onChange={(event) => update({ ...game, enabled: event.target.checked })} />ENABLED</label><label className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[7px] font-black ${game.maintenanceMode ? "border-amber-300/20 text-amber-200" : "border-white/[.07] text-slate-500"}`}><input type="checkbox" checked={game.maintenanceMode} onChange={(event) => update({ ...game, maintenanceMode: event.target.checked })} /><Wrench className="h-3 w-3" />MAINTENANCE</label></div></div></div><div className="grid gap-3 border-t border-white/[.06] p-4 sm:grid-cols-2"><label className="text-[7px] font-black uppercase tracking-widest text-slate-600">Minimum stake<input type="number" min="1" max="5000" value={game.minStake} onChange={(event) => update({ ...game, minStake: Number(event.target.value) })} className="mt-1 block w-full rounded-lg border border-white/[.07] bg-black/20 p-2 text-xs text-white" /></label><label className="text-[7px] font-black uppercase tracking-widest text-slate-600">Maximum stake<input type="number" min="1" max="5000" value={game.maxStake} onChange={(event) => update({ ...game, maxStake: Number(event.target.value) })} className="mt-1 block w-full rounded-lg border border-white/[.07] bg-black/20 p-2 text-xs text-white" /></label><label className="text-[7px] font-black uppercase tracking-widest text-slate-600 sm:col-span-2">Chip denominations<input value={chips} onChange={(event) => update({ ...game, chipDenominations: event.target.value.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0) })} className="mt-1 block w-full rounded-lg border border-white/[.07] bg-black/20 p-2 text-xs text-white" /></label><label className="text-[7px] font-black uppercase tracking-widest text-slate-600 sm:col-span-2">Artwork path<input value={game.artwork} onChange={(event) => update({ ...game, artwork: event.target.value })} className="mt-1 block w-full rounded-lg border border-white/[.07] bg-black/20 p-2 font-mono text-[9px] text-white" /></label><button onClick={save} disabled={busy} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-300 text-[8px] font-black uppercase text-[#031116] sm:col-span-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save audited settings</button></div></article>;
}
