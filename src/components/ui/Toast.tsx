"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  toast: (item: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = "toast-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5);
      const newToast = { ...item, id };
      setToasts((prev) => [newToast, ...prev].slice(0, 5));

      const duration = item.duration ?? 4000;
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const success = useCallback((title: string, description?: string) => toast({ variant: "success", title, description }), [toast]);
  const error = useCallback((title: string, description?: string) => toast({ variant: "error", title, description, duration: 5000 }), [toast]);
  const info = useCallback((title: string, description?: string) => toast({ variant: "info", title, description }), [toast]);
  const warning = useCallback((title: string, description?: string) => toast({ variant: "warning", title, description }), [toast]);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, success, error, info, warning }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ─── Toast Item Config ────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<ToastVariant, { icon: React.ReactNode; bg: string; border: string; title: string }> = {
  success: {
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    bg: "bg-navy-900",
    border: "border-emerald-500/40",
    title: "text-emerald-300",
  },
  error: {
    icon: <XCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    bg: "bg-navy-900",
    border: "border-rose-500/40",
    title: "text-rose-300",
  },
  info: {
    icon: <Info className="w-5 h-5 text-brand-teal shrink-0" />,
    bg: "bg-navy-900",
    border: "border-brand-teal/40",
    title: "text-brand-teal",
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-brand-gold shrink-0" />,
    bg: "bg-navy-900",
    border: "border-brand-gold/40",
    title: "text-brand-gold",
  },
};

// ─── Toast Container ──────────────────────────────────────────────────────────

function ToastContainer({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed top-[70px] right-3 z-[9999] flex flex-col gap-2 w-[calc(100vw-1.5rem)] max-w-sm pointer-events-none"
    >
      {toasts.map((t) => {
        const cfg = VARIANT_CONFIG[t.variant];
        return (
          <div
            key={t.id}
            role="alert"
            className={`
              animate-toast-in pointer-events-auto
              flex items-start gap-3 p-4 rounded-2xl border shadow-card
              ${cfg.bg} ${cfg.border}
            `}
          >
            {cfg.icon}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold leading-tight ${cfg.title}`}>{t.title}</p>
              {t.description && (
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-500 hover:text-slate-300 transition shrink-0 -mt-0.5"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
