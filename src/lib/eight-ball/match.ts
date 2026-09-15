import { ballGroup, oppositeGroup, type BallGroup } from "./constants";
import { ballsAreMoving, cloneBalls, createRack, stepPoolPhysics, strikeCueBall, type PoolBallState, type SpinInput } from "./physics";

export const STAKES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000] as const;
export const economics = (stake: number) => {
  if (!(STAKES as readonly number[]).includes(stake)) throw new Error("Choose a valid stake.");
  return { stake, totalPot: stake * 2, reward: stake * 18 / 10, fee: stake * 2 / 10 };
};
export type Player = { id: string; username: string; level: number; rank: string; isBot: boolean; lastSeen: number };
export type Shot = { angle: number; power: number; spin: SpinInput };
export type Frame = number[][];
export type ShotTrace = { id: string; at: number; duration: number; frames: Frame[]; input: Shot; sounds: { at: number; kind: "cue" | "collision" | "rail" | "pocket"; force: number }[] };
export type MatchState = {
  id: string; stake: number; players: Player[]; balls: PoolBallState[]; groups: (BallGroup | null)[];
  turn: number; opening: boolean; ballInHand: boolean; version: number; startAt: number; readyAt: number;
  deadline: number; winner: number | null; reason: string; settled: boolean; trace: ShotTrace | null;
};
export function newMatch(id: string, stake: number, players: Player[], now: number): MatchState {
  economics(stake);
  return { id, stake, players, balls: createRack(), groups: [null, null], turn: 0, opening: true, ballInHand: false, version: 0, startAt: now + 3000, readyAt: now + 4500, deadline: now + 39500, winner: null, reason: "You're breaking", settled: false, trace: null };
}
export type Report = { firstHit: number | null; pots: number[]; railsAfter: number[]; scratch: boolean };
export function resolveShot(state: MatchState, before: PoolBallState[], report: Report) {
  const shooter = state.turn, other = 1 - shooter, group = state.groups[shooter];
  const remaining = before.filter(b => !b.pocketed && group && ballGroup(b.number) === group).length;
  const legal = report.firstHit !== null && (group ? (remaining === 0 ? report.firstHit === 8 : ballGroup(report.firstHit) === group) : report.firstHit !== 8);
  const objectPots = report.pots.filter(n => n !== 0 && n !== 8);
  const breakFoul = state.opening && !report.pots.some(n => n > 0) && new Set(report.railsAfter.filter(n => n > 0)).size < 4;
  const foul = report.scratch || !legal || breakFoul || (!state.opening && report.pots.length === 0 && report.railsAfter.length === 0);
  if (state.opening && (report.pots.includes(8) || breakFoul)) {
    state.balls = createRack(); state.turn = foul ? other : shooter; state.reason = "Break re-racked"; return;
  }
  if (report.pots.includes(8)) {
    state.winner = group && remaining === 0 && !foul ? shooter : other;
    state.reason = state.winner === shooter ? "Eight ball cleared" : "Eight-ball foul";
    return;
  }
  if (!state.opening && !group && !foul && objectPots.length) {
    state.groups[shooter] = ballGroup(objectPots[0]); state.groups[other] = oppositeGroup(state.groups[shooter]!);
  }
  state.opening = false;
  const own = objectPots.some(n => !state.groups[shooter] || ballGroup(n) === state.groups[shooter]);
  state.turn = !foul && own ? shooter : other;
  state.ballInHand = foul;
  state.reason = foul ? report.scratch ? "Scratch · ball in hand" : !legal ? "Wrong first contact · ball in hand" : "No legal rail · ball in hand" : own ? "Beautiful pot" : "Your turn";
}
export function simulateShot(source: PoolBallState[], input: Shot, capture = true) {
  if (![input.angle, input.power, input.spin.x, input.spin.y].every(Number.isFinite) || input.power < .05 || input.power > 1 || Math.abs(input.spin.x) > 1 || Math.abs(input.spin.y) > 1) throw new Error("Invalid shot.");
  const balls = cloneBalls(source), frames: Frame[] = [], sounds: ShotTrace["sounds"] = [{ at: 0, kind: "cue", force: 1 }];
  const physicsEvents: ReturnType<typeof stepPoolPhysics> = { collisions: [], railHits: [], pocketed: [] };
  const report: Report = { firstHit: null, pots: [], railsAfter: [], scratch: false };
  const frame = () => balls.map(b => [b.number, +b.x.toFixed(5), +b.z.toFixed(5), b.pocketed ? 1 : 0, +b.rotationX.toFixed(3), +b.rotationZ.toFixed(3)]);
  if (capture) frames.push(frame());
  strikeCueBall(balls, input.angle, input.power, input.spin);
  let step = 0;
  // Fixed 240 Hz steps prevent tunnelling at maximum break velocity.
  for (; step < 7200 && ballsAreMoving(balls); step++) {
    const events = stepPoolPhysics(balls, 1 / 240, physicsEvents);
    for (const hit of events.collisions) {
      if (report.firstHit === null && (hit.a === 0 || hit.b === 0)) report.firstHit = hit.a === 0 ? hit.b : hit.a;
      if (capture && hit.force > .08) sounds.push({ at: step / 240 * 1000, kind: "collision", force: Math.min(1, hit.force / 4) });
    }
    if (report.firstHit !== null) report.railsAfter.push(...events.railHits);
    report.pots.push(...events.pocketed);
    if (capture && events.railHits.length) sounds.push({ at: step / 240 * 1000, kind: "rail", force: .3 });
    if (capture && events.pocketed.length) sounds.push({ at: step / 240 * 1000, kind: "pocket", force: .7 });
    if (capture && step % 8 === 7) frames.push(frame());
  }
  balls.forEach(b => { b.vx = 0; b.vz = 0; });
  if (capture) frames.push(frame());
  report.scratch = report.pots.includes(0);
  return { balls, frames, report, sounds, duration: (frames.length - 1) / 30 * 1000 };
}
