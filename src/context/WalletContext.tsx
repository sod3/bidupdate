"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type TransactionType =
  | "STARTING_BONUS" | "REFERRAL_BONUS" | "ADMIN_ADJUSTMENT"
  | "RACE_ENTRY" | "RACE_REWARD"
  | "TOP_UP" | "WITHDRAWAL_RESERVE" | "WITHDRAWAL_REFUND";

export interface WalletTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  balanceKind?: "CASH" | "PROMOTIONAL" | "MIXED";
  referenceId?: string | null;
  description: string;
  createdAt: string;
}

export interface CreditRequestItem {
  id: string;
  reference: string;
  type: "TOP_UP" | "WITHDRAWAL";
  amount: number;
  method: string;
  transactionId?: string | null;
  payoutTransactionId?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserState {
  username: string;
  fullName: string;
  email: string;
  role: "GUEST" | "USER";
}

interface WalletPayload {
  balance: number;
  cashBalance: number;
  bonusBalance: number;
  withdrawableBalance: number;
  reservedBalance: number;
  totalWagered: number;
  totalWon: number;
  transactions: WalletTransaction[];
  creditRequests: CreditRequestItem[];
}

interface WalletContextValue {
  user: UserState;
  balance: number;
  cashBalance: number;
  bonusBalance: number;
  withdrawableBalance: number;
  reservedBalance: number;
  totalWagered: number;
  totalWon: number;
  transactions: WalletTransaction[];
  creditRequests: CreditRequestItem[];
  loading: boolean;
  error: string | null;
  refreshWallet: (options?: { details?: boolean }) => Promise<boolean>;
  createCreditRequest: (input: { type: "TOP_UP" | "WITHDRAWAL"; amount: number; method: "JAZZCASH" | "EASYPAISA"; transactionId?: string; payerMobile?: string; recipientMobile?: string; accountTitle?: string; paymentProof?: File | null; note?: string; idempotencyKey: string }) => Promise<CreditRequestItem>;
  cancelCreditRequest: (requestId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const guest: UserState = { username: "Guest", fullName: "Guest", email: "", role: "GUEST" };
const emptyWallet: WalletPayload = { balance: 0, cashBalance: 0, bonusBalance: 0, withdrawableBalance: 0, reservedBalance: 0, totalWagered: 0, totalWon: 0, transactions: [], creditRequests: [] };
const WalletContext = createContext<WalletContextValue | null>(null);

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body as T;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserState>(guest);
  const [wallet, setWallet] = useState<WalletPayload>(emptyWallet);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshWallet = useCallback(async (options?: { details?: boolean }) => {
    const detailed = options?.details === true;
    try {
      const response = await fetch(`/api/auth/session?details=${detailed ? "1" : "0"}`, { cache: "no-store", credentials: "same-origin" });
      const payload = await responseJson<{
        authenticated: boolean;
        user: Omit<UserState, "role"> & { role: "USER" } | null;
        wallet: WalletPayload | null;
      }>(response);
      if (!payload.authenticated || !payload.user || !payload.wallet) {
        setUser(guest);
        setWallet(emptyWallet);
        setError(null);
        return false;
      }
      setUser({ ...payload.user, role: "USER" });
      setWallet((current) => detailed ? payload.wallet! : {
        ...payload.wallet!,
        transactions: current.transactions,
        creditRequests: current.creditRequests,
      });
      setError(null);
      return true;
    } catch (caught) {
      setUser(guest);
      setWallet(emptyWallet);
      setError(caught instanceof Error ? caught.message : "Unable to load the account.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => refreshWallet({ details: false })); }, [refreshWallet]);

  const createCreditRequest = useCallback(async (input: { type: "TOP_UP" | "WITHDRAWAL"; amount: number; method: "JAZZCASH" | "EASYPAISA"; transactionId?: string; payerMobile?: string; recipientMobile?: string; accountTitle?: string; paymentProof?: File | null; note?: string; idempotencyKey: string }) => {
    const form = new FormData();
    form.set("type", input.type);
    form.set("amount", String(input.amount));
    form.set("method", input.method);
    form.set("transactionId", input.transactionId ?? "");
    form.set("payerMobile", input.payerMobile ?? "");
    form.set("recipientMobile", input.recipientMobile ?? "");
    form.set("accountTitle", input.accountTitle ?? "");
    form.set("note", input.note ?? "");
    form.set("idempotencyKey", input.idempotencyKey);
    if (input.paymentProof) form.set("paymentProof", input.paymentProof);
    const response = await fetch("/api/wallet/requests", {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    const payload = await responseJson<{ creditRequest: CreditRequestItem; wallet: WalletPayload }>(response);
    setWallet(payload.wallet);
    return payload.creditRequest;
  }, []);

  const cancelCreditRequest = useCallback(async (requestId: string) => {
    const response = await fetch("/api/wallet/requests", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ requestId }),
    });
    const payload = await responseJson<{ wallet: WalletPayload }>(response);
    setWallet(payload.wallet);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
    setUser(guest);
    setWallet(emptyWallet);
  }, []);

  const value = useMemo<WalletContextValue>(() => ({
    user,
    balance: wallet.balance,
    cashBalance: wallet.cashBalance,
    bonusBalance: wallet.bonusBalance,
    withdrawableBalance: wallet.withdrawableBalance,
    reservedBalance: wallet.reservedBalance,
    totalWagered: wallet.totalWagered,
    totalWon: wallet.totalWon,
    transactions: wallet.transactions,
    creditRequests: wallet.creditRequests,
    loading,
    error,
    refreshWallet,
    createCreditRequest,
    cancelCreditRequest,
    logout,
  }), [user, wallet, loading, error, refreshWallet, createCreditRequest, cancelCreditRequest, logout]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used within WalletProvider");
  return value;
}
