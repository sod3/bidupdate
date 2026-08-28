"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Gift, Loader2, Share2, ShieldCheck, UserCheck, Users } from "lucide-react";
import { useWallet } from "@/context/WalletContext";

interface ReferralDashboard {
  code: string;
  referralLink: string;
  joined: number;
  qualified: number;
  earned: number;
}

export default function ReferPage() {
  const wallet = useWallet();
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wallet.loading) return;
    if (wallet.user.role !== "USER") return;
    const controller = new AbortController();
    fetch("/api/referrals", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { error?: string; referral?: ReferralDashboard };
        if (!response.ok || !payload.referral) throw new Error(payload.error || "Referral details could not be loaded.");
        setDashboard(payload.referral);
      })
      .catch((caught) => { if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Referral details could not be loaded."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [wallet.loading, wallet.user.role]);

  const copyLink = async () => {
    if (!dashboard) return;
    await navigator.clipboard.writeText(dashboard.referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    if (!dashboard) return;
    const text = `Join me on Play Arena with code ${dashboard.code}. Create your account to qualify.`;
    if (navigator.share) await navigator.share({ title: "Play Arena", text, url: dashboard.referralLink }).catch(() => undefined);
    else await copyLink();
  };

  if (wallet.loading) return <div className="mx-auto grid h-72 max-w-2xl place-items-center rounded-3xl bg-white"><Loader2 className="h-7 w-7 animate-spin text-teal-700" /></div>;
  if (wallet.user.role !== "USER") return <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center"><Gift className="mx-auto h-11 w-11 text-teal-700" /><h1 className="mt-4 text-2xl font-black">Log in to invite friends</h1><Link href="/login?next=/refer" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-teal-700 px-7 font-black text-white">Log in</Link></div>;
  if (loading) return <div className="mx-auto grid h-72 max-w-2xl place-items-center rounded-3xl bg-white"><Loader2 className="h-7 w-7 animate-spin text-teal-700" /></div>;
  if (error || !dashboard) return <div className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-white p-7 text-center text-rose-700"><p className="font-bold">{error || "Referral details could not be loaded."}</p></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-3xl border border-teal-100 bg-white p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Gift className="h-7 w-7" /></span>
        <h1 className="mt-4 text-3xl font-black text-slate-950">Invite a Friend</h1>
        <p className="mt-2 text-lg font-bold text-teal-700">Earn Rs 300 for every qualified referral</p>
        <p className="mt-1 text-xs text-slate-500">Promotional game credit · not withdrawable</p>
        <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your Code</p>
          <p className="mt-1 text-3xl font-black tracking-[.18em] text-slate-950">{dashboard.code}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => void copyLink()} className="flex min-h-13 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 font-black text-white">{copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}{copied ? "Copied" : "Copy Link"}</button>
          <button type="button" onClick={() => void share()} className="flex min-h-13 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-black text-slate-900"><Share2 className="h-5 w-5" />Share</button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {[{ icon: Users, value: dashboard.joined, label: "Friends Joined" }, { icon: UserCheck, value: dashboard.qualified, label: "Qualified" }, { icon: Gift, value: `Rs ${dashboard.earned}`, label: "Earned" }].map(({ icon: Icon, value, label }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm sm:p-5"><Icon className="mx-auto h-5 w-5 text-teal-700" /><p className="mt-2 text-xl font-black text-slate-950 sm:text-2xl">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-500 sm:text-xs">{label}</p></div>
        ))}
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" /><p>A friend counts after signing up with your link and passing automatic new-account checks. Opening the link alone earns nothing.</p></section>
    </div>
  );
}
