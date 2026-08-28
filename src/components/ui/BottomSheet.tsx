"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Height of the sheet. Defaults to auto up to 92dvh */
  maxHeight?: string;
}

export function BottomSheet({ isOpen, onClose, title, children, maxHeight = "max-h-[92dvh]" }: BottomSheetProps) {
  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/55"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={`relative flex w-full flex-col rounded-t-3xl border-t border-slate-200 bg-white text-slate-950 shadow-2xl ${maxHeight} animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-base font-bold text-slate-950">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">
          {children}
        </div>
      </div>
    </div>
  );
}
