import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, copy, action }: { eyebrow?: string; title: string; copy?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="neon-eyebrow">{eyebrow}</p>}
        <h2 className="font-display mt-1 text-2xl font-black italic tracking-[-.04em] text-white sm:text-3xl">{title}</h2>
        {copy && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{copy}</p>}
      </div>
      {action}
    </div>
  );
}

