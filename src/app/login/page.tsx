"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { postLoginDestination } from "@/lib/authNavigation";

export default function LoginPage() {
  const router = useRouter(); const { refreshWallet } = useWallet();
  const [emailOrUsername, setIdentity] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ emailOrUsername, password }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Login failed.");
      await refreshWallet();
      router.push(postLoginDestination(window.location.search)); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Login failed."); } finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-md py-5 sm:py-8"><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><LockKeyhole className="h-7 w-7" /></div><h1 className="mt-4 text-3xl font-black text-slate-950">Log in</h1><p className="mt-1 text-sm text-slate-500">Your games and wallet are waiting.</p></div>
    <form onSubmit={submit} className="mt-6 space-y-4"><div><label className="mb-1.5 block text-sm font-bold text-slate-800">Email or username</label><input value={emailOrUsername} onChange={(event) => setIdentity(event.target.value)} required autoComplete="username" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" /></div>
      <div><label className="mb-1.5 block text-sm font-bold text-slate-800">Password</label><div className="relative"><input type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="current-password" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pr-12 text-base text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" /><button type="button" onClick={() => setShow((value) => !value)} className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-slate-500" aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
      <button disabled={busy} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-base font-black text-white disabled:opacity-60">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Log in"}</button>
    </form><p className="mt-5 text-center text-sm text-slate-500">New here? <Link href="/register" className="font-bold text-teal-700">Create an account</Link></p></div></div>;
}
