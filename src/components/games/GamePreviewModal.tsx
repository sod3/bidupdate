"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Flame, Play, RefreshCw, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import type { GameItem } from "@/lib/games";

interface GamePreviewModalProps {
  game: GameItem;
  onClose: () => void;
}

export function GamePreviewModal({ game, onClose }: GamePreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [demoState, setDemoState] = useState<"idle" | "running" | "win">("idle");
  const [demoMultiplier, setDemoMultiplier] = useState(1.0);
  const [demoProfit, setDemoProfit] = useState<number | null>(null);

  const [demoToast, setDemoToast] = useState<{ name: string; multiplier: number; win: number } | null>(null);

  // Live Canvas Preview Simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let animTime = 0;
    let running = true;

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      canvas.width = Math.round(box.width * Math.min(window.devicePixelRatio || 1, 2));
      canvas.height = Math.round(box.height * Math.min(window.devicePixelRatio || 1, 2));
      ctx.setTransform(canvas.width / box.width, 0, 0, canvas.height / box.height, 0, 0);
    };
    resize();

    const render = (now: number) => {
      if (!running) return;
      animTime += 0.016;
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;

      ctx.clearRect(0, 0, w, h);

      // Background ambient glow
      const bgGlow = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.7);
      bgGlow.addColorStop(0, "rgba(239, 7, 71, 0.15)");
      bgGlow.addColorStop(1, "rgba(5, 8, 14, 0.95)");
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, h);

      // Game Specific Preview Visuals
      if (game.id === "flight-x") {
        // Crash Curve Preview
        const t = (animTime * 0.30) % 1;
        const progress = Math.pow(t, 1.8);
        const startX = w * 0.08, startY = h * 0.88;
        const endX = w * 0.08 + progress * w * 0.78;
        const endY = h * 0.88 - Math.pow(progress, 1.6) * h * 0.70;

        // Gradient under curve
        const grad = ctx.createLinearGradient(0, h, w, 0);
        grad.addColorStop(0, "rgba(239, 7, 71, 0.75)");
        grad.addColorStop(1, "rgba(255, 176, 74, 0.15)");
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        const steps = 30;
        for (let i = 1; i <= steps; i++) {
          const stepP = (i / steps) * progress;
          const px = w * 0.08 + stepP * w * 0.78;
          const py = h * 0.88 - Math.pow(stepP, 1.6) * h * 0.70;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(endX, startY);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Stroke line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        for (let i = 1; i <= steps; i++) {
          const stepP = (i / steps) * progress;
          const px = w * 0.08 + stepP * w * 0.78;
          const py = h * 0.88 - Math.pow(stepP, 1.6) * h * 0.70;
          ctx.lineTo(px, py);
        }
        ctx.strokeStyle = "#ff2b5b";
        ctx.lineWidth = 3.5;
        ctx.shadowColor = "#ff2b5b";
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Rocket Head / Indicator Dot
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(endX, endY, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Particle motion preview for other games
        for (let i = 0; i < 24; i++) {
          const px = (Math.sin(i * 99 + animTime * 0.8) * 0.5 + 0.5) * w;
          const py = (Math.cos(i * 33 + animTime * 1.2) * 0.5 + 0.5) * h;
          const sz = (Math.sin(animTime * 2 + i) + 1.5) * 2;
          ctx.fillStyle = `rgba(245, 158, 11, ${0.2 + (i % 5) * 0.15})`;
          ctx.beginPath();
          ctx.arc(px, py, sz, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
    };
  }, [game.id]);

  const runDemoTest = () => {
    if (demoState === "running") return;
    setDemoState("running");
    setDemoProfit(null);
    setDemoToast(null);
    let mult = 1.0;
    const targetCrash = 2.40 + Math.random() * 2.50;
    
    const mockPlayers = [
      { name: "Ayaan***", target: 1.25, bet: 500 },
      { name: "Sarah_99", target: 1.55, bet: 1000 },
      { name: "Vikram***", target: 1.95, bet: 750 },
      { name: "Dan_77", target: 2.30, bet: 1500 }
    ];
    const cashed: string[] = [];

    const interval = setInterval(() => {
      mult += 0.08 + mult * 0.05;
      setDemoMultiplier(mult);

      // Simulate live player cashouts during demo run
      mockPlayers.forEach((p) => {
        if (!cashed.includes(p.name) && mult >= p.target && p.target <= targetCrash) {
          cashed.push(p.name);
          setDemoToast({ name: p.name, multiplier: p.target, win: Math.round(p.bet * p.target) });
        }
      });

      if (mult >= targetCrash) {
        clearInterval(interval);
        setDemoState("win");
        setDemoProfit(Math.round(500 * mult));
      }
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-amber-400/25 bg-[#090d16] text-white shadow-[0_0_60px_rgba(245,158,11,0.18)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-gradient-to-r from-amber-950/40 via-transparent to-transparent">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-400 font-black text-lg">
              {game.id === "flight-x" ? "✈" : game.id === "penalty-kings" ? "⚽" : "✦"}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">{game.category}</span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">97.4% RTP</span>
              </div>
              <h2 className="text-xl font-black text-white drop-shadow">{game.name}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live Preview Stage */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#04070d]">
          <Image
            src={game.thumbnail}
            alt={game.name}
            fill
            unoptimized
            className="object-cover opacity-25 filter blur-sm scale-105"
          />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

          {/* Live Toast Overlay */}
          {demoToast && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-950/80 px-3.5 py-1.5 backdrop-blur-md text-xs font-bold text-white shadow-lg animate-toastIn">
              <span className="text-emerald-300">{demoToast.name}</span>
              <b className="text-amber-300">{demoToast.multiplier.toFixed(2)}x</b>
              <small className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-emerald-200">+{demoToast.win.toLocaleString()} PKR</small>
            </div>
          )}

          {/* Multiplier / Status Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <small className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {demoState === "running" ? "DEMO FLIGHT IN MOTION" : demoState === "win" ? "DEMO WINNER!" : "READY FOR DEMO"}
            </small>
            <b className="text-4xl sm:text-5xl font-black tracking-tight text-amber-400 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">
              {demoMultiplier.toFixed(2)}x
            </b>
            {demoProfit !== null && (
              <span className="mt-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-0.5 text-sm font-black text-emerald-300 animate-bounce">
                +{demoProfit.toLocaleString()} PKR DEMO WIN
              </span>
            )}
          </div>

          {/* Quick Demo Trigger */}
          <div className="absolute bottom-4 right-4 z-10">
            <button
              onClick={runDemoTest}
              disabled={demoState === "running"}
              className="flex items-center gap-2 rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-black text-black shadow-lg hover:brightness-110 active:scale-95 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${demoState === "running" ? "animate-spin" : ""}`} />
              <span>{demoState === "running" ? "TESTING..." : "TRY DEMO ROUND"}</span>
            </button>
          </div>
        </div>

        {/* Game Stats & Launch Bar */}
        <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-b border-white/10 bg-white/[0.02] p-4 text-center">
          <div>
            <small className="block text-[9px] font-bold uppercase text-slate-400">Max Multiplier</small>
            <b className="text-base font-black text-amber-400">1,000x</b>
          </div>
          <div>
            <small className="block text-[9px] font-bold uppercase text-slate-400">Fairness</small>
            <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Provably Fair
            </span>
          </div>
          <div>
            <small className="block text-[9px] font-bold uppercase text-slate-400">Speed</small>
            <span className="inline-flex items-center gap-1 text-xs font-black text-amber-300">
              <Flame className="h-3.5 w-3.5" /> Ultra 120 FPS
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 bg-gradient-to-t from-black/80 to-transparent">
          <div className="text-xs text-slate-400">
            <span>Instant balance play · Instant cashouts</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/10 transition"
            >
              Close
            </button>
            <Link
              href={game.slug}
              className="flex items-center gap-2 rounded-xl border border-amber-300/50 bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-xs font-black text-black shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:brightness-110 active:scale-95 transition"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>PLAY FOR REAL</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
