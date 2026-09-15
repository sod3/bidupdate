import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { SignJWT } from "jose";
import { io as client } from "socket.io-client";
import { createGameSocket } from "../../scripts/pool-socket.mjs";
import { installPoolLive } from "../../scripts/pool-live.mjs";

const resources=[];
afterEach(async()=>{for(const dispose of resources.reverse())await dispose();resources.length=0;vi.restoreAllMocks();vi.unstubAllEnvs();});
async function setup(path="/race-socket") {
  const secret="pool-test-secret-with-at-least-32-characters";
  vi.stubEnv("JWT_SECRET",secret);vi.stubEnv("RACE_ALLOWED_ORIGINS","https://pool.example.test");
  const server=createServer(),io=createGameSocket(server,path);
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  resources.push(()=>new Promise(resolve=>io.close(resolve)));
  const token=await new SignJWT({username:"Player"}).setProtectedHeader({alg:"HS256"}).setIssuer("neon-drift-web").setAudience("neon-drift-race-server").setSubject("qa-user").setExpirationTime("1m").sign(new TextEncoder().encode(secret));
  const socket=client(`http://127.0.0.1:${server.address().port}`,{path,transports:["websocket"],auth:{token},autoConnect:false,reconnection:false,extraHeaders:{Origin:"https://pool.example.test"}});
  resources.push(()=>socket.disconnect());return {socket,server,io};
}
describe("pool Socket.IO transport",()=>{
  it.each(["/race-socket","/socket.io"])("authenticates upgrades and resumes persisted state on %s",async path=>{
    const {socket,io}=await setup(path);
    const view={now:Date.now(),selfId:"qa-user",queuedAt:null,state:{id:"persisted",version:4,settled:false}};
    vi.spyOn(globalThis,"fetch").mockImplementation(async(_url,options)=>{
      const body=JSON.parse(options.body);return Response.json(body.action==="TICK"?{views:[view]}:view);
    });
    resources.push(installPoolLive(io,"http://pool-api.test",{idleTicks:false}));
    const connected=once(socket,"connect");socket.connect();await connected;
    let state=once(socket,"pool-live:state");
    expect(await socket.timeout(2000).emitWithAck("pool-live:command",{action:"STATUS"})).toEqual({ok:true});
    expect((await state)[0].state.id).toBe("persisted");
    socket.disconnect();const reconnected=once(socket,"connect");socket.connect();await reconnected;
    state=once(socket,"pool-live:state");await socket.timeout(2000).emitWithAck("pool-live:command",{action:"STATUS"});
    expect((await state)[0].state.version).toBe(4);
    expect(await socket.timeout(2000).emitWithAck("pool-live:command",null)).toEqual({error:"Invalid table command."});
  });
  it("rejects unlisted cross-origin WebSocket handshakes",async()=>{
    const {socket}=await setup();vi.spyOn(console,"warn").mockImplementation(()=>{});
    socket.io.opts.extraHeaders={Origin:"https://untrusted.example.test"};
    const failed=once(socket,"connect_error");socket.connect();expect((await failed)[0]).toBeInstanceOf(Error);expect(socket.connected).toBe(false);
  });
  it("rejects forged authentication before installing a player",async()=>{
    const {socket}=await setup();socket.auth={token:"forged"};
    const failed=once(socket,"connect_error");socket.connect();expect((await failed)[0].message).toContain("authentication failed");
  });
});
