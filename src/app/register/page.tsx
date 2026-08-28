"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import {
  dateOfBirthToIso,
  formatDateOfBirthInput,
  isAtLeastAge,
  parseDisplayDateOfBirth,
} from "@/lib/dateOfBirth";

const initial = {
  username: "",
  fullName: "",
  email: "",
  password: "",
  dateOfBirth: "",
  country: "Pakistan",
  referralCode: "",
  agreeTerms: false,
  confirmVirtualOnly: false,
};

const textFields = [
  { key: "username", label: "Username", type: "text", autoComplete: "username" },
  { key: "fullName", label: "Full name", type: "text", autoComplete: "name" },
  { key: "email", label: "Email", type: "email", autoComplete: "email" },
] as const;

const remainingFields = [
  { key: "country", label: "Country", type: "text", autoComplete: "country-name" },
  { key: "referralCode", label: "Referral code (optional)", type: "text", autoComplete: "off" },
  { key: "password", label: "Password (10+ characters)", type: "password", autoComplete: "new-password" },
] as const;

type FormKey = keyof typeof initial;
type TextField = (typeof textFields)[number] | (typeof remainingFields)[number];

export default function RegisterPage() {
  const router = useRouter();
  const { refreshWallet } = useWallet();
  const dateOfBirthRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateOfBirthError, setDateOfBirthError] = useState<string | null>(null);

  useEffect(() => {
    const referralCode = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase();
    if (!referralCode) return;
    const timer = window.setTimeout(() => setForm((current) => ({ ...current, referralCode })), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const change = (key: FormKey, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const changeDateOfBirth = (value: string) => {
    change("dateOfBirth", formatDateOfBirthInput(value));
    setDateOfBirthError(null);
  };

  const validateDateOfBirth = () => {
    const parsedDate = parseDisplayDateOfBirth(form.dateOfBirth);
    const isoDate = dateOfBirthToIso(form.dateOfBirth);
    if (!parsedDate || !isoDate) {
      setDateOfBirthError("Enter a valid date as MM/DD/YYYY.");
      dateOfBirthRef.current?.focus();
      return null;
    }
    if (!isAtLeastAge(parsedDate, 18)) {
      setDateOfBirthError("You must be at least 18 years old.");
      dateOfBirthRef.current?.focus();
      return null;
    }
    setDateOfBirthError(null);
    return isoDate;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const dateOfBirth = validateDateOfBirth();
    if (!dateOfBirth) return;

    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...form, dateOfBirth }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Registration failed.");
      await refreshWallet();
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  };

  const renderTextField = ({ key, label, type, autoComplete }: TextField) => (
    <div key={key}>
      <label htmlFor={`register-${key}`} className="mb-1.5 block text-sm font-bold text-slate-800">{label}</label>
      <input
        id={`register-${key}`}
        type={type}
        value={form[key]}
        onChange={(event) => change(key, event.target.value)}
        required={key !== "referralCode"}
        minLength={key === "password" ? 10 : undefined}
        autoComplete={autoComplete}
        className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl py-3 sm:py-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-950">Create account</h1>
            <p className="text-sm text-slate-500">Sign up, then choose a game.</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
          {textFields.map(renderTextField)}

          <div>
            <label htmlFor="register-dateOfBirth" className="mb-1.5 block text-sm font-bold text-slate-800">Date of birth</label>
            <input
              ref={dateOfBirthRef}
              id="register-dateOfBirth"
              type="text"
              inputMode="numeric"
              enterKeyHint="next"
              autoComplete="bday"
              maxLength={10}
              placeholder="MM/DD/YYYY"
              value={form.dateOfBirth}
              onChange={(event) => changeDateOfBirth(event.target.value)}
              onBlur={() => {
                if (form.dateOfBirth && !parseDisplayDateOfBirth(form.dateOfBirth)) {
                  setDateOfBirthError("Enter a valid date as MM/DD/YYYY.");
                }
              }}
              required
              aria-invalid={Boolean(dateOfBirthError)}
              aria-describedby={dateOfBirthError ? "date-of-birth-error" : "date-of-birth-help"}
              className={`min-h-12 w-full rounded-xl border bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:ring-2 ${
                dateOfBirthError
                  ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15"
                  : "border-slate-300 focus:border-teal-700 focus:ring-teal-700/15"
              }`}
            />
            {dateOfBirthError ? (
              <p id="date-of-birth-error" role="alert" className="mt-1.5 text-sm font-semibold text-rose-700">{dateOfBirthError}</p>
            ) : (
              <p id="date-of-birth-help" className="mt-1.5 text-xs text-slate-500">Type the month, day, and year. Slashes are added automatically.</p>
            )}
          </div>

          {remainingFields.map(renderTextField)}

          <div className="space-y-3 sm:col-span-2">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-5 text-slate-600">
              <input type="checkbox" checked={form.agreeTerms} onChange={(event) => change("agreeTerms", event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-teal-700" />
              <span>I am 18 or older and agree to the platform terms and responsible-play controls.</span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-5 text-slate-600">
              <input type="checkbox" checked={form.confirmVirtualOnly} onChange={(event) => change("confirmVirtualOnly", event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-teal-700" />
              <span>I understand credits are virtual, non-transferable, and have no monetary value.</span>
            </label>
          </div>

          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700 sm:col-span-2">{error}</p>}
          <button disabled={busy} className="flex min-h-13 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-base font-black text-white disabled:opacity-60 sm:col-span-2">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ShieldCheck className="h-5 w-5" />Create account</>}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">Already registered? <Link href="/login" className="font-bold text-teal-700">Log in</Link></p>
      </div>
    </div>
  );
}
