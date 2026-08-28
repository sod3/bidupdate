"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, Loader2, MessageCircle } from "lucide-react";
import { useWallet } from "@/context/WalletContext";

const faqs = [
  { question: "How are results decided?", answer: "The server checks each completed game and updates the wallet only after confirmation." },
  { question: "Do credits have cash value?", answer: "No. Credits are virtual, non-transferable, and have no cash value." },
  { question: "Where is my deposit?", answer: "Open Wallet to see whether a deposit request is Pending, Completed, Rejected, or Cancelled." },
] as const;

export default function SupportPage() {
  const { user } = useWallet();
  const [open, setOpen] = useState<number | null>(0);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayedName = name ?? (user.role === "USER" ? user.fullName : "");
  const displayedEmail = email ?? (user.role === "USER" ? user.email : "");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setResult(null);
    try {
      const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name: displayedName, email: displayedEmail, subject, message }) });
      const payload = await response.json().catch(() => ({})) as { ticket?: { id: string }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Message could not be sent.");
      setResult("Message sent · " + payload.ticket?.id.slice(-8).toUpperCase());
      setSubject(""); setMessage("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Message could not be sent."); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div><h1 className="flex items-center gap-2 text-3xl font-black text-slate-950"><HelpCircle className="h-7 w-7 text-teal-700" />Help</h1><p className="mt-1 text-sm text-slate-500">Quick answers and support.</p></div>
      <section className="space-y-2">
        {faqs.map((faq, index) => <div key={faq.question} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => setOpen(open === index ? null : index)} className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left text-sm font-black text-slate-900">{faq.question}{open === index ? <ChevronUp className="h-5 w-5 text-teal-700" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}</button>{open === index && <p className="border-t border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">{faq.answer}</p>}</div>)}
      </section>
      <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><MessageCircle className="h-5 w-5 text-teal-700" />Send a message</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><input required value={displayedName} onChange={(event) => setName(event.target.value)} placeholder="Name" aria-label="Name" className="min-h-12 rounded-xl border border-slate-300 px-3 text-base text-slate-950 outline-none focus:border-teal-700" /><input required type="email" value={displayedEmail} onChange={(event) => setEmail(event.target.value)} placeholder="Email" aria-label="Email" className="min-h-12 rounded-xl border border-slate-300 px-3 text-base text-slate-950 outline-none focus:border-teal-700" /></div>
        <input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What do you need help with?" aria-label="Subject" className="mt-3 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-950 outline-none focus:border-teal-700" />
        <textarea required minLength={10} maxLength={3000} rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe the issue" aria-label="Message" className="mt-3 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-950 outline-none focus:border-teal-700" />
        {result && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{result}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
        <button disabled={busy} className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 font-black text-white disabled:opacity-50">{busy && <Loader2 className="h-5 w-5 animate-spin" />}{busy ? "Sending…" : "Send message"}</button>
      </form>
    </div>
  );
}
