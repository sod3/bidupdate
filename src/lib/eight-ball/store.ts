import mongoose, { Schema, type ClientSession } from "mongoose";
import { randomUUID } from "node:crypto";
import { connectDB } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { PoolProfile, User, Wallet } from "@/models";
import { applyWalletChange } from "@/services/walletService";
import { newMatch, economics, resolveShot, simulateShot, type MatchState, type Player, type Shot } from "./match";
import { planExpertShot } from "./expert";
import { validCuePlacement } from "./physics";

type Seat = { userId: string; matchId: string | null; stake: number; joined: number; seen: number; player: Player };
const seatSchema = new Schema<Seat>({ userId: { type: String, unique: true, required: true }, matchId: { type: String, default: null, index: true }, stake: Number, joined: Number, seen: Number, player: Schema.Types.Mixed });
const matchSchema = new Schema<{ key: string; active: boolean; state: MatchState }>({ key: { type: String, unique: true }, active: { type: Boolean, index: true }, state: Schema.Types.Mixed }, { timestamps: true });
const lockSchema = new Schema({ key: { type: String, unique: true }, version: { type: Number, default: 0 } });
const feeSchema = new Schema({ matchId: { type: String, unique: true }, totalPot: Number, fee: Number, reward: Number, aiContribution: Number, aiReward: Number }, { timestamps: true });
export const PoolSeat = (mongoose.models.PoolSeat as mongoose.Model<Seat>) || mongoose.model<Seat>("PoolSeat", seatSchema);
export const PoolLiveMatch = (mongoose.models.PoolLiveMatch as mongoose.Model<{ key: string; active: boolean; state: MatchState }>) || mongoose.model("PoolLiveMatch", matchSchema);
const PoolQueueLock = mongoose.models.PoolQueueLock || mongoose.model("PoolQueueLock", lockSchema);
export const PoolLedger = mongoose.models.PoolLedger || mongoose.model("PoolLedger", feeSchema);
let initialized: Promise<unknown> | undefined;
async function prepare() {
  const db = await connectDB();
  initialized ??= Promise.all([PoolSeat.init(), PoolLiveMatch.init(), PoolQueueLock.init(), PoolLedger.init()]).then(() => PoolQueueLock.updateOne({ key: "queue" }, { $setOnInsert: { version: 0 } }, { upsert: true })).catch(e => { initialized = undefined; throw e; });
  await initialized;
  return db;
}
const fail = (message: string) => { throw new ApiError(message, 409, "POOL_CONFLICT"); };
async function eligible(userId: string, session: ClientSession) {
  const user = await User.findOne({ _id: userId, status: "ACTIVE" }).session(session).lean();
  if (!user) return fail("An active account is required.");
  if ([user.responsiblePlay?.coolingOffUntil, user.responsiblePlay?.selfExcludedUntil].some(d => d && +new Date(d) > Date.now())) return fail("Competitive play is paused on this account.");
  return user;
}
async function pair(seat: Seat, session: ClientSession, now: number, botAllowed: boolean) {
  const range = 2 + Math.floor((now - seat.joined) / 1000) * 5;
  const peers = await PoolSeat.find({ userId: { $ne: seat.userId }, matchId: null, stake: seat.stake, seen: { $gt: now - 15000 } }).sort({ joined: 1 }).session(session).lean();
  const peer = peers.find(p => Math.abs(p.player.level - seat.player.level) <= range);
  if (!peer && !botAllowed) return;
  const name = ["Ethan", "Daniel", "Alex", "Ryan", "Oliver", "Adam", "James", "Noah", "Leo", "Sam"][Math.floor(Math.random() * 10)];
  const rival: Player = peer?.player ?? { id: `pool-ai-${randomUUID()}`, username: name, isBot: true, level: 24, rank: "Diamond", lastSeen: now };
  const state = newMatch(randomUUID(), seat.stake, [{ ...seat.player, lastSeen: now }, { ...rival, lastSeen: now }], now);
  for (const player of state.players.filter(p => !p.isBot)) {
    await eligible(player.id, session);
    await applyWalletChange({ userId: player.id, amount: -state.stake, type: "RACE_ENTRY", referenceId: state.id, idempotencyKey: `${state.id}:${player.id}:entry`, description: "8 Ball · table entry", metadata: { game: "eight-ball", ...economics(state.stake) } }, session);
    await PoolSeat.updateOne({ userId: player.id }, { $set: { matchId: state.id } }, { session });
  }
  await PoolLiveMatch.create([{ key: state.id, active: true, state }], { session });
}
async function settle(state: MatchState, session: ClientSession) {
  if (state.winner === null || state.settled) return;
  const amounts = economics(state.stake), winner = state.players[state.winner];
  if (!winner.isBot) await applyWalletChange({ userId: winner.id, amount: amounts.reward, type: "RACE_REWARD", referenceId: state.id, idempotencyKey: `${state.id}:reward`, description: "8 Ball · victory (90% of pot)", metadata: { game: "eight-ball", ...amounts } }, session);
  await PoolLedger.create([{ matchId: state.id, ...amounts, aiContribution: state.players.some(p => p.isBot) ? state.stake : 0, aiReward: winner.isBot ? amounts.reward : 0 }], { session });
  for (const player of state.players.filter(p => !p.isBot)) {
    await PoolProfile.updateOne({ userId: player.id }, { $inc: { wins: player.id === winner.id ? 1 : 0, losses: player.id === winner.id ? 0 : 1, xp: player.id === winner.id ? 600 : 230 } }, { upsert: true, session });
  }
  state.settled = true;
}
function shoot(state: MatchState, input: Shot, now: number) {
  const before = state.balls;
  const result = simulateShot(before, input);
  state.balls = result.balls;
  // Start after simulation/serialization work, so slower servers and complex
  // multi-ball shots never deliver a trace whose opening frames already elapsed.
  state.trace = { id: randomUUID(), at: Math.max(now, Date.now()) + 250, input, frames: result.frames, sounds: result.sounds, duration: result.duration };
  resolveShot(state, before, result.report);
  state.readyAt = state.trace.at + result.duration + 550;
  state.deadline = state.readyAt + 35000;
  state.version++;
}
function autoPlace(state: MatchState) {
  const cue = state.balls.find(b => b.number === 0)!;
  for (let z = -1.7; z <= 1.8; z += .21) for (let x = -.9; x <= .9; x += .21) {
    if (validCuePlacement(x, z, state.balls)) { Object.assign(cue, { x, z, pocketed: false, vx: 0, vz: 0 }); state.ballInHand = false; return; }
  }
}
export async function poolCommand(userId: string, input: Record<string, unknown>) {
  const db = await prepare(), now = Date.now();
  await db.connection.transaction(async session => {
    const user = await eligible(userId, session);
    let seat = await PoolSeat.findOne({ userId }).session(session);
    if (input.action === "JOIN" && !seat?.matchId) {
      const stake = Number(input.stake); economics(stake);
      // One queue lock serializes pairing across processes; the wallet and both seats commit together.
      await PoolQueueLock.updateOne({ key: "queue" }, { $inc: { version: 1 } }, { session });
      const wallet = await Wallet.findOne({ userId }).session(session).lean();
      if (!wallet || wallet.balance < stake) return fail("Insufficient coins for this table.");
      const profile = await PoolProfile.findOne({ userId }).session(session).lean();
      if (!seat) {
        [seat] = await PoolSeat.create([{ userId, matchId: null, stake, joined: now, seen: now, player: { id: userId, username: user.username, level: profile?.level || 1, rank: profile?.rank || "Bronze III", isBot: false, lastSeen: now } }], { session });
      }
      await pair(seat.toObject(), session, now, false);
    } else if (seat?.matchId) {
      const doc = await PoolLiveMatch.findOne({ key: seat.matchId }).session(session);
      if (!doc) return fail("The saved table is unavailable.");
      const state = doc.state, player = state.players.findIndex(p => p.id === userId);
      if (player < 0) return fail("You are not seated at this table.");
      const expired = now - state.players[player].lastSeen > 30000;
      if (expired && state.winner === null) { state.winner = 1 - player; state.reason = "Reconnect window expired"; state.version++; }
      state.players[player].lastSeen = now;
      if (input.action === "LEAVE" && state.settled) { await PoolSeat.deleteOne({ userId }, { session }); return; }
      if (input.action === "SHOT" || input.action === "PLACE") {
        if (state.winner !== null || player !== state.turn || now < state.readyAt || Number(input.version) !== state.version) return fail("The table has changed. Your shot was not submitted.");
        if (now > state.deadline) return fail("Your turn has expired.");
        if (input.action === "PLACE") {
          if (!state.ballInHand || !validCuePlacement(Number(input.x), Number(input.z), state.balls)) return fail("Place the cue ball in a clear area of the cloth.");
          Object.assign(state.balls.find(b => b.number === 0)!, { x: Number(input.x), z: Number(input.z), pocketed: false, vx: 0, vz: 0 });
          state.ballInHand = false; state.version++;
        } else {
          if (state.ballInHand) return fail("Place the cue ball first.");
          shoot(state, { angle: Number(input.angle), power: Number(input.power), spin: { x: Number((input.spin as { x?: number })?.x), y: Number((input.spin as { y?: number })?.y) } }, now);
        }
      }
      if (input.action === "RESIGN" && state.winner === null) { state.winner = 1 - player; state.reason = "Match conceded"; state.version++; }
      await settle(state, session);
      doc.state = state; doc.active = !state.settled; doc.markModified("state"); await doc.save({ session });
    } else if (seat && input.action === "CANCEL") {
      await PoolQueueLock.updateOne({ key: "queue" }, { $inc: { version: 1 } }, { session });
      await PoolSeat.deleteOne({ userId, matchId: null }, { session });
    }
    await PoolSeat.updateOne({ userId }, { $set: { seen: now } }, { session });
  });
  return poolView(userId);
}
export async function poolView(userId: string) {
  await prepare();
  const seat = await PoolSeat.findOne({ userId }).lean();
  const match = seat?.matchId ? await PoolLiveMatch.findOne({ key: seat.matchId }).lean() : null;
  return { now: Date.now(), selfId: userId, queuedAt: seat && !seat.matchId ? seat.joined : null, state: match?.state ?? null };
}
export async function tickPool() {
  const db = await prepare(), now = Date.now();
  const waiting = await PoolSeat.find({ matchId: null }).lean();
  for (const item of waiting) {
    try { await db.connection.transaction(async session => {
      await PoolQueueLock.updateOne({ key: "queue" }, { $inc: { version: 1 } }, { session });
      const seat = await PoolSeat.findOne({ userId: item.userId, matchId: null }).session(session).lean();
      if (!seat) return;
      if (now - seat.seen > 15000) { await PoolSeat.deleteOne({ userId: seat.userId }, { session }); return; }
      await pair(seat, session, now, now - seat.joined >= 5000);
    }); } catch (error) {
      // Failed entry never leaves a charged half-match. Remove the stale queue seat.
      if (error instanceof ApiError) await PoolSeat.deleteOne({ userId: item.userId, matchId: null }); else throw error;
    }
  }
  const matches = await PoolLiveMatch.find({ active: true }).select("key").lean();
  for (const match of matches) await db.connection.transaction(async session => {
    const doc = await PoolLiveMatch.findOne({ key: match.key, active: true }).session(session);
    if (!doc) return;
    const state = doc.state;
    const absent = state.players.findIndex(p => !p.isBot && now - p.lastSeen > 30000);
    if (absent >= 0 && state.winner === null) { state.winner = 1 - absent; state.reason = "Opponent disconnected"; state.version++; }
    if (state.winner === null && now >= state.readyAt) {
      const thinkMs = 800 + (state.version * 791 % 1701);
      if (state.players[state.turn].isBot && now >= state.readyAt + thinkMs) {
        if (state.ballInHand) autoPlace(state);
        shoot(state, planExpertShot(state.balls, state.groups[state.turn], state.opening), now);
      } else if (now >= state.deadline) {
        state.turn = 1 - state.turn; state.ballInHand = true; state.reason = "Time foul · ball in hand"; state.readyAt = now; state.deadline = now + 35000; state.version++;
      }
    }
    await settle(state, session);
    doc.state = state; doc.active = !state.settled; doc.markModified("state"); await doc.save({ session });
  });
}
