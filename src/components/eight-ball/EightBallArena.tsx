"use client";

import { useEffect, useRef } from "react";
import { BALL_RADIUS, POCKETS, createRack, colorForBall, predictAim, validCuePlacement, type PoolBallState } from "@/lib/eight-ball/physics";
import type { MatchState } from "@/lib/eight-ball/match";
import { canvasRadius, pointerToWorld, poolViewport } from "@/lib/eight-ball/viewport";

type Props = { state: MatchState | null; clockOffset: number; interactive: boolean; angle: number; power: number | { current: number }; onAim: (angle: number) => void; onShoot?: (angle: number, power: number) => void; onPlace: (x: number, z: number) => void; onSound: (kind: string, force: number) => void; preview?: boolean };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.roundRect(x,y,w,h,canvasRadius(r)); }
function sphere(c: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, rotation = 0, opacity = 1) {
  if (![x,y,r,rotation,opacity].every(Number.isFinite) || r <= 0) return;
  c.save(); c.globalAlpha = opacity;
  c.fillStyle = "#0008"; c.beginPath(); c.ellipse(x+r*.15,y+r*.42,r*1.08,r*.86,0,0,Math.PI*2);c.fill();
  c.beginPath(); c.arc(x,y,r,0,Math.PI*2);c.clip();
  c.fillStyle = n >= 9 || n===0 ? "#fff9e9" : colorForBall(n);c.fillRect(x-r,y-r,r*2,r*2);
  if(n>=9) { c.save();c.translate(x,y);c.rotate(Math.sin(rotation*.24)*.7);c.fillStyle=colorForBall(n);c.fillRect(-r,-r*.56,r*2,r*1.12);c.restore(); }
  const shade=c.createRadialGradient(x-r*.32,y-r*.4,r*.05,x+r*.1,y+r*.15,r*1.18);
  shade.addColorStop(0,"#ffffff8a");shade.addColorStop(.36,"#ffffff08");shade.addColorStop(.72,"#00000010");shade.addColorStop(1,"#000000bc");c.fillStyle=shade;c.fillRect(x-r,y-r,r*2,r*2);
  if(n>0) { c.fillStyle="#fffdf0";c.beginPath();c.arc(x,y,r*.48,0,Math.PI*2);c.fill();c.fillStyle="#10151c";c.font=`800 ${r*.73}px Arial`;c.textAlign="center";c.textBaseline="middle";c.fillText(String(n),x,y+r*.045); }
  c.fillStyle="#ffffffd9";c.beginPath();c.ellipse(x-r*.32,y-r*.45,r*.24,r*.12,-.5,0,Math.PI*2);c.fill();
  c.strokeStyle="#ffffff50";c.lineWidth=Math.min(.5,r*.2);c.beginPath();c.arc(x,y,canvasRadius(r-Math.min(.3,r*.15)),Math.PI,Math.PI*1.6);c.stroke();c.restore();
}
function cueArt(c: CanvasRenderingContext2D, x: number, y: number, angle: number, scale: number, pull: number) {
  c.save();c.translate(x,y);c.rotate(angle);c.translate(-pull,0);
  const length=scale*1.62, thick=Math.max(2,scale*.016);
  c.shadowColor="#0008";c.shadowBlur=4;c.shadowOffsetY=3;
  const wood=c.createLinearGradient(0,-thick,-length,thick);wood.addColorStop(0,"#ffedc2");wood.addColorStop(.5,"#bf9359");wood.addColorStop(.65,"#301c21");wood.addColorStop(1,"#090e18");c.fillStyle=wood;
  c.beginPath();c.moveTo(0,-thick*.45);c.lineTo(-length,-thick);c.lineTo(-length,thick);c.lineTo(0,thick*.45);c.closePath();c.fill();c.shadowBlur=0;c.shadowOffsetY=0;
  c.strokeStyle="#ffe8b980";c.lineWidth=.7;c.beginPath();c.moveTo(-5,-thick*.2);c.lineTo(-length,-thick*.6);c.stroke();
  c.fillStyle="#e6e7ce";c.fillRect(-7,-thick*.5,5,thick);c.fillStyle="#58b4d1";c.fillRect(-2,-thick*.5,2,thick);
  for(let i=0;i<7;i++){c.strokeStyle=i%2?"#7898aa":"#dfbb71";c.lineWidth=1;c.beginPath();c.moveTo(-length*.68-i*scale*.055,-thick*.7);c.lineTo(-length*.71-i*scale*.055,thick*.7);c.stroke();}
  c.fillStyle="#d9b777";c.fillRect(-length,-thick,3,thick*2);c.restore();
}
export function EightBallArena(props: Props) {
  const host = useRef<HTMLCanvasElement>(null), live=useRef(props);
  useEffect(()=>{live.current=props;},[props]);
  useEffect(()=>{
    const canvas=host.current!;const c=canvas.getContext("2d",{alpha:false,desynchronized:true})!;
    const backing=document.createElement("canvas"), bg=backing.getContext("2d")!;
    let w=0,h=0,dpr=1,s=1,cx=0,cy=0,raf=0,drag=false,placing:{x:number;z:number}|null=null;
    let viewport:ReturnType<typeof poolViewport>=null,resizePending=true;
    let pointerId:number|null=null,dragStart:{x:number;z:number}|null=null,dragPower=0,gestureVersion=-1;
    let pulling=false;
    let soundId="",soundIndex=0,localAngle=0,lastAimSent=0,renderedMatchId:string|null|undefined=undefined;
    let aimVersion=-1,aimAngle=Infinity,aimPrediction:ReturnType<typeof predictAim>|null=null;
    let ballSprites:HTMLCanvasElement[][]=[];
    const rack=createRack();
    const map=(x:number,z:number)=>({x:cx+z*s,y:cy+x*s});
    function rebuildBallSprites(){
      const radius=BALL_RADIUS*s,size=Math.max(8,Math.ceil(radius*3));
      ballSprites=Array.from({length:16},(_,number)=>{
        const phases=number>=9?12:1;
        return Array.from({length:phases},(_,phase)=>{
          const sprite=document.createElement("canvas");sprite.width=Math.ceil(size*dpr);sprite.height=Math.ceil(size*dpr);
          const sc=sprite.getContext("2d")!;sc.setTransform(dpr,0,0,dpr,0,0);
          sphere(sc,size/2,size/2,radius,number,phase/phases*Math.PI*2/.24);
          return sprite;
        });
      });
    }
    function drawBall(number:number,x:number,z:number,rotation:number){
      if (![number,x,z,rotation].every(Number.isFinite)) return;
      const variants=ballSprites[number];if(!variants)return;
      const normalized=((rotation*.24)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
      const sprite=variants[Math.floor(normalized/(Math.PI*2)*variants.length)%variants.length];
      const px=cx+z*s,py=cy+x*s,size=sprite.width/dpr;c.drawImage(sprite,px-size/2,py-size/2,size,size);
    }
    function resize(){
      // Layout dimensions exclude the table's entrance transform. Input uses the
      // displayed rect to undo that transform separately.
      const next=poolViewport(canvas.clientWidth,canvas.clientHeight,window.devicePixelRatio);
      if(!next){viewport=null;cancelGesture();return;}
      if(viewport&&w===next.width&&h===next.height&&dpr===next.dpr)return;
      cancelGesture();viewport=next;w=next.width;h=next.height;dpr=next.dpr;
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);backing.width=canvas.width;backing.height=canvas.height;
      c.setTransform(dpr,0,0,dpr,0,0);bg.setTransform(dpr,0,0,dpr,0,0);
      s=next.scale;cx=next.cx;cy=next.cy;
      const outerW=5.23*s,outerH=2.89*s,x=cx-outerW/2,y=cy-outerH/2;
      bg.fillStyle="#101b2b";bg.fillRect(0,0,w,h);
      const env=bg.createRadialGradient(cx,cy,s*.6,cx,cy,s*3.2);env.addColorStop(0,"#263d52");env.addColorStop(1,"#080f1e");bg.fillStyle=env;bg.fillRect(0,0,w,h);
      bg.shadowColor="#000b";bg.shadowBlur=s*.2;bg.shadowOffsetY=s*.1;rounded(bg,x-4,y+4,outerW+8,outerH+8,s*.15);bg.fillStyle="#030913";bg.fill();bg.shadowBlur=0;bg.shadowOffsetY=0;
      const metal=bg.createLinearGradient(0,y,0,y+outerH);metal.addColorStop(0,"#a7afb7");metal.addColorStop(.06,"#334458");metal.addColorStop(.5,"#121d2a");metal.addColorStop(.94,"#79818b");metal.addColorStop(1,"#263043");rounded(bg,x-2,y-2,outerW+4,outerH+4,s*.14);bg.fillStyle=metal;bg.fill();
      const wood=bg.createLinearGradient(x,y,x,y+outerH);wood.addColorStop(0,"#42121b");wood.addColorStop(.035,"#b44f44");wood.addColorStop(.08,"#511320");wood.addColorStop(.89,"#341220");wood.addColorStop(.95,"#a34439");wood.addColorStop(1,"#3b101b");rounded(bg,x,y,outerW,outerH,s*.14);bg.fillStyle=wood;bg.fill();
      bg.save();rounded(bg,x,y,outerW,outerH,s*.14);bg.clip();for(let i=0;i<65;i++){bg.strokeStyle=i%2?"#edb17c0d":"#17081125";bg.lineWidth=.6;bg.beginPath();bg.moveTo(x,y+i*outerH/64);bg.bezierCurveTo(cx-s,y+i*outerH/64+2,cx+s,y+i*outerH/64-2,x+outerW,y+i*outerH/64);bg.stroke();}bg.restore();
      const clothX=cx-2.405*s,clothY=cy-1.235*s,clothW=4.81*s,clothH=2.47*s;
      bg.fillStyle="#071a29";rounded(bg,clothX-4,clothY-4,clothW+8,clothH+8,s*.03);bg.fill();
      const felt=bg.createRadialGradient(cx-s*.3,cy-s*.2,0,cx,cy,s*2.9);felt.addColorStop(0,"#58c8db");felt.addColorStop(.45,"#299cb7");felt.addColorStop(1,"#07516f");bg.fillStyle=felt;bg.fillRect(clothX,clothY,clothW,clothH);
      bg.save();bg.beginPath();bg.rect(clothX,clothY,clothW,clothH);bg.clip();
      for(let i=0;i<9000;i++){const px=((i*7919)%10007)/10007,py=((i*3571)%10009)/10009;bg.fillStyle=i%2?"#ecffff0b":"#0019290b";bg.fillRect(clothX+px*clothW,clothY+py*clothH,.6,.6);}bg.restore();
      // Six separate beveled cushions, leaving open, dark pocket mouths.
      const cushion=(x1:number,y1:number,x2:number,y2:number,horizontal:boolean)=>{
        const grad=bg.createLinearGradient(x1,y1,horizontal?x1:x2,horizontal?y2:y1);grad.addColorStop(0,"#a4e0ea");grad.addColorStop(.14,"#4297b0");grad.addColorStop(.8,"#12647f");grad.addColorStop(1,"#063649");bg.fillStyle=grad;
        bg.beginPath();bg.moveTo(x1,y1);bg.lineTo(x2,y1);bg.lineTo(x2-(horizontal?s*.08:0),y2);bg.lineTo(x1+(horizontal?s*.08:0),y2);bg.closePath();bg.fill();bg.strokeStyle="#8bd9e270";bg.lineWidth=.65;bg.stroke();
      };
      for(const side of [-1,1]){
        const yy=cy+side*1.235*s;for(const lr of [-1,1]){const left=lr<0?cx-2.28*s:cx+.13*s;const right=lr<0?cx-.13*s:cx+2.28*s;cushion(left,yy,right,yy-side*.095*s,true);}
        cushion(cx+side*2.405*s,cy-1.10*s,cx+side*2.31*s,cy+1.10*s,false);
      }
      bg.strokeStyle="#dcf9ff22";bg.lineWidth=.8;bg.beginPath();bg.moveTo(cx-1.48*s,clothY+.1*s);bg.lineTo(cx-1.48*s,clothY+clothH-.1*s);bg.stroke();
      for(const z of [-1.48,.73]){const p=map(0,z);bg.beginPath();bg.arc(p.x,p.y,s*.011,0,Math.PI*2);bg.fillStyle="#e3f7f57a";bg.fill();}
      for(const pocket of POCKETS){const p=map(pocket.x,pocket.z),r=s*pocket.radius;const rim=bg.createRadialGradient(p.x,p.y,r*.2,p.x,p.y,r*1.2);rim.addColorStop(0,"#000205");rim.addColorStop(.7,"#010307");rim.addColorStop(.86,"#361e25");rim.addColorStop(1,"#a7a2a5");bg.fillStyle=rim;bg.beginPath();bg.arc(p.x,p.y,r*1.15,0,Math.PI*2);bg.fill();bg.strokeStyle="#f5dde136";bg.lineWidth=.6;bg.stroke();}
      for(const side of [-1,1])for(const z of [-1.76,-1.17,-.59,.59,1.17,1.76]){const p=map(side*1.35,z);bg.save();bg.translate(p.x,p.y);bg.rotate(Math.PI/4);bg.fillStyle="#cdd8da";bg.fillRect(-s*.009,-s*.009,s*.018,s*.018);bg.restore();}
      bg.font=`600 ${Math.max(6,s*.055)}px Arial`;bg.textAlign="center";bg.fillStyle="#d6ae7e";bg.fillText("A U R U M   •   T O U R N A M E N T",cx,cy+1.408*s);
      rebuildBallSprites();
    }
    const scheduleResize=()=>{resizePending=true;};
    const observer=new ResizeObserver(scheduleResize);observer.observe(canvas);
    window.addEventListener("resize",scheduleResize);
    function draw(){
      const pixelRatio=Number.isFinite(window.devicePixelRatio)&&window.devicePixelRatio>0?Math.min(2,window.devicePixelRatio):1;
      if(resizePending||dpr!==pixelRatio){resizePending=false;resize();}
      const p=live.current,now=Date.now()+(Number.isFinite(p.clockOffset)?p.clockOffset:0),state=p.state,trace=state?.trace;
      if(state?.id!==renderedMatchId){renderedMatchId=state?.id;localAngle=Number.isFinite(p.angle)?p.angle:0;lastAimSent=localAngle;aimPrediction=null;cancelGesture();}
      if(drag&&(!p.interactive||state?.version!==gestureVersion))cancelGesture();
      if (!viewport || !backing.width || !backing.height) { raf=requestAnimationFrame(draw); return; }
      c.drawImage(backing,0,0,w,h);
      const balls:PoolBallState[]=state?.balls??rack;
      const tracing=!!trace&&trace.frames.length>0&&now<trace.at+trace.duration;
      let traceA:number[][]|null=null,traceB:number[][]|null=null,traceT=0;
      if(tracing){
        const at=clamp((now-trace.at)/1000*30,0,trace.frames.length-1),idx=Math.floor(at),a=trace.frames[idx],b=trace.frames[Math.min(idx+1,trace.frames.length-1)],t=at-idx;
        traceA=a;traceB=b;traceT=t;
      }
      if(trace){
        if(soundId!==trace.id){soundId=trace.id;soundIndex=0;while(soundIndex<trace.sounds.length&&trace.sounds[soundIndex].at<now-trace.at-400)soundIndex++;}
        while(soundIndex<trace.sounds.length&&trace.sounds[soundIndex].at<=now-trace.at){const sound=trace.sounds[soundIndex++];p.onSound(sound.kind,sound.force);}
      }
      const storedCue=balls.find(b=>b.number===0&&!b.pocketed);
      const cue=storedCue;
      const ready=!state||now>=state.readyAt;
      if(cue && ((p.interactive&&!state?.ballInHand&&ready)||p.preview)){
        const angle=p.preview?0:localAngle,version=state?.version??-1;
        if(!aimPrediction||aimVersion!==version||aimAngle!==angle){aimPrediction=predictAim(balls,angle);aimVersion=version;aimAngle=angle;}
        const pred=aimPrediction,start=map(cue.x,cue.z),end=map(pred.endX,pred.endZ);
        c.strokeStyle="#10232a90";c.lineWidth=2.8;c.beginPath();c.moveTo(start.x,start.y);c.lineTo(end.x,end.y);c.stroke();
        c.strokeStyle="#f4ffffdc";c.lineWidth=.85;c.stroke();c.beginPath();c.arc(end.x,end.y,BALL_RADIUS*s,0,Math.PI*2);c.fillStyle="#ffffff12";c.fill();c.lineWidth=.8;c.stroke();
        if(pred.objectEndX!==null&&pred.objectEndZ!==null){const dest=map(pred.objectEndX,pred.objectEndZ);c.beginPath();c.moveTo(end.x,end.y);c.lineTo(dest.x,dest.y);c.strokeStyle="#f8ebbdaf";c.stroke();}
        const power=typeof p.power==="number"?p.power:p.power.current;
        cueArt(c,start.x,start.y,angle,s,s*(.1+(p.preview?0:drag?dragPower:clamp(Number.isFinite(power)?power:0,0,1))*.32));
      }
      if(trace&&trace.frames.length&&now>=trace.at-250&&now<trace.at){const v=trace.frames[0].find(b=>b[0]===0);if(v){const pt=map(v[1],v[2]);cueArt(c,pt.x,pt.y,trace.input.angle,s,s*(.1+trace.input.power*.32)*(1-clamp((now-trace.at+110)/110,0,1)));}}
      // Interpolate the compact network trace directly into canvas draws.
      // This avoids allocating 16 objects (and collecting them) every frame.
      if(traceA&&traceB)for(let i=0;i<traceA.length;i++){const v=traceA[i],next=traceB[i];if(v[3])continue;drawBall(v[0],v[1]+(next[1]-v[1])*traceT,v[2]+(next[2]-v[2])*traceT,v[4]+v[5]+(next[4]+next[5]-v[4]-v[5])*traceT);}
      if(!tracing)for(const ball of balls){if(ball.pocketed||(placing&&state?.ballInHand&&ball.number===0))continue;drawBall(ball.number,ball.x,ball.z,ball.rotationX+ball.rotationZ);}
      if(!tracing&&placing&&state?.ballInHand)drawBall(0,placing.x,placing.z,0);
      if(state?.ballInHand&&p.interactive){const pos=placing??cue??{x:0,z:-1.48};const pt=map(pos.x,pos.z);c.strokeStyle=validCuePlacement(pos.x,pos.z,balls)?"#d2fff6":"#ff806c";c.lineWidth=1.2;c.beginPath();c.arc(pt.x,pt.y,BALL_RADIUS*s+4+Math.sin(now/250),0,Math.PI*2);c.stroke();}
      raf=requestAnimationFrame(draw);
    }
    function cancelGesture(){const id=pointerId;pointerId=null;drag=false;dragStart=null;placing=null;dragPower=0;pulling=false;if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
    function point(e:PointerEvent){return viewport?pointerToWorld(e.clientX,e.clientY,canvas.getBoundingClientRect(),viewport):null;}
    function aim(e:PointerEvent){
      const p=live.current;if(!p.interactive||!viewport||(pointerId!==null&&pointerId!==e.pointerId))return;
      const pos=point(e);if(!pos)return;
      if(p.state?.ballInHand){if(drag)placing=pos;return;}
      const cue=p.state?.balls.find(b=>b.number===0&&!b.pocketed)??rack[0];
      if(drag&&dragStart){
        const dx=dragStart.x-pos.x,dz=dragStart.z-pos.z,pull=dx*Math.sin(localAngle)+dz*Math.cos(localAngle),side=Math.abs(dx*Math.cos(localAngle)-dz*Math.sin(localAngle));
        if(pulling||(pull>.06&&side<Math.max(.08,pull*.7))){pulling=true;dragPower=clamp(pull/1.2,0,1);return;}
      }
      if(e.pointerType==="mouse"||drag||e.type==="pointerdown"){
        if(Math.hypot(pos.x-cue.x,pos.z-cue.z)<BALL_RADIUS)return;
        const angle=Math.atan2(pos.x-cue.x,pos.z-cue.z);
        if(drag&&Math.abs(angle-localAngle)>.02)dragStart=pos;
        localAngle=angle;
        if(Math.abs(localAngle-lastAimSent)>.0005){lastAimSent=localAngle;p.onAim(localAngle);}
      }
    }
    function down(e:PointerEvent){if(!live.current.interactive||!viewport||pointerId!==null||!e.isPrimary||e.button!==0)return;e.preventDefault();aim(e);pointerId=e.pointerId;drag=true;dragStart=point(e);gestureVersion=live.current.state?.version??-1;canvas.setPointerCapture(e.pointerId);if(live.current.state?.ballInHand)placing=dragStart;}
    function up(e:PointerEvent){if(e.pointerId!==pointerId)return;aim(e);const p=live.current,pos=placing,power=dragPower,valid=p.interactive&&p.state?.version===gestureVersion;cancelGesture();if(!valid)return;if(pos&&p.state?.ballInHand){if(validCuePlacement(pos.x,pos.z,p.state.balls))p.onPlace(pos.x,pos.z);}else if(power>=.05)p.onShoot?.(localAngle,power);}
    function cancel(e:PointerEvent){if(e.pointerId===pointerId)cancelGesture();}
    canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",aim);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",cancel);canvas.addEventListener("lostpointercapture",cancel);window.addEventListener("blur",cancelGesture);raf=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(raf);cancelGesture();observer.disconnect();window.removeEventListener("resize",scheduleResize);window.removeEventListener("blur",cancelGesture);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",aim);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",cancel);canvas.removeEventListener("lostpointercapture",cancel);};
  },[]);
  return <canvas ref={host} aria-label="8 Ball pool table. Point to aim, pull back and release to shoot, or use the left power control." style={{width:"100%",height:"100%",display:"block",touchAction:"none"}}/>;
}
