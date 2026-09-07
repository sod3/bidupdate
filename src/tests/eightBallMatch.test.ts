import { describe, expect, it } from "vitest";
import { economics, newMatch, resolveShot, simulateShot, type Report } from "../lib/eight-ball/match";
import { cloneBalls, createRack, validCuePlacement } from "../lib/eight-ball/physics";
const match = () => newMatch("test", 100, [0,1].map(i=>({id:String(i),username:`Player ${i}`,level:1,rank:"Bronze III",isBot:false,lastSeen:0})),0);
const report = (patch: Partial<Report> = {}): Report => ({ firstHit:1,pots:[],railsAfter:[1],scratch:false,...patch });
describe("authoritative pool rules",()=>{
 it("calculates the 90/10 pot with integer coins",()=>{expect(economics(100)).toEqual({stake:100,totalPot:200,reward:180,fee:20});expect(economics(100000).reward).toBe(180000);expect(()=>economics(101)).toThrow();});
 it("requires four distinct object balls for an unpotted break",()=>{const s=match();resolveShot(s,cloneBalls(s.balls),report({railsAfter:[1,1,1,1]}));expect(s.opening).toBe(true);expect(s.turn).toBe(1);});
 it("keeps the table open after a break pot",()=>{const s=match();resolveShot(s,cloneBalls(s.balls),report({pots:[1]}));expect(s.groups).toEqual([null,null]);expect(s.turn).toBe(0);expect(s.opening).toBe(false);});
 it("assigns groups only after a legal post-break pot",()=>{const s=match();s.opening=false;resolveShot(s,cloneBalls(s.balls),report({firstHit:9,pots:[9]}));expect(s.groups).toEqual(["STRIPES","SOLIDS"]);});
 it("awards ball in hand for scratch, wrong contact and no rail",()=>{for(const r of [report({scratch:true}),report({firstHit:9}),report({railsAfter:[]})]){const s=match();s.opening=false;s.groups=["SOLIDS","STRIPES"];resolveShot(s,cloneBalls(s.balls),r);expect(s.ballInHand).toBe(true);expect(s.turn).toBe(1);}});
 it("rejects an early eight and scratching on the final eight",()=>{for(const scratch of [false,true]){const s=match();s.opening=false;s.groups=["SOLIDS","STRIPES"];resolveShot(s,cloneBalls(s.balls),report({firstHit:8,pots:[8],scratch}));expect(s.winner).toBe(1);}});
 it("wins only after clearing the assigned group before the shot",()=>{const s=match();s.opening=false;s.groups=["SOLIDS","STRIPES"];s.balls.forEach(b=>{if(b.number>0&&b.number<8)b.pocketed=true;});resolveShot(s,cloneBalls(s.balls),report({firstHit:8,pots:[8]}));expect(s.winner).toBe(0);});
 it("re-racks eight on break",()=>{const s=match();resolveShot(s,cloneBalls(s.balls),report({pots:[8]}));expect(s.winner).toBeNull();expect(s.balls.filter(b=>b.pocketed)).toHaveLength(0);});
 it("rejects nonfinite placement and malformed shots",()=>{expect(validCuePlacement(NaN,0,createRack())).toBe(false);expect(()=>simulateShot(createRack(),{angle:NaN,power:1,spin:{x:0,y:0}})).toThrow();});
 it("simulates a deterministic break that remains on the table",()=>{const input={angle:.008,power:1,spin:{x:0,y:0}},a=simulateShot(createRack(),input),b=simulateShot(createRack(),input);expect(a.balls).toEqual(b.balls);expect(a.report.firstHit).toBe(1);expect(a.frames.length).toBeGreaterThan(30);expect(a.balls.every(b=>b.pocketed||(Math.abs(b.x)<1.3&&Math.abs(b.z)<2.5))).toBe(true);});
 it("produces a legal expert break",()=>{const result=simulateShot(createRack(),{angle:-.018,power:1,spin:{x:0,y:.1}},false);expect(result.report.scratch).toBe(false);expect(result.report.pots.some(n=>n>0)||new Set(result.report.railsAfter.filter(n=>n>0)).size>=4).toBe(true);});
});
