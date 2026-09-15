import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { newMatch, resolveShot, simulateShot, type MatchState, type Shot } from "../src/lib/eight-ball/match";
import { poolViewport } from "../src/lib/eight-ball/viewport";

async function table(page: Page, httpOnly=false) {
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error"||m.type()==="warning")errors.push(m.text());});
  await page.addInitScript(()=>{
    const original=CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc=function(x,y,r,...rest){if(!Number.isFinite(r)||r<0)throw new Error(`Invalid canvas radius: ${r}`);return original.call(this,x,y,r,...rest);};
    const ellipse=CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse=function(x,y,rx,ry,...rest){if(![rx,ry].every(r=>Number.isFinite(r)&&r>=0))throw new Error("Invalid ellipse radius");return ellipse.call(this,x,y,rx,ry,...rest);};
    const gradient=CanvasRenderingContext2D.prototype.createRadialGradient;
    CanvasRenderingContext2D.prototype.createRadialGradient=function(x,y,r,x1,y1,r1){if(![r,r1].every(v=>Number.isFinite(v)&&v>=0))throw new Error("Invalid gradient radius");return gradient.call(this,x,y,r,x1,y1,r1);};
  });
  let state:MatchState|null=null,connection:WebSocketRoute|null=null,connections=0,statusCount=0;
  const commands:Record<string,unknown>[]=[];
  function rack(){state=newMatch(`qa-${Date.now()}`,100,[0,1].map(i=>({id:String(i),username:i?"Rival":"Player",level:1,rank:"Bronze",isBot:false,lastSeen:Date.now()})),Date.now()-5000);state.deadline=Date.now()+35000;}
  const view=()=>({now:Date.now(),selfId:"0",queuedAt:null,state});
  function handle(input:Record<string,unknown>){
    if(input.action==="STATUS")statusCount++;else commands.push(input);
    if(input.action==="JOIN")rack();
    if(input.action==="LEAVE")state=null;
    if(input.action==="SHOT"&&state){
      expect(input.version).toBe(state.version);
      const before=state.balls,shot={angle:input.angle,power:input.power,spin:input.spin} as Shot,result=simulateShot(before,shot);
      state.balls=result.balls;state.trace={id:`shot-${state.version}`,at:Date.now()+100,input:shot,frames:result.frames,sounds:result.sounds,duration:result.duration};
      resolveShot(state,before,result.report);state.version++;state.readyAt=state.trace.at+result.duration+550;state.deadline=state.readyAt+35000;
    }
    if(input.action==="PLACE"&&state){Object.assign(state.balls[0],{x:input.x,z:input.z,pocketed:false});state.ballInHand=false;state.version++;}
    return view();
  }
  await page.route("**/api/auth/session*",r=>r.fulfill({json:{authenticated:true,user:{username:"Player",fullName:"Player",email:"test@example.test",role:"USER"},wallet:{balance:1000,cashBalance:1000,bonusBalance:0,withdrawableBalance:0,reservedBalance:0,totalWagered:0,totalWon:0,transactions:[],creditRequests:[]}}}));
  await page.route("**/api/eight-ball/session",r=>r.fulfill({json:{token:"qa",socketPath:"/qa-socket"}}));
  await page.route("**/api/eight-ball/live",async r=>{
    const input=r.request().postDataJSON();
    // A slow heartbeat must not disable aiming or the power control.
    if(input.action==="STATUS")await new Promise(resolve=>setTimeout(resolve,150));
    await r.fulfill({json:handle(input)});
  });
  await page.routeWebSocket("**/qa-socket/**",ws=>{
    connections++;connection=ws;
    if(httpOnly)return;
    ws.send('0{"sid":"qa","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
    ws.onMessage(message=>{
      const packet=String(message);
      if(packet.startsWith("40")){ws.send('40{"sid":"qa"}');return;}
      const match=/^42(\d+)(\[.*)$/.exec(packet);if(!match)return;
      const [event,input]=JSON.parse(match[2]);if(event!=="pool-live:command")return;
      ws.send(`42${JSON.stringify(["pool-live:state",handle(input)])}`);ws.send(`43${match[1]}[{"ok":true}]`);
    });
  });
  await page.goto("/play/eight-ball");
  await expect(page.getByRole("button",{name:/PLAY FOR/})).toBeEnabled();
  await page.getByRole("button",{name:/PLAY FOR/}).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("slider")).toHaveAttribute("aria-disabled","false");
  // Finish the existing table entrance transform before coordinate assertions.
  await page.waitForTimeout(1000);
  return {errors,commands,get state(){return state!;},get connections(){return connections;},get statusCount(){return statusCount;},
    disconnect:()=>connection?.close({code:1012,reason:"QA temporary restart"}),
    push:()=>connection?.send(`42${JSON.stringify(["pool-live:state",view()])}`),
  };
}

async function world(page:Page,x:number,z:number){
  const box=(await page.locator("canvas").boundingBox())!,v=poolViewport(box.width,box.height,1)!;
  return {x:box.x+v.cx+z*v.scale,y:box.y+v.cy+x*v.scale};
}

test("aim, pull, release, moving trace and connection recovery",async({page},info)=>{
  const baseline=await page.evaluate(()=>new Promise<number>(resolve=>{const values:number[]=[];let previous=performance.now();function frame(t:number){values.push(t-previous);previous=t;if(values.length===45){values.sort((a,b)=>a-b);resolve(values[22]);}else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
  const qa=await table(page);
  const before=await page.locator("canvas").screenshot();
  const p=await world(page,.5,-.2);await page.mouse.move(p.x,p.y);
  await page.waitForTimeout(80);
  expect((await page.locator("canvas").screenshot()).equals(before)).toBe(false);
  const start=await world(page,0,-.2),end=await world(page,0,-1.4);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();
  await expect.poll(()=>qa.commands.filter(c=>c.action==="SHOT").length).toBe(1);
  expect(Number(qa.commands.find(c=>c.action==="SHOT")!.power)).toBeGreaterThan(.9);
  await page.waitForTimeout(200);const shotA=await page.locator("canvas").screenshot();
  await page.waitForTimeout(250);const shotB=await page.locator("canvas").screenshot();expect(shotA.equals(shotB)).toBe(false);
  const timing=await page.evaluate(()=>new Promise<{frames:number[];costs:number[]}>(resolve=>{
    const values:number[]=[],costs:number[]=[],original=window.requestAnimationFrame;let previous=performance.now();
    window.requestAnimationFrame=callback=>original.call(window,t=>{const start=performance.now();callback(t);costs.push(performance.now()-start);});
    function frame(t:number){values.push(t-previous);previous=t;if(values.length===90){window.requestAnimationFrame=original;resolve({frames:values.slice(1),costs});}else original.call(window,frame);}original.call(window,frame);
  }));
  const frames=timing.frames.sort((a,b)=>a-b),costs=timing.costs.sort((a,b)=>a-b);
  await info.attach("frame-timing",{body:JSON.stringify({baselineMedian:baseline,median:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],renderCallbackP95:costs[Math.floor(costs.length*.95)]}),contentType:"application/json"});
  expect(frames[Math.floor(frames.length*.5)]).toBeLessThan(35);
  expect(qa.connections).toBe(1);
  const matchId=qa.state.id;qa.disconnect();
  await expect.poll(()=>qa.connections).toBe(2);expect(qa.state.id).toBe(matchId);
  await page.screenshot({path:info.outputPath("table.png")});
  expect(qa.errors).toEqual([]);
});

test("resize, zero dimensions, orientation, touch cancellation and ball in hand",async({page},info)=>{
  const qa=await table(page);
  await page.locator("canvas").evaluate(node=>{node.style.width="1px";node.style.height="1px";});await page.waitForTimeout(80);
  await page.locator("canvas").evaluate(node=>{node.style.width="0px";node.style.height="0px";});await page.waitForTimeout(80);
  await page.locator("canvas").evaluate(node=>{node.style.width="100%";node.style.height="100%";});
  const size=page.viewportSize()!;await page.setViewportSize({width:size.height,height:size.width});await page.waitForTimeout(100);
  const ctx=await page.context().newCDPSession(page);
  const start=await world(page,0,-.3),end=await world(page,0,-1.2);
  await ctx.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:start.x,y:start.y}]});
  await ctx.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:end.x,y:end.y}]});
  await ctx.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});expect(qa.commands.some(c=>c.action==="SHOT")).toBe(false);
  qa.state.ballInHand=true;qa.state.version++;qa.push();await expect(page.getByText("BALL IN HAND · DRAG TO PLACE")).toBeVisible();
  const placed=await world(page,.5,-1);
  await ctx.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:start.x,y:start.y}]});
  await ctx.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:placed.x,y:placed.y}]});
  await ctx.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect.poll(()=>qa.commands.filter(c=>c.action==="PLACE").length).toBe(1);
  const input=qa.commands.find(c=>c.action==="PLACE")!;expect(input.x).toBeCloseTo(.5,1);expect(input.z).toBeCloseTo(-1,1);
  await expect(page.getByRole("slider")).toHaveAttribute("aria-disabled","false");
  // Touch power slider shoots once, even with compatibility mouse events.
  const box=(await page.getByRole("slider").boundingBox())!;
  await ctx.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box.x+box.width/2,y:box.y+5}]});
  await ctx.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:box.x+box.width/2,y:box.y+box.height*.8}]});
  await ctx.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect.poll(()=>qa.commands.filter(c=>c.action==="SHOT").length).toBe(1);
  await page.screenshot({path:info.outputPath("landscape.png")});expect(qa.errors).toEqual([]);
});

test("HTTP heartbeat keeps input enabled and next game starts once",async({page})=>{
  const qa=await table(page,true);
  const slider=page.getByRole("slider");
  const count=qa.statusCount;
  for(let i=0;i<12;i++){await expect(slider).toHaveAttribute("aria-disabled","false");await page.waitForTimeout(80);}
  await expect.poll(()=>qa.statusCount).toBeGreaterThan(count);
  qa.state.winner=0;qa.state.settled=true;qa.state.readyAt=Date.now()-2000;qa.state.version++;
  await expect(page.getByRole("heading",{name:"VICTORY"})).toBeVisible();
  const previous=qa.state.id;await page.getByRole("button",{name:"PLAY AGAIN"}).click();
  await expect.poll(()=>qa.state?.id).not.toBe(previous);
  await expect(slider).toHaveAttribute("aria-disabled","false");
  expect(qa.commands.filter(c=>c.action==="JOIN")).toHaveLength(2);
  expect(qa.errors).toEqual([]);
});
