import React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn("skeleton h-3 rounded", i === lines - 1 && lines > 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("p-4 rounded-2xl bg-navy-900 border border-navy-800 space-y-3", className)} aria-hidden="true">
      <div className="skeleton h-24 rounded-xl" />
      <div className="skeleton h-4 rounded w-2/3" />
      <div className="skeleton h-3 rounded w-1/2" />
    </div>
  );
}
