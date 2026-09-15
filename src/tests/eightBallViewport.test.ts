import { describe, expect, it } from "vitest";
import { canvasRadius, pointerToWorld, poolViewport } from "../lib/eight-ball/viewport";
import { BALL_RADIUS, POCKETS, cloneBalls, createRack, stepPoolPhysics, strikeCueBall } from "../lib/eight-ball/physics";
import { simulateShot } from "../lib/eight-ball/match";

describe("pool viewport and numerical boundaries",()=>{
  it.each([[0,0],[-1,300],[300,0],[NaN,20],[Infinity,500]])("rejects unusable layout %s x %s",(w,h)=>expect(poolViewport(w,h,2)).toBeNull());
  it.each([[1,1],[20,10],[76,34],[320,568],[390,844],[844,390],[768,1024],[1024,768],[1366,768],[1920,1080]])("fits every table proportion at %s x %s",(w,h)=>{
    const v=poolViewport(w,h,3)!;
    expect(v.scale*5.23).toBeLessThan(w);expect(v.scale*2.89).toBeLessThan(h);expect(v.dpr).toBe(2);
    for(const radius of [BALL_RADIUS*v.scale, ...POCKETS.map(p=>p.radius*v.scale), BALL_RADIUS*v.scale-.3])expect(canvasRadius(radius)).toBeGreaterThanOrEqual(0);
    const world={x:.72,z:-1.62};
    // CSS transforms and browser zoom change the displayed rect, not the world.
    const rect={left:35,top:73,width:w*.96,height:h*.96};
    const pos=pointerToWorld(rect.left+(v.cx+world.z*v.scale)*.96,rect.top+(v.cy+world.x*v.scale)*.96,rect,v)!;
    expect(pos.x).toBeCloseTo(world.x,10);expect(pos.z).toBeCloseTo(world.z,10);
  });
  it.each([NaN,Infinity,-Infinity,-.243])("never returns an invalid canvas radius from %s",r=>expect(canvasRadius(r)).toBe(0));
  it("does not advance physics for zero, negative or nonfinite elapsed time",()=>{
    const balls=createRack();strikeCueBall(balls,0,1,{x:0,y:0});const before=cloneBalls(balls);
    for(const dt of [0,-1,NaN,Infinity])stepPoolPhysics(balls,dt);
    expect(balls).toEqual(before);expect(strikeCueBall(balls,NaN,1,{x:0,y:0})).toBe(false);
  });
  it("keeps recorded and unrecorded simulation timing identical without mutating the rack",()=>{
    const balls=createRack(),before=cloneBalls(balls),shot={angle:0,power:1,spin:{x:0,y:0}};
    const recorded=simulateShot(balls,shot),fast=simulateShot(balls,shot,false);
    expect(balls).toEqual(before);expect(recorded.balls).toEqual(fast.balls);
    expect(recorded.duration).toBe(fast.duration);expect(fast.duration).toBeGreaterThan(0);
    expect(recorded.duration).toBeCloseTo((recorded.frames.length-1)/30*1000);
  });
  it.each(POCKETS)("captures a ball entering pocket $x, $z",p=>{
    const b=createRack()[0];b.x=p.x;b.z=p.z;
    expect(stepPoolPhysics([b],1/240).pocketed).toEqual([0]);expect(b.pocketed).toBe(true);
  });
});
