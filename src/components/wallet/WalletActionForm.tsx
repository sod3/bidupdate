"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileImage,
  Info,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
  WalletCards,
  WifiOff,
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { customerCopy, formatCredits } from "@/lib/customerCopy";
import {
  MAX_PAYMENT_PROOF_BYTES,
  PAYMENT_PROOF_ACCEPT,
  PAYMENT_RECEIVER_NUMBER,
  type PaymentMethod,
} from "@/lib/paymentConfig";

type ActionType = "TOP_UP" | "WITHDRAWAL";

const amountOptions: Record<ActionType, number[]> = {
  TOP_UP: [500, 1000, 2000, 5000],
  WITHDRAWAL: [500, 1000, 2000, 5000],
};

const paymentMethods: Array<{ id: PaymentMethod; label: string; description: string }> = [
  { id: "JAZZCASH", label: "JazzCash", description: "Mobile wallet transfer" },
  { id: "EASYPAISA", label: "Easypaisa", description: "Mobile wallet transfer" },
];

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function looksLikeMobile(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  return /^03\d{9}$/.test(compact) || /^\+?923\d{9}$/.test(compact);
}

export function WalletActionForm({ type }: { type: ActionType }) {
  const wallet = useWallet();
  const isDeposit = type === "TOP_UP";
  const [amount, setAmount] = useState(isDeposit ? 1000 : 500);
  const [custom, setCustom] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<PaymentMethod>("JAZZCASH");
  const [transactionId, setTransactionId] = useState("");
  const [payerMobile, setPayerMobile] = useState("");
  const [recipientMobile, setRecipientMobile] = useState("");
  const [accountTitle, setAccountTitle] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ reference: string; amount: number } | null>(null);
  const idempotencyKey = useRef("");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const chosenAmount = useMemo(() => custom ? Number(custom) : amount, [amount, custom]);
  const amountError = !Number.isFinite(chosenAmount)
    ? "Choose a valid amount"
    : chosenAmount < 100
      ? "Minimum amount is 100 CR"
      : chosenAmount > 50_000
        ? "Maximum amount is 50,000 CR"
        : !isDeposit && chosenAmount > wallet.withdrawableBalance
          ? customerCopy.notEnoughBalance
          : null;

  const proofError = paymentProof && paymentProof.size > MAX_PAYMENT_PROOF_BYTES
    ? "The receipt screenshot must be 4 MB or smaller."
    : paymentProof && !["image/jpeg", "image/png", "image/webp"].includes(paymentProof.type)
      ? "Use a JPG, PNG, or WebP receipt screenshot."
      : null;

  const detailsError = isDeposit
    ? !looksLikeMobile(payerMobile)
      ? "Enter the mobile number you paid from."
      : transactionId.trim().replace(/\s+/g, "").length < 6
        ? "Enter the complete transaction ID from the receipt."
        : !paymentProof
          ? "Upload the successful payment receipt screenshot."
          : proofError
    : accountTitle.trim().length < 2
      ? "Enter the receiving account holder name."
      : !looksLikeMobile(recipientMobile)
        ? "Enter a valid receiving mobile wallet number."
        : null;

  const choosePreset = (value: number) => {
    setAmount(value);
    setCustom("");
    setError(null);
  };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(PAYMENT_RECEIVER_NUMBER);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(`Copy failed. The payment number is ${PAYMENT_RECEIVER_NUMBER}.`);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step !== 3) return;
    if (!online) return setError(customerCopy.offline);
    if (amountError || detailsError) return setError(amountError || detailsError);
    if (!idempotencyKey.current) idempotencyKey.current = makeIdempotencyKey();
    setBusy(true);
    setError(null);
    try {
      const request = await wallet.createCreditRequest({
        type,
        amount: chosenAmount,
        method,
        transactionId: isDeposit ? transactionId : undefined,
        payerMobile: isDeposit ? payerMobile : undefined,
        paymentProof: isDeposit ? paymentProof : undefined,
        recipientMobile: isDeposit ? undefined : recipientMobile,
        accountTitle: isDeposit ? undefined : accountTitle,
        note,
        idempotencyKey: idempotencyKey.current,
      });
      setSuccess({ reference: request.reference, amount: request.amount });
      idempotencyKey.current = "";
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Request could not be submitted.";
      setError(message.includes("Insufficient") ? customerCopy.notEnoughBalance : message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSuccess(null);
    setStep(1);
    setTransactionId("");
    setPayerMobile("");
    setRecipientMobile("");
    setAccountTitle("");
    setPaymentProof(null);
    setNote("");
    setError(null);
  };

  if (wallet.loading) return <div className="mx-auto h-80 max-w-xl animate-pulse rounded-3xl bg-white" aria-label="Loading wallet" />;
  if (wallet.user.role !== "USER") {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <WalletCards className="mx-auto h-10 w-10 text-teal-700" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">Log in to {isDeposit ? "deposit" : "withdraw"}</h1>
        <p className="mt-2 text-sm text-slate-600">Your payment request and proof are stored securely on the server.</p>
        <Link href={`/login?next=${isDeposit ? "/deposit" : "/withdraw"}`} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-7 font-black text-white">Log in</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-emerald-200 bg-white p-7 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">Request sent to admin</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isDeposit
            ? `${formatCredits(success.amount)} will be credited only after the payment is verified.`
            : `${formatCredits(success.amount)} is reserved. The admin will pay the selected wallet and record the payout proof.`}
        </p>
        <div className="mx-auto mt-5 rounded-xl bg-slate-100 px-4 py-3 font-mono text-sm font-bold text-slate-800">{success.reference}</div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={reset} className="min-h-12 rounded-xl border border-slate-300 px-5 font-bold text-slate-800"><RefreshCw className="mr-2 inline h-4 w-4" />Another request</button>
          <Link href="/wallet" className="flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-5 font-black text-white">Track request</Link>
        </div>
      </div>
    );
  }

  const progressLabels = ["Amount", "Wallet", isDeposit ? "Payment proof" : "Payout details"];

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-500">{isDeposit ? customerCopy.balance : "Withdrawable balance"}</p>
          <p className="text-2xl font-black tabular-nums text-slate-950">{formatCredits(isDeposit ? wallet.balance : wallet.withdrawableBalance)}</p>
        </div>
        {wallet.reservedBalance > 0 && <p className="text-right text-xs text-slate-500">Reserved<br /><b className="text-slate-800">{formatCredits(wallet.reservedBalance)}</b></p>}
      </div>

      <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Landmark className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-black text-slate-950">{isDeposit ? "Deposit" : "Withdraw"}</h1>
            <p className="text-sm text-slate-500">JazzCash or Easypaisa · admin verified</p>
          </div>
        </div>

        <ol className="mt-6 grid grid-cols-3 gap-2" aria-label={`${isDeposit ? "Deposit" : "Withdrawal"} progress`}>
          {progressLabels.map((label, index) => {
            const number = index + 1;
            const active = step === number;
            const done = step > number;
            return (
              <li key={label} className="text-center">
                <span className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-sm font-black ${active || done ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"}`}>{done ? "✓" : number}</span>
                <span className={`mt-1 block text-[10px] font-bold sm:text-xs ${active ? "text-teal-700" : "text-slate-500"}`}>{label}</span>
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <section className="mt-7" aria-labelledby="amount-heading">
            <h2 id="amount-heading" className="text-lg font-black text-slate-950">1. Choose amount</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {amountOptions[type].map((value) => {
                const selected = !custom && amount === value;
                return <button key={value} type="button" onClick={() => choosePreset(value)} aria-pressed={selected} className={`min-h-14 rounded-xl border text-lg font-black tabular-nums ${selected ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`}>{formatCredits(value)}</button>;
              })}
            </div>
            <label className="mt-4 block text-sm font-bold text-slate-800">Other amount
              <div className="mt-2 flex min-h-12 items-center rounded-xl border border-slate-300 px-3 focus-within:border-teal-700">
                <input inputMode="decimal" type="number" min="100" max="50000" step="0.01" value={custom} onChange={(event) => { setCustom(event.target.value); setError(null); }} placeholder="Enter amount" className="min-w-0 flex-1 bg-transparent py-3 text-base font-bold outline-none" />
                <span className="font-black text-slate-500">CR</span>
              </div>
            </label>
            {amountError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{amountError}</p>}
            <button type="button" disabled={Boolean(amountError)} onClick={() => setStep(2)} className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 font-black text-white disabled:opacity-50">Continue <ChevronRight className="h-5 w-5" /></button>
          </section>
        )}

        {step === 2 && (
          <section className="mt-7" aria-labelledby="method-heading">
            <h2 id="method-heading" className="text-lg font-black text-slate-950">2. Choose {isDeposit ? "payment" : "receiving"} wallet</h2>
            <div className="mt-3 grid gap-2">
              {paymentMethods.map((item) => (
                <button key={item.id} type="button" onClick={() => setMethod(item.id)} aria-pressed={method === item.id} className={`flex min-h-16 items-center gap-3 rounded-xl border px-4 text-left ${method === item.id ? "border-teal-700 bg-teal-50 ring-1 ring-teal-700" : "border-slate-200 bg-white"}`}>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-teal-700 shadow-sm"><Smartphone className="h-5 w-5" /></span>
                  <span className="flex-1"><b className="block text-slate-950">{item.label}</b><small className="text-slate-500">{item.description}</small></span>
                  <span className={`h-5 w-5 rounded-full border-2 ${method === item.id ? "border-[6px] border-teal-700" : "border-slate-300"}`} />
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep(1)} className="flex min-h-13 items-center justify-center gap-1 rounded-xl border border-slate-300 font-bold text-slate-800"><ChevronLeft className="h-5 w-5" />Back</button>
              <button type="button" onClick={() => { setStep(3); setError(null); }} className="flex min-h-13 items-center justify-center gap-1 rounded-xl bg-teal-700 font-black text-white">Continue<ChevronRight className="h-5 w-5" /></button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="mt-7" aria-labelledby="details-heading">
            <h2 id="details-heading" className="text-lg font-black text-slate-950">3. {isDeposit ? "Pay and upload proof" : "Confirm payout details"}</h2>

            {isDeposit ? (
              <>
                <div className="mt-3 rounded-2xl border border-teal-200 bg-teal-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-teal-800">Send exactly {formatCredits(chosenAmount)} by {method === "JAZZCASH" ? "JazzCash" : "Easypaisa"} to</p>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                    <span className="font-mono text-xl font-black tracking-wide text-slate-950">{PAYMENT_RECEIVER_NUMBER}</span>
                    <button type="button" onClick={() => void copyNumber()} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-black text-teal-700"><Copy className="h-4 w-4" />{copied ? "Copied" : "Copy"}</button>
                  </div>
                  <p className="mt-3 flex gap-2 text-xs leading-5 text-teal-950"><Info className="mt-0.5 h-4 w-4 shrink-0" />Check the number and amount in your wallet app before confirming. Never share your PIN or OTP.</p>
                </div>

                <label className="mt-4 block text-sm font-bold text-slate-800">Mobile number paid from
                  <input inputMode="tel" value={payerMobile} onChange={(event) => { setPayerMobile(event.target.value); setError(null); }} required placeholder="03XXXXXXXXX" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                </label>
                <label className="mt-4 block text-sm font-bold text-slate-800">Transaction ID
                  <input value={transactionId} onChange={(event) => { setTransactionId(event.target.value); setError(null); }} required minLength={6} maxLength={80} autoCapitalize="characters" placeholder="Enter the full ID shown on the receipt" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-mono text-base uppercase text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                </label>
                <label className="mt-4 block text-sm font-bold text-slate-800">Successful payment screenshot
                  <span className={`mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center ${paymentProof ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
                    {paymentProof ? <FileImage className="h-7 w-7 text-emerald-700" /> : <Upload className="h-7 w-7 text-slate-500" />}
                    <span className="mt-2 text-sm font-black text-slate-800">{paymentProof?.name ?? "Choose receipt image"}</span>
                    <small className="mt-1 text-slate-500">JPG, PNG, or WebP · maximum 4 MB</small>
                    <input type="file" accept={PAYMENT_PROOF_ACCEPT} required className="sr-only" onChange={(event) => { setPaymentProof(event.target.files?.[0] ?? null); setError(null); }} />
                  </span>
                </label>
              </>
            ) : (
              <>
                <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                  <b>No payment is required from you.</b> After review, the admin sends {formatCredits(chosenAmount)} to this {method === "JAZZCASH" ? "JazzCash" : "Easypaisa"} account and records the provider transaction ID and payout receipt.
                </div>
                <label className="mt-4 block text-sm font-bold text-slate-800">Account holder name
                  <input value={accountTitle} onChange={(event) => { setAccountTitle(event.target.value); setError(null); }} required minLength={2} maxLength={80} autoComplete="name" placeholder="Name registered on the wallet" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                </label>
                <label className="mt-4 block text-sm font-bold text-slate-800">Receiving mobile number
                  <input inputMode="tel" value={recipientMobile} onChange={(event) => { setRecipientMobile(event.target.value); setError(null); }} required placeholder="03XXXXXXXXX" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
                </label>
              </>
            )}

            <label className="mt-4 block text-sm font-bold text-slate-800">Note <span className="font-normal text-slate-400">(optional)</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} rows={2} placeholder="Add information for the admin" className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15" />
            </label>

            {!online && <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900"><WifiOff className="h-5 w-5" />{customerCopy.offline}</p>}
            {(error || proofError) && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error || proofError}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep(2)} className="flex min-h-13 items-center justify-center gap-1 rounded-xl border border-slate-300 font-bold text-slate-800"><ChevronLeft className="h-5 w-5" />Back</button>
              <button disabled={busy || !online || Boolean(detailsError)} className="flex min-h-13 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : isDeposit ? <ClipboardCheck className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                {busy ? "Sending…" : "Send to admin"}
              </button>
            </div>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">Your balance changes only after the server records an approved admin review.</p>
          </section>
        )}
      </form>
    </div>
  );
}
