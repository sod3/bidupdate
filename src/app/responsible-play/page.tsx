"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Loader2, PauseCircle, ShieldCheck } from "lucide-react";
import { useWallet } from "@/context/WalletContext";

interface Settings { sessionTimerMinutes: number; dailyLossLimit: number | null; weeklyLossLimit: number | null; coolingOffUntil: string | null; selfExcludedUntil: string | null }
const defaults: Settings = { sessionTimerMinutes: 60, dailyLossLimit: null, weeklyLossLimit: null, coolingOffUntil: null, selfExcludedUntil: null };

async function api<T>(method: string, body?: Record<string, unknown>) {
  const response = await fetch("/api/responsible-play", { method, headers: body ? { "Content-Type": "application/json" } : undefined, credentials: "same-origin", cache: "no-store", body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request could not be completed.");
  return payload;
}

export default function ResponsiblePlayPage() {
  const { user } = useWallet();
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user.role !== "USER") return;
    void api<{ responsiblePlay: Settings }>("GET")
      .then((payload) => setSettings({ ...defaults, ...payload.responsiblePlay }))
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, [user.role]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      const payload = await api<{ responsiblePlay: Settings }>("PUT", { sessionTimerMinutes: settings.sessionTimerMinutes, dailyLossLimit: settings.dailyLossLimit, weeklyLossLimit: settings.weeklyLossLimit });
      setSettings({ ...defaults, ...payload.responsiblePlay }); setMessage("Controls saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Controls could not be saved."); }
    finally { setBusy(false); }
  };

  const pause = async (durationHours: 24 | 168 | 720) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const payload = await api<{ responsiblePlay: Settings }>("POST", { durationHours });
      setSettings({ ...defaults, ...payload.responsiblePlay }); setMessage("Cooling-off period is active and cannot be shortened.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Break could not be started."); }
    finally { setBusy(false); }
  };

  if (user.role !== "USER") return <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-emerald-700" /><h1 className="mt-4 text-2xl font-black">Responsible Play</h1><p className="mt-2 text-sm text-slate-500">Log in to set reminders, limits, and breaks.</p><Link href="/login?next=/responsible-play" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-teal-700 px-7 font-black text-white">Log in</Link></div>;
  if (loading) return <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-700" />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div><h1 className="flex items-center gap-2 text-3xl font-black text-slate-950"><ShieldCheck className="h-7 w-7 text-emerald-700" />Responsible Play</h1><p className="mt-1 text-sm text-slate-500">Simple controls that stay with your account.</p></div>
      <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <label className="block text-sm font-black text-slate-900"><Clock className="mr-2 inline h-5 w-5 text-teal-700" />Session reminder
          <select value={settings.sessionTimerMinutes} onChange={(event) => setSettings((current) => ({ ...current, sessionTimerMinutes: Number(event.target.value) }))} className="mt-3 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950"><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="120">2 hours</option><option value="180">3 hours</option></select>
        </label>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-800">Daily loss limit<input type="number" min="0" value={settings.dailyLossLimit ?? ""} onChange={(event) => setSettings((current) => ({ ...current, dailyLossLimit: event.target.value ? Number(event.target.value) : null }))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-950" /></label>
          <label className="text-sm font-bold text-slate-800">Weekly loss limit<input type="number" min="0" value={settings.weeklyLossLimit ?? ""} onChange={(event) => setSettings((current) => ({ ...current, weeklyLossLimit: event.target.value ? Number(event.target.value) : null }))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-950" /></label>
        </div>
        <button disabled={busy} className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50">{busy && <Loader2 className="h-5 w-5 animate-spin" />}Save controls</button>
      </form>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><PauseCircle className="h-5 w-5 text-rose-700" />Take a break</h2>
        <p className="mt-1 text-sm text-slate-500">A break blocks competitive games until it ends.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">{[[24, "24 hours"], [168, "7 days"], [720, "30 days"]].map(([hours, label]) => <button type="button" key={hours} disabled={busy} onClick={() => void pause(hours as 24 | 168 | 720)} className="min-h-12 rounded-xl border border-rose-200 bg-rose-50 px-2 text-sm font-black text-rose-700 disabled:opacity-50">{label}</button>)}</div>
        {settings.coolingOffUntil && new Date(settings.coolingOffUntil) > new Date() && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">Paused until {new Date(settings.coolingOffUntil).toLocaleString()}.</p>}
      </section>
      {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
    </div>
  );
}
