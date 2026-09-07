import { ballGroup, type BallGroup } from "./constants";
import { BALL_RADIUS, POCKETS, pathClear, TABLE_HALF_LENGTH, TABLE_HALF_WIDTH, type PoolBallState } from "./physics";
import { simulateShot, type Shot } from "./match";

function candidates(balls: PoolBallState[], group: BallGroup | null): Shot[] {
  const cue = balls.find(b => b.number === 0)!;
  const own = balls.filter(b => !b.pocketed && b.number > 0 && b.number !== 8 && (!group || ballGroup(b.number) === group));
  const targets = own.length ? own : balls.filter(b => b.number === 8 && !b.pocketed);
  const options: { shot: Shot; cost: number }[] = [];
  for (const target of targets) for (const pocket of POCKETS) {
    // Mirror pockets across each cushion to construct genuine one-cushion banks.
    const destinations = [{ x: pocket.x, z: pocket.z, bank: false }, ...[-1, 1].flatMap(sign => [
      { x: 2 * sign * TABLE_HALF_WIDTH - pocket.x, z: pocket.z, bank: true },
      { x: pocket.x, z: 2 * sign * TABLE_HALF_LENGTH - pocket.z, bank: true },
    ])];
    for (const dest of destinations) {
      const dx = dest.x - target.x, dz = dest.z - target.z, length = Math.hypot(dx, dz);
      const gx = target.x - dx / length * BALL_RADIUS * 2, gz = target.z - dz / length * BALL_RADIUS * 2;
      const dist = Math.hypot(gx - cue.x, gz - cue.z);
      const cosine = ((gx - cue.x) * dx + (gz - cue.z) * dz) / (dist * length);
      if (cosine < .22 || Math.abs(gx) > TABLE_HALF_WIDTH || Math.abs(gz) > TABLE_HALF_LENGTH) continue;
      if (!pathClear(balls, cue.x, cue.z, gx, gz, new Set([0, target.number]))) continue;
      if (!dest.bank && !pathClear(balls, target.x, target.z, dest.x, dest.z, new Set([0, target.number]))) continue;
      const power = Math.min(.96, Math.max(.17, Math.sqrt(.65 * (dist + length / cosine)) / 5.15 + (dest.bank ? .13 : .04)));
      options.push({ shot: { angle: Math.atan2(gx - cue.x, gz - cue.z), power, spin: { x: 0, y: 0 } }, cost: dist + length + (1 - cosine) * 3 + (dest.bank ? 1.5 : 0) });
    }
  }
  options.sort((a, b) => a.cost - b.cost);
  const result = options.slice(0, 16).map(o => o.shot);
  for (const target of targets.slice(0, 4)) result.push({ angle: Math.atan2(target.x - cue.x, target.z - cue.z), power: .19, spin: { x: 0, y: -.1 } });
  return result;
}

export function planExpertShot(balls: PoolBallState[], group: BallGroup | null, opening: boolean, random = Math.random): Shot {
  if (opening) return { angle: -.018 + (random() - .5) * .0015, power: 1, spin: { x: 0, y: .1 } };
  const legalEight = Boolean(group && !balls.some(b => !b.pocketed && ballGroup(b.number) === group));
  const score = (result: ReturnType<typeof simulateShot>) => {
    const r = result.report;
    if (r.scratch || r.firstHit === null || (group && !legalEight && ballGroup(r.firstHit) !== group) || (!legalEight && r.pots.includes(8))) return -1000;
    if (r.pots.includes(8)) return 10000;
    const pots = r.pots.filter(n => n > 0 && (!group || ballGroup(n) === group)).length;
    const cue = result.balls.find(b => b.number === 0)!;
    return pots * 100 + (r.railsAfter.length ? 2 : -15) - Math.abs(cue.x) * 2 - Math.abs(cue.z);
  };
  const first = candidates(balls, group).map(shot => ({ shot, result: simulateShot(balls, shot, false) }));
  first.sort((a, b) => score(b.result) - score(a.result));
  let best = first[0]?.shot ?? { angle: 0, power: .3, spin: { x: 0, y: 0 } }, bestScore = -Infinity;
  // Small beam search: evaluate cue position through as many as three legal pots.
  for (const option of first.slice(0, 3)) {
    let value = score(option.result), state = option.result.balls;
    for (let depth = 0; depth < 2 && value > 20; depth++) {
      const future = candidates(state, group).slice(0, 4).map(s => simulateShot(state, s, false)).sort((a, b) => score(b) - score(a));
      if (!future.length) break;
      value += Math.max(-10, score(future[0])) * (.18 / (depth + 1)); state = future[0].balls;
    }
    if (value > bestScore) { bestScore = value; best = option.shot; }
  }
  return { ...best, angle: best.angle + (random() - .5) * .0018, power: Math.max(.05, Math.min(1, best.power + (random() - .5) * .006)) };
}
