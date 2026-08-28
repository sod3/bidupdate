"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { Crown, Crosshair, Flag, Goal, Plane, Sparkles, Swords, Target, Trophy, Zap } from "lucide-react";
import { GAME_CINEMATIC_EVENT, type GameCinematicPayload } from "@/lib/gameCinematics";

type RoutePreset = GameCinematicPayload & { showOnEnter?: boolean };

const routePresets: Record<string, RoutePreset> = {
  "/play/race": { game: "NEON DRIFT", kicker: "NIGHT CITY SHOWDOWN", left: "YOU", leftMeta: "STREET RACER", right: "RIVAL", rightMeta: "ELITE CPU", accent: "#67e8f9", accent2: "#a78bfa", icon: "race", kind: "versus" },
  "/play/penalty-kings": { game: "PENALTY KINGS", kicker: "CHAMPIONS ARENA", left: "YOU", leftMeta: "STRIKER", right: "RIVAL", rightMeta: "EXPERT KEEPER", accent: "#6ee7b7", accent2: "#fbbf24", icon: "goal", kind: "versus" },
  "/play/eight-ball": { game: "8 BALL CASH ARENA", kicker: "THE BREAK ROOM", left: "YOU", leftMeta: "CHALLENGER", right: "RIVAL", rightMeta: "POOL SHARK", accent: "#22d3ee", accent2: "#fb7185", icon: "target", kind: "versus" },
  "/play/tower-clash": { game: "TOWER CLASH", kicker: "SIEGE PROTOCOL", left: "YOUR TOWER", leftMeta: "CANNON READY", right: "ENEMY FORT", rightMeta: "CPU WARLORD", accent: "#fb923c", accent2: "#f43f5e", icon: "swords", kind: "versus" },
  "/play/precision-arena": { game: "PRECISION ARENA", kicker: "FIVE ARROW DUEL", left: "YOU", leftMeta: "ARCHER", right: "RIVAL", rightMeta: "SHADOW MARKSMAN", accent: "#67e8f9", accent2: "#fbbf24", icon: "crosshair", kind: "versus" },
  "/play/teen-patti": { game: "TEEN PATTI", kicker: "ROYAL THREE CARD", left: "YOU", leftMeta: "PLAYER", right: "3 RIVALS", rightMeta: "ROYAL TABLE", accent: "#fbbf24", accent2: "#fb7185", icon: "crown", kind: "versus" },
  "/play/777-slots": { game: "NOVA 777", kicker: "JACKPOT FLOOR", center: "SPIN TO WIN", accent: "#fbbf24", accent2: "#f43f5e", icon: "sparkles", kind: "intro" },
  "/play/royal-roulette": { game: "ROYAL ROULETTE", kicker: "THE CROWN TABLE", center: "PLACE YOUR BETS", accent: "#f5c451", accent2: "#10b981", icon: "crown", kind: "intro" },
  "/play/thunder-gods": { game: "THUNDER GODS", kicker: "STORMFALL TUMBLES", center: "CHARGE THE RUNES", accent: "#72e7ff", accent2: "#9b6cff", icon: "zap", kind: "intro" },
  "/play/car-roulette": { game: "CAR ROULETTE", kicker: "NEON CIRCUIT", center: "SELECT YOUR MACHINE", accent: "#57e6ff", accent2: "#ff48bd", icon: "race", kind: "intro" },
  "/play/red-vs-black": { game: "RED VS BLACK", kicker: "KINGDOMS AT WAR", left: "RED KINGDOM", leftMeta: "REGENT AURELIA", right: "BLACK KINGDOM", rightMeta: "SENTINEL VARYN", accent: "#ff4b55", accent2: "#b794ff", icon: "swords", kind: "versus" },
  "/play/sic-bo": { game: "SIC BO", kicker: "JADE CHAMBER", center: "SHAKE THE CHAMBER", accent: "#f6cf62", accent2: "#15c993", icon: "sparkles", kind: "intro" },
  "/play/flight-x": { game: "FLIGHT X", kicker: "BEYOND THE HORIZON", left: "YOU", leftMeta: "PILOT", right: "X", rightMeta: "MULTIPLIER", accent: "#64dcff", accent2: "#ffb04a", icon: "plane", kind: "versus" },
  "/play/dragon-tiger": { game: "DRAGON TIGER", kicker: "TEMPLE DUEL", left: "DRAGON", leftMeta: "JADE GUARDIAN", right: "TIGER", rightMeta: "GOLD GUARDIAN", accent: "#45edb0", accent2: "#f3c969", icon: "swords", kind: "versus" },
  "/play/money-machine": { game: "MONEY MACHINE", kicker: "VAULTWORKS NO. 5", center: "OPEN THE VAULT", accent: "#ffd566", accent2: "#20cf8b", icon: "sparkles", kind: "intro" },
};

function iconFor(name?: string) {
  const className = "h-7 w-7 sm:h-9 sm:w-9";
  if (name === "race") return <Flag className={className} />;
  if (name === "goal") return <Goal className={className} />;
  if (name === "plane") return <Plane className={className} />;
  if (name === "target") return <Target className={className} />;
  if (name === "crosshair") return <Crosshair className={className} />;
  if (name === "swords") return <Swords className={className} />;
  if (name === "crown") return <Crown className={className} />;
  if (name === "zap") return <Zap className={className} />;
  if (name === "trophy") return <Trophy className={className} />;
  return <Sparkles className={className} />;
}

export function GameCinematicLayer() {
  const pathname = usePathname();
  const [scene, setScene] = useState<(GameCinematicPayload & { id: number }) | null>(null);
  const timerRef = useRef<number | null>(null);
  const enterRef = useRef<string>("");
  const preset = useMemo(() => routePresets[pathname], [pathname]);

  useEffect(() => {
    const show = (payload: GameCinematicPayload) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const fallback = payload.kind === "versus" ? 3400 : payload.kind === "win" || payload.kind === "loss" || payload.kind === "jackpot" ? 2200 : 2800;
      const duration = Math.max(1200, Math.min(payload.durationMs ?? fallback, 6000));
      const next = { ...payload, durationMs: duration, id: Date.now() + Math.random() };
      setScene(next);
      timerRef.current = window.setTimeout(() => setScene((current) => current?.id === next.id ? null : current), duration);
    };
    const handler = (event: Event) => show((event as CustomEvent<GameCinematicPayload>).detail);
    window.addEventListener(GAME_CINEMATIC_EVENT, handler as EventListener);
    if (preset?.showOnEnter && enterRef.current !== pathname) {
      enterRef.current = pathname;
      const timer = window.setTimeout(() => show({ ...preset, durationMs: preset.durationMs ?? 3200 }), 180);
      return () => { window.clearTimeout(timer); window.removeEventListener(GAME_CINEMATIC_EVENT, handler as EventListener); if (timerRef.current) window.clearTimeout(timerRef.current); };
    }
    return () => { window.removeEventListener(GAME_CINEMATIC_EVENT, handler as EventListener); if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [pathname, preset]);

  if (!scene) return null;
  const versus = Boolean(scene.left && scene.right);
  const resultKind = scene.kind === "win" || scene.kind === "jackpot" || scene.kind === "loss";
  return (
    <div
      key={scene.id}
      className={`game-cinematic-layer cinematic-${scene.kind ?? "intro"} ${versus ? "is-versus" : "is-center"}`}
      style={{ "--cin-accent": scene.accent ?? "#67e8f9", "--cin-accent-2": scene.accent2 ?? "#fbbf24", animationDuration: `${scene.durationMs ?? 1900}ms` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="cinematic-vignette" />
      <div className="cinematic-speed-lines">{Array.from({ length: 16 }, (_, index) => <i key={index} style={{ "--line": index } as CSSProperties} />)}</div>
      <div className="cinematic-sparks">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--spark": index } as CSSProperties} />)}</div>
      <div className="cinematic-top-copy"><span>{scene.kicker ?? "PLAY ARENA"}</span><b>{scene.game}</b></div>
      {versus ? (
        <div className="cinematic-matchup">
          <section className="cinematic-player player-left">
            <div className="cinematic-avatar"><span>{scene.left?.slice(0, 2)}</span><i>{iconFor(scene.icon)}</i></div>
            <small>{scene.leftMeta ?? "PLAYER ONE"}</small>
            <h2>{scene.left}</h2>
          </section>
          <div className="cinematic-vs-wrap"><div className="cinematic-vs-ring" /><b className="cinematic-vs">VS</b><span>{scene.center ?? "BATTLE"}</span></div>
          <section className="cinematic-player player-right">
            <div className="cinematic-avatar"><span>{scene.right?.slice(0, 2)}</span><i>{iconFor(scene.icon)}</i></div>
            <small>{scene.rightMeta ?? "PLAYER TWO"}</small>
            <h2>{scene.right}</h2>
          </section>
        </div>
      ) : (
        <div className={`cinematic-center-mark ${resultKind ? "cinematic-result-mark" : ""}`}>
          <div className="cinematic-center-icon">{iconFor(resultKind ? "trophy" : scene.icon)}</div>
          <small>{scene.kind === "jackpot" ? "MEGA HIT" : scene.kind === "win" ? "ROUND WON" : scene.kind === "loss" ? "ROUND COMPLETE" : "GET READY"}</small>
          <h2>{scene.center ?? (scene.kind === "win" ? "VICTORY" : scene.kind === "loss" ? "NEXT ROUND" : "READY")}</h2>
        </div>
      )}
      <div className="cinematic-scan" />
    </div>
  );
}
