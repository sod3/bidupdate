// Runs against a uniquely named QA database; never touches the configured application database.
import assert from "node:assert/strict";
async function main() {
process.env.MONGODB_DB = `pool_qa_${Date.now()}`;
const { connectDB } = await import("../src/lib/db");
const { User, Wallet, WalletTransaction } = await import("../src/models");
const { poolCommand, poolView, tickPool, PoolLiveMatch, PoolSeat, PoolLedger } = await import("../src/lib/eight-ball/store");
const db=await connectDB();
async function user(name:string,balance=1000){const u=await User.create({username:name,fullName:name,email:`${name}@example.test`,passwordHash:"test-only",dateOfBirth:new Date("1990-01-01"),country:"Test"});await Wallet.create({userId:u.id,balance,cashBalance:balance,bonusBalance:0,balanceBucketsInitialized:true});return u.id as string;}
async function balance(id:string){return (await Wallet.findOne({userId:id}))!.balance;}
try {
 const a=await user("playera"),b=await user("playerb"),poor=await user("poor",10);
 await assert.rejects(()=>poolCommand(poor,{action:"JOIN",stake:100}));
 const joins=await Promise.allSettled([poolCommand(a,{action:"JOIN",stake:100}),poolCommand(a,{action:"JOIN",stake:100}),poolCommand(b,{action:"JOIN",stake:100})]);
 // Duplicate unique-seat insert may lose its race; retry must resume the existing seat.
 assert(joins.some(r=>r.status==="fulfilled"));await poolCommand(a,{action:"STATUS"});await poolCommand(b,{action:"JOIN",stake:100});
 let av=await poolView(a);const bv=await poolView(b);assert(av.state&&bv.state);assert.equal(av.state.id,bv.state.id);assert.equal(av.state.players.filter(p=>p.isBot).length,0);assert.equal(await balance(a),900);assert.equal(await balance(b),900);
 await poolCommand(a,{action:"JOIN",stake:100});assert.equal(await balance(a),900);
 const id=av.state.id;await PoolLiveMatch.updateOne({key:id},{$set:{"state.readyAt":Date.now()-1,"state.startAt":Date.now()-2,"state.deadline":Date.now()+35000}});
 av=await poolView(a);const shooter=av.state!.players[av.state!.turn].id;
 await Promise.allSettled([poolCommand(shooter,{action:"SHOT",version:0,angle:0,power:1,spin:{x:0,y:0}}),poolCommand(shooter,{action:"SHOT",version:0,angle:0,power:1,spin:{x:0,y:0}})]);
 av=await poolView(a);assert.equal(av.state!.version,1);assert(av.state!.trace);assert.equal(await WalletTransaction.countDocuments({referenceId:id,type:"RACE_ENTRY"}),2);
 await poolCommand(a,{action:"RESIGN"});await poolCommand(a,{action:"RESIGN"});assert.equal(await balance(b),1080);assert.equal(await PoolLedger.countDocuments({matchId:id}),1);assert.equal(await WalletTransaction.countDocuments({referenceId:id,type:"RACE_REWARD"}),1);
 await poolCommand(a,{action:"LEAVE"});await poolCommand(b,{action:"LEAVE"});
 await poolCommand(a,{action:"JOIN",stake:100});await PoolSeat.updateOne({userId:a},{$set:{joined:Date.now()-5100}});await tickPool();av=await poolView(a);assert.equal(av.state!.players[1].isBot,true);
 const botId=av.state!.id;await poolCommand(a,{action:"STATUS"});assert.equal((await poolView(a)).state!.id,botId);
 await PoolLiveMatch.updateOne({key:botId},{$set:{"state.players.0.lastSeen":Date.now()-31000}});await tickPool();av=await poolView(a);assert.equal(av.state!.winner,1);assert(av.state!.settled);
 console.log("PASS: two-player pairing, concurrent joins, duplicate shots, resume, AI fallback, insufficient funds, disconnect forfeit, atomic entries, 90/10 payout, idempotent settlement.");
} finally {
 assert(db.connection.name.startsWith("pool_qa_"));await db.connection.dropDatabase();await db.disconnect();
}

}
main().catch(error => { console.error(error); process.exitCode=1; });
