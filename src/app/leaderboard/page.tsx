"use client";

import { useEffect, useState } from "react";
import { Bot, Castle, CircleDot, Coins, Crosshair, Crown, Gauge, Goal, Medal, RefreshCw, Shield, Timer, Trophy, TrendingUp } from "lucide-react";
import { SectionHeading } from "@/components/neon/SectionHeading";

const periods = ["Daily", "Weekly", "Season", "All-time"] as const;
type GameId = "racing" | "eight-ball" | "tower-clash" | "precision-arena" | "penalty-kings";

interface Leader {
  player: string;
  wins: number;
  rate: number;
  best: string;
  rank: string;
  xp: number;
  streak: number;
  balance: number;
  isBot: boolean;
}

const games: Array<{ id: GameId; label: string; endpoint: string; title: string; description: string; standing: string; unit: string; icon: typeof Trophy }> = [
  { id: "racing", label: "Neon Drift", endpoint: "/api/leaderboard", title: "STREET KINGS.", description: "Verified race times, win records, and Night City rank progression.", standing: "Top drivers", unit: "races", icon: Gauge },
  { id: "precision-arena", label: "Archery", endpoint: "/api/precision-arena/leaderboard", title: "ARENA MARKSMEN.", description: "Precision Arena scores, bullseyes, streaks, and ranked archery progression.", standing: "Top archers", unit: "duels", icon: Crosshair },
  { id: "eight-ball", label: "8 Ball", endpoint: "/api/eight-ball/leaderboard", title: "TABLE LEGENDS.", description: "Cash Arena wins, clearances, streaks, and ranked pool progression.", standing: "Top cue artists", unit: "racks", icon: CircleDot },
  { id: "tower-clash", label: "Tower Clash", endpoint: "/api/tower-clash/leaderboard", title: "SIEGE LEGENDS.", description: "Destroyed castles, critical breaches, victory times, and royal rank progression.", standing: "Top commanders", unit: "sieges", icon: Castle },
  { id: "penalty-kings", label: "Penalty Kings", endpoint: "/api/penalty-kings/leaderboard", title: "SPOT-KICK ROYALTY.", description: "Verified shootout wins, goals, saves, streaks, and live simulated rivals.", standing: "Top finishers", unit: "shootouts", icon: Goal },
];

function formatBest(milliseconds: number | null) {
  if (!milliseconds) return "--:--.---";
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const millis = milliseconds % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export default function LeaderboardPage() {
  const [game, setGame] = useState<GameId>("racing");
  const [period, setPeriod] = useState<(typeof periods)[number]>("Season");
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const selected = games.find((item) => item.id === game) ?? games[0];

  useEffect(() => {
    const controller = new AbortController();
    const load = () => fetch(selected.endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Leaderboard unavailable");
        return response.json() as Promise<{ leaders: Array<{ username: string; wins: number; winRate: number; bestTimeMs: number | null; bestScore?: number; rankName: string; xp: number; winStreak: number; balance: number; isBot: boolean }> }>;
      })
      .then((payload) => setLeaders(payload.leaders.map((leader) => ({
        player: leader.username,
        wins: leader.wins,
        rate: leader.winRate,
        best: selected.id === "precision-arena" ? `${leader.bestScore ?? 0} PTS` : formatBest(leader.bestTimeMs),
        rank: leader.rankName,
        xp: leader.xp,
        streak: leader.winStreak,
        balance: leader.balance,
        isBot: leader.isBot,
      }))))
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setLeaders([]);
      })
      .finally(() => setLoading(false));
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [selected.endpoint, selected.id]);

  const chooseGame = (id: GameId) => {
    setLoading(true);
    setLeaders([]);
    setGame(id);
  };

  return (
    <div className="space-y-7 pb-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-amber-300/15 bg-[radial-gradient(circle_at_78%_20%,rgba(245,158,11,.12),transparent_32%),linear-gradient(125deg,#0b101a,#070b12)] px-6 py-10 sm:px-10">
        <Trophy className="h-7 w-7 text-amber-300" />
        <h1 className="font-display mt-4 text-5xl font-black italic tracking-[-.05em] text-white sm:text-7xl">{selected.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{selected.description}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {games.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => chooseGame(id)} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[9px] font-black uppercase tracking-widest ${game === id ? "bg-cyan-300 text-[#041117]" : "border border-white/[.07] text-slate-500"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
          {periods.map((item) => <button key={item} onClick={() => setPeriod(item)} className={`rounded-xl px-4 py-2 text-[9px] font-black uppercase tracking-widest ${period === item ? "bg-amber-300 text-[#171005]" : "border border-white/[.07] bg-white/[.025] text-slate-500"}`}>{item}</button>)}
        </div>
      </section>

      <section>
        <SectionHeading eyebrow={`${period} standings`} title={selected.standing} copy="Real results come from completed server-validated matches. Clearly labeled simulated rivals update every 30 seconds and never affect real wallet totals." />
        {leaders.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {leaders.slice(0, 3).map((leader, index) => (
              <div key={leader.player} className={`relative overflow-hidden rounded-[1.5rem] border p-6 ${index === 0 ? "order-first border-amber-300/30 bg-amber-300/[.06] lg:-translate-y-2" : "border-white/[.07] bg-[#0a0f19]"}`}>
                <span className="absolute right-4 top-3 font-display text-7xl font-black italic text-white/[.025]">{index + 1}</span>
                {index === 0 ? <Crown className="h-6 w-6 text-amber-300" /> : <Medal className={`h-6 w-6 ${index === 1 ? "text-slate-300" : "text-orange-400"}`} />}
                <p className="font-display mt-5 flex items-center gap-2 text-3xl font-black italic text-white">{leader.player}{leader.isBot && <span className="inline-flex items-center gap-1 rounded-md bg-violet-300/10 px-2 py-1 font-sans text-[7px] not-italic tracking-widest text-violet-200"><Bot className="h-3 w-3" />SIM</span>}</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-[.18em] text-violet-300">{leader.rank} · {leader.streak} win streak</p>
                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/[.06] pt-4 text-center sm:grid-cols-4">
                  <div><p className="text-lg font-black text-white">{leader.wins}</p><p className="text-[7px] uppercase tracking-widest text-slate-600">Wins</p></div>
                  <div><p className="text-lg font-black text-emerald-300">{leader.rate}%</p><p className="text-[7px] uppercase tracking-widest text-slate-600">Win rate</p></div>
                  <div><p className="text-sm font-black text-cyan-200">{leader.best}</p><p className="text-[7px] uppercase tracking-widest text-slate-600">{selected.id === "precision-arena" ? "Best score" : "Best time"}</p></div>
                  <div><p className="text-sm font-black text-amber-200">{leader.balance.toLocaleString()}</p><p className="text-[7px] uppercase tracking-widest text-slate-600">Credits</p></div>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="rounded-2xl border border-white/[.07] bg-[#080d16] px-6 py-12 text-center text-sm text-slate-500">{loading ? "Loading verified match records…" : "No verified results yet. Be the first on the board."}</div>}
      </section>

      {leaders.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-[#080d16]">
          <div className="hidden grid-cols-[60px_1fr_80px_90px_110px_110px_120px] border-b border-white/[.06] px-5 py-3 text-[8px] font-black uppercase tracking-[.16em] text-slate-600 md:grid"><span>Rank</span><span>Player</span><span>Wins</span><span>Win rate</span><span>{selected.id === "precision-arena" ? "Best score" : "Best time"}</span><span>Credits</span><span>Rank / XP</span></div>
          {leaders.map((leader, index) => (
            <div key={leader.player} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-white/[.05] px-4 py-4 last:border-0 md:grid-cols-[60px_1fr_80px_90px_110px_110px_120px] md:px-5">
              <span className={`font-display text-xl font-black italic ${index < 3 ? "text-amber-300" : "text-slate-500"}`}>#{index + 1}</span>
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[.07] bg-gradient-to-br from-violet-400/20 to-cyan-300/10 text-[10px] font-black text-white">{leader.isBot ? <Bot className="h-4 w-4 text-violet-200" /> : leader.player.slice(0, 2)}</span><div><p className="flex items-center gap-1.5 text-xs font-black text-white">{leader.player}{leader.isBot && <span className="rounded bg-violet-300/10 px-1.5 py-0.5 text-[6px] tracking-widest text-violet-200">SIM</span>}</p><p className="mt-1 text-[8px] text-slate-600 md:hidden">{leader.wins} wins · {leader.rate}% · {leader.balance.toLocaleString()} CR</p></div></div>
              <span className="hidden text-xs font-black text-white md:block">{leader.wins}</span>
              <span className="hidden text-xs font-black text-emerald-300 md:block">{leader.rate}%</span>
              <span className="hidden items-center gap-1.5 text-xs font-bold text-cyan-200 md:flex"><Timer className="h-3.5 w-3.5" />{leader.best}</span>
              <span className="hidden items-center gap-1.5 text-xs font-black text-amber-200 md:flex"><Coins className="h-3.5 w-3.5" />{leader.balance.toLocaleString()}</span>
              <div className="text-right md:text-left"><p className="flex items-center justify-end gap-1 text-[9px] font-black uppercase tracking-wider text-violet-200 md:justify-start"><Shield className="h-3 w-3" />{leader.rank}</p><p className="mt-1 text-[8px] text-slate-600">{leader.xp.toLocaleString()} XP</p></div>
            </div>
          ))}
        </section>
      )}

      <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-4"><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-cyan-200"><TrendingUp className="h-4 w-4" /> Earn your standing</p><p className="mt-3 text-xs font-bold text-slate-400">Complete server-verified {selected.unit} to place on the live board and advance through ranked tiers.</p><p className="mt-2 flex items-center gap-1.5 text-[9px] text-slate-600"><RefreshCw className="h-3 w-3" />Live standings refresh automatically every 30 seconds. Simulated competitor credits are display-only.</p></div>
    </div>
  );
}
