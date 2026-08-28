"use client";

import React from "react";
import { Modal } from "./Modal";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  const confirmStyles = {
    danger: "bg-rose-600 hover:bg-rose-500 text-white",
    warning: "bg-brand-gold hover:bg-amber-400 text-navy-950",
    info: "bg-brand-teal hover:bg-cyan-400 text-navy-950",
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-sm">
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">{title}</h3>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-navy-700 text-slate-300 hover:text-white hover:bg-navy-800 transition text-sm font-semibold"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2 ${confirmStyles[variant]}`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
