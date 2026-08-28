import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center space-y-3", className)}>
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-navy-800 flex items-center justify-center text-slate-500 mb-1">
          {icon}
        </div>
      )}
      <p className="font-bold text-slate-300 text-sm">{title}</p>
      {description && (
        <p className="text-xs text-slate-500 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
