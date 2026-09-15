"use client";
import { useCallback, useEffect, useRef, useState, useId } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { ArrowLeft, ArrowRight, Coins, Volume2, VolumeX, Maximize, Crosshair, Trophy, Shield, RotateCcw, X, Wifi, Settings2, Smartphone, Star } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { STAKES, economics, type MatchState, type Player } from "@/lib/eight-ball/match";
import { colorForBall } from "@/lib/eight-ball/physics";
import styles from "./pool.module.css";
const Arena=dynamic(()=>import("./EightBallArena").then(m=>m.EightBallArena),{ssr:false,loading:()=> <div className={styles.tableLoading}>Preparing your table</div>});
type View={now:number;selfId:string;queuedAt:number|null;state:MatchState|null};
function Avatar({name,rival=false}:{name:string;rival?:boolean}){
 const id=useId().replaceAll(":","");
 return <svg viewBox="0 0 160 180" role="img" aria-label={`${name}'s illustrated avatar`} className={styles.avatar}>
 <defs><linearGradient id={id} x2="1" y2="1"><stop stopColor={rival?"#935337":"#1b8c9c"}/><stop offset="1" stopColor="#12192a"/></linearGradient><linearGradient id={`${id}s`} x2=".8" y2="1"><stop stopColor="#e6b691"/><stop offset="1" stopColor="#9c674d"/></linearGradient></defs>
 <rect width="160" height="180" rx="13" fill={`url(#${id})`}/><circle cx="80" cy="67" r="58" fill="none" stroke="#fff" opacity=".12"/><path d="M0 150L160 34M0 178L160 62" stroke="#fff" opacity=".06" strokeWidth="20"/>
 <path d="M12 180L20 144Q34 124 58 123L101 123Q136 126 144 147L152 180" fill="#111c2b"/><path d="M57 115L58 135L80 154L104 133L101 113" fill={`url(#${id}s)`}/><path d="M54 129L80 154L63 166L44 135M105 127L80 154L96 166L116 136" fill="#f0e4cd"/><path d="M80 154L73 164L78 180L88 180L88 163" fill={rival?"#b77b35":"#1d899b"}/>
 <path d="M45 68Q44 30 80 29Q119 30 117 73L111 100Q98 124 80 126Q61 120 49 103Z" fill={`url(#${id}s)`}/><ellipse cx="45" cy="82" rx="6" ry="12" fill="#be8868"/><ellipse cx="115" cy="82" rx="6" ry="12" fill="#c68e6e"/>
 <path d={rival?"M43 76Q28 42 55 27Q72 11 95 26Q129 31 116 79L109 54Q85 61 65 44L49 64Z":"M44 80L40 49Q42 19 72 25Q100 13 117 35L122 56L115 79L105 49Q77 61 55 49L49 77Z"} fill={rival?"#513728":"#182329"}/>
 <path d="M55 73Q65 67 74 72M87 72Q97 67 106 73" fill="none" stroke="#503c34" strokeWidth="4" strokeLinecap="round"/><ellipse cx="65" cy="79" rx="4" ry="2.5" fill="#273640"/><ellipse cx="96" cy="79" rx="4" ry="2.5" fill="#273640"/><circle cx="66" cy="78" r="1" fill="#fff"/><circle cx="97" cy="78" r="1" fill="#fff"/>
 <path d="M80 80L76 94L85 95" fill="none" stroke="#98654f" strokeWidth="2"/><path d="M66 105Q80 112 96 103" fill="none" stroke="#754936" strokeWidth="2.5" strokeLinecap="round"/><path d="M51 94Q54 117 80 125Q103 119 111 95L103 112Q82 135 60 115Z" fill="#372f2c" opacity=".35"/>
 <path d="M28 151L51 143L60 180H22M111 143L135 152L143 180H103" fill={rival?"#334351":"#253d4b"}/><circle cx="120" cy="158" r="6" fill="#c6a368"/></svg>;
}
function BallRow({state,index}:{state:MatchState;index:number}){
 const group=state.groups[index],numbers=group==="SOLIDS"?[1,2,3,4,5,6,7]:group==="STRIPES"?[9,10,11,12,13,14,15]:[0,0,0,0,0,0,0];
 return <div className={styles.ballRow} aria-label={group??"Open table"}>{numbers.map((n,i)=><span key={i} className={`${styles.miniBall} ${n&&state.balls.find(b=>b.number===n)?.pocketed?styles.potted:""}`} style={{background:n?`radial-gradient(circle at 30% 25%,#ffffffad,transparent 38%),${n>=9?`linear-gradient(#eee 22%,${colorForBall(n)} 22% 78%,#eee 78%)`:colorForBall(n)}`:undefined}}>{n||""}</span>)}</div>;
}
const number=(n:number)=>n.toLocaleString();
export function EightBallExperience(){
 const wallet=useWallet(),router=useRouter(),socket=useRef<Socket|null>(null),audio=useRef<AudioContext|null>(null),mutedRef=useRef(false),refreshWallet=wallet.refreshWallet;
 const [view,setView]=useState<View|null>(null),[stake,setStake]=useState(100),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [power,setPower]=useState(0),[spin,setSpin]=useState({x:0,y:0}),[muted,setMuted]=useState(false),[settings,setSettings]=useState(false),[spinOpen,setSpinOpen]=useState(false),[now,setNow]=useState(()=>Date.now()),[clockOffset,setClockOffset]=useState(0);
 const powerStart=useRef<number|null>(null),powerRef=useRef(0),angleRef=useRef(-.018),lastMatch=useRef(""),replay=useRef(false),stakeRef=useRef(100),lastSoundAt=useRef<Record<string,number>>({});
 const state=view?.state??null,self=state?.players.findIndex(p=>p.id===view?.selfId)??0,myTurn=!!state&&state.turn===self;
 const queued=!!view?.queuedAt,versus=!!state&&now<state.startAt,finished=!!state&&state.winner!==null&&now>=state.readyAt+1000;
 const startAt=state?.startAt,readyAt=state?.readyAt;
 const canAim=!!state&&myTurn&&state.winner===null&&now>=state.readyAt&&connected&&!busy;
 const amount=economics(state?.stake??stake);
 const sound=useCallback((kind:string,force=.5)=>{
  if(mutedRef.current||!audio.current)return;const context=audio.current,t=context.currentTime;if(context.state==="suspended")void context.resume();
  const timestamp=performance.now(),minimumGap=kind==="collision"?24:kind==="rail"?35:0;if(timestamp-(lastSoundAt.current[kind]??-Infinity)<minimumGap)return;lastSoundAt.current[kind]=timestamp;
  const gain=context.createGain(),o=context.createOscillator(),base=kind==="collision"?750:kind==="cue"?155:kind==="pocket"?95:kind==="victory"?530:kind==="versus"?65:kind==="rail"?240:420;
  o.type=kind==="collision"?"triangle":"sine";o.frequency.setValueAtTime(base,t);o.frequency.exponentialRampToValueAtTime(base*.43,t+.12);gain.gain.setValueAtTime(Math.max(.008,Math.min(1,force)*.12),t);gain.gain.exponentialRampToValueAtTime(.0001,t+.2);o.connect(gain).connect(context.destination);o.onended=()=>{o.disconnect();gain.disconnect();};o.start();o.stop(t+.22);
 },[]);
 const isHttpMode = useRef(false);
 const applyView = useCallback((next: View) => {
  setClockOffset(next.now - Date.now());
  setView(next);
  setError("");
  if (next.state?.id !== lastMatch.current) {
   lastMatch.current = next.state?.id ?? "";
   angleRef.current = -.018;
   setPower(0);
   powerRef.current = 0;
   void refreshWallet();
  }
  if (!next.state && !next.queuedAt && replay.current) {
   replay.current = false;
   setTimeout(() => {
    void sendCommandRef.current({ action: "JOIN", stake: stakeRef.current });
   }, 200);
  }
 }, [refreshWallet]);

 const sendHttpCommand = useCallback(async (input: Record<string, unknown>) => {
  setBusy(true);
  try {
   const res = await fetch("/api/eight-ball/live", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
   });
   const data = await res.json();
   if (!res.ok) throw new Error(data.error || "Connection error");
   applyView(data as View);
   setConnected(true);
   setError("");
   return data;
  } catch (err: unknown) {
   const message = err instanceof Error ? err.message : "Unable to reach table";
   if (input.action !== "STATUS") setError(message);
  } finally {
   setBusy(false);
  }
 }, [applyView]);

 const sendCommandRef = useRef(sendHttpCommand);
 useEffect(() => { sendCommandRef.current = sendHttpCommand; }, [sendHttpCommand]);

 const command = useCallback((input: Record<string, unknown>) => {
  if (socket.current?.connected) {
   setBusy(true);
   setError("");
   socket.current.timeout(20000).emit("pool-live:command", input, (err: Error | null, result: { error?: string }) => {
    setBusy(false);
    if (err || result?.error) setError(result?.error ?? "Connection interrupted. Reconnecting preserves your table.");
   });
  } else {
   void sendHttpCommand(input);
  }
 }, [sendHttpCommand]);

 useEffect(() => { const tick = () => setNow(Date.now() + clockOffset); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, [clockOffset]);
 useEffect(() => { if (startAt === undefined || readyAt === undefined) return; const current = Date.now() + clockOffset; const next = [startAt, readyAt, readyAt + 1000].filter(value => value > current).sort((a, b) => a - b)[0]; if (next === undefined) return; const timer = setTimeout(() => setNow(Date.now() + clockOffset), Math.max(0, next - current) + 8); return () => clearTimeout(timer); }, [startAt, readyAt, clockOffset]);
 useEffect(() => {
  if (wallet.user.role !== "USER") return; let cancelled = false; let s: Socket | undefined;
  const startHttpFallback = () => {
   if (cancelled) return;
   isHttpMode.current = true;
   setConnected(true);
   if (s) { s.disconnect(); s = undefined; socket.current = null; }
   void sendHttpCommand({ action: "STATUS" });
  };
  const authorize = async () => { const response = await fetch("/api/eight-ball/session", { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data.token as string; };
  void authorize().then(token => {
   if (cancelled) return; s = io({ path: "/race-socket", transports: ["websocket"], auth: { token }, reconnection: false, timeout: 3000 }); socket.current = s;
   s.on("connect", () => { if (cancelled) return; isHttpMode.current = false; setConnected(true); setError(""); s?.emit("pool-live:command", { action: "STATUS" }, () => {}); });
   s.on("disconnect", () => { if (!isHttpMode.current) setConnected(false); });
   s.on("connect_error", () => { startHttpFallback(); });
   s.on("pool-live:state", (next: View) => { if (!cancelled) applyView(next); });
   s.on("pool-live:availability", () => setError("The table is reconnecting. Your match is saved."));
  }).catch(() => { startHttpFallback(); });
  return () => { cancelled = true; s?.disconnect(); socket.current = null; };
 }, [wallet.user.role, wallet.user.username, applyView, sendHttpCommand]);

 useEffect(() => {
  if (wallet.user.role !== "USER") return;
  const interval = (view?.queuedAt || view?.state) ? 600 : 3000;
  const timer = setInterval(() => {
   if (isHttpMode.current && !busy) {
    void sendHttpCommand({ action: "STATUS" });
   }
  }, interval);
  return () => clearInterval(timer);
 }, [wallet.user.role, view?.queuedAt, view?.state, busy, sendHttpCommand]);
 useEffect(()=>{if(finished){sound(state?.winner===self?"victory":"rail",1);void refreshWallet();}},[finished,self,state?.winner,sound,refreshWallet]);
 useEffect(()=>{if(versus)sound("versus",1);},[versus,sound]);
 function play(){if(!audio.current)audio.current=new AudioContext();void audio.current.resume();sound("ui",.4);if(wallet.user.role!=="USER"){router.push("/login?next=%2Fplay%2Feight-ball");return;}command({action:"JOIN",stake});}
 function shoot(){if(!canAim||state?.ballInHand||powerRef.current<.05)return;command({action:"SHOT",version:state!.version,angle:angleRef.current,power:powerRef.current,spin});setPower(0);powerRef.current=0;}
 const me:Player=state?.players[self]??{id:"you",username:wallet.user.role==="USER"?wallet.user.username:"You",level:1,rank:"Bronze III",isBot:false,lastSeen:now},opponent=state?.players[1-self];
 const portrait=(player:Player,rival=false)=><div className={styles.portrait}><Avatar name={player.username} rival={rival}/><span className={styles.level}><Star size={11}/>{player.level}</span></div>;
 const card=(player:Player,rival=false)=><div className={`${styles.contender} ${rival?styles.rival:""}`}>{portrait(player,rival)}<h2>{player.username}</h2><p>{player.isBot?"AI OPPONENT":"ONLINE PLAYER"}</p><div className={styles.rank}><Shield size={13}/>{player.rank}</div><strong><Coins size={17}/>{number(amount.stake)}</strong></div>;
 return <main className={`${styles.root} ${state?styles.inMatch:""}`}>
 {!state&&!queued&&<><header className={styles.lobbyHeader}><Link href="/games" aria-label="Back to games" className={styles.icon}><ArrowLeft size={19}/></Link><div className={styles.brand}><span>8</span><div>AURUM<small>BILLIARDS CLUB</small></div></div><div className={styles.balance}><Coins size={19}/><strong>{number(wallet.balance)}</strong><small>COINS</small></div></header>
 <div className={styles.lobbyBody}><section className={styles.introduction}><div className={styles.eyebrow}><span/>THE TABLE IS YOURS</div><h1>A cut above.<br/><em>Every shot.</em></h1><p>A precision game. A worthy rival.<br/>Take your seat at the Aurum Club.</p><div className={styles.lobbyTable}><Arena state={null} clockOffset={0} interactive={false} angle={0} power={0} onAim={()=>{}} onPlace={()=>{}} onSound={()=>{}} preview/></div><div className={styles.lobbyCaption}><Shield size={15}/>90% winner’s prize <span/><Wifi size={15}/>Live rivals · expert AI fallback</div></section>
 <section className={styles.stakePanel}><div className={styles.eyebrow}>01 / CHOOSE YOUR TABLE</div><h2>Make your opening.</h2><p className={styles.subtle}>Select your entry. Both players put in the same stake.</p><div className={styles.stakes}>{STAKES.map(value=><button key={value} className={value===stake?styles.selected:""} onClick={()=>{stakeRef.current=value;setStake(value);sound("ui",.15);}} aria-pressed={value===stake}><Coins size={16}/>{number(value)}{value===stake&&<span/>}</button>)}</div><div className={styles.prizeBox}><div><span>WINNER’S PRIZE</span><strong><Coins/>{number(amount.reward)}</strong></div><div className={styles.breakdown}><span>Total pot <b>{number(amount.totalPot)}</b></span><span>Platform fee · 10% <b>{number(amount.fee)}</b></span></div></div><button className={styles.play} onClick={play} disabled={busy||(wallet.user.role==="USER"&&!connected)}>{busy?"RESERVING YOUR SEAT":"PLAY FOR "+number(stake)}<ArrowRight size={21}/></button><div className={styles.fine}>A live opponent first. Expert AI joins after 5 seconds.</div><details className={styles.rules}><summary>Table rules</summary><p>Solids or stripes are assigned after a legal pot following the break. Clear your group before the eight. Scratch, wrong first contact, or no rail after contact gives ball in hand. A break requires a pot or four distinct object balls on a rail. Eight on the break and illegal breaks are re-racked. Any pocket counts; no pocket call required. Turns last 35 seconds. Reconnect within 30 seconds or forfeit. AI is labeled and plays by the same rules.</p></details></section></div><footer className={styles.lobbyFooter}><span>ORIGINAL PRECISION. EXCEPTIONAL PLAY.</span><span>8 BALL / TOURNAMENT CLOTH</span></footer></>}
 {(queued||versus)&&<div className={styles.versus}><div className={styles.rays}/><div className={styles.horizon}/><div className={styles.shockwave}/><div className={styles.sparks}>{Array.from({length:28},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,animationDelay:`${-(i%7)*.4}s`,animationDuration:`${2+i%4}s`}}/>)}</div><div className={styles.introTitle}><span>AURUM CLUB</span><h1>{queued?"FINDING OPPONENT":"OPPONENT FOUND"}</h1><small>{number(amount.stake)} ENTRY · {number(amount.reward)} TO THE WINNER</small></div><div className={styles.vsCards}>{card(me)}<div className={styles.vsMark}>VS</div>{opponent?card(opponent,true):<div className={`${styles.contender} ${styles.searchCard}`}><div className={styles.searchAvatar}><Crosshair size={70}/><span/></div><h2>Your next rival</h2><p>SEARCHING THE CLUB</p><div className={styles.searchDots}><i/><i/><i/></div></div>}</div><div className={styles.introBottom}><Coins size={20}/><strong>{number(amount.reward)}</strong><span>WINNER TAKES THE TABLE</span></div>{queued&&<button className={styles.cancel} onClick={()=>command({action:"CANCEL"})}>Cancel search</button>}</div>}
 {state&&!versus&&<><header className={styles.hud}><button className={styles.icon} aria-label="Table settings" onClick={()=>setSettings(true)}><Settings2 size={20}/></button><div className={`${styles.playerHud} ${myTurn?styles.activePlayer:""}`}>{portrait(me)}<div><strong>{me.username}</strong><small>{me.rank}</small><BallRow state={state} index={self}/></div></div><div className={styles.potHud}><span>WINNER’S PRIZE</span><strong><Coins size={19}/>{number(amount.reward)}</strong><small>{state.winner!==null?"RACK COMPLETE":now<state.readyAt?state.trace?"BALLS IN PLAY":"YOU’RE BREAKING":myTurn?"YOUR TURN":`${opponent?.username.toUpperCase()}’S TURN`}</small></div><div className={`${styles.playerHud} ${styles.opponentHud} ${!myTurn?styles.activePlayer:""}`}><div><strong>{opponent?.username}</strong><small>{opponent?.isBot?"AI OPPONENT · EXPERT":opponent?.rank}</small><BallRow state={state} index={1-self}/></div>{opponent&&portrait(opponent,true)}</div><button className={styles.icon} aria-label="Cue spin" onClick={()=>setSpinOpen(v=>!v)}><span className={styles.spinIcon}><i style={{left:`${50+spin.x*25}%`,top:`${50-spin.y*25}%`}}/></span></button></header>
 <div className={styles.arena}><Arena state={state} clockOffset={clockOffset} interactive={canAim} angle={-.018} power={power} onAim={value=>{angleRef.current=value;}} onPlace={(x,z)=>command({action:"PLACE",version:state.version,x,z})} onSound={sound}/></div>
 <div className={`${styles.powerControl} ${!canAim||state.ballInHand?styles.disabledPower:""}`}><span>POWER</span><div role="slider" tabIndex={0} aria-label="Shot power. Pull down and release to shoot." aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(power*100)} className={styles.powerTrack} onKeyDown={e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();powerRef.current=Math.min(1,Math.max(.05,powerRef.current+(e.key==="ArrowDown"?.05:-.05)));setPower(powerRef.current);}if(e.key==="Enter")shoot();}} onPointerDown={e=>{if(!canAim)return;powerStart.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(powerStart.current===null)return;powerRef.current=Math.min(1,Math.max(0,(e.clientY-powerStart.current)/e.currentTarget.clientHeight));setPower(powerRef.current);}} onPointerUp={()=>{if(powerStart.current===null)return;powerStart.current=null;shoot();}} onPointerCancel={()=>{powerStart.current=null;powerRef.current=0;setPower(0);}}><div className={styles.powerFill} style={{height:`${power*100}%`}}/><div className={styles.powerTicks}/><div className={styles.powerHandle} style={{top:`${power*90}%`}}/></div><small>{Math.round(power*100)}%</small></div>
 <footer className={styles.tableFooter}><span><i className={connected?styles.liveDot:styles.offlineDot}/>{connected?opponent?.isBot?"EXPERT TABLE":"LIVE TABLE":"RECONNECTING · 30s WINDOW"}</span><strong>{state.ballInHand&&myTurn?"BALL IN HAND · DRAG TO PLACE":state.reason}</strong><span>{canAim?"AIM · PULL POWER · RELEASE":state.winner===null&&state.players[state.turn]?.isBot&&now>=state.readyAt?"READING THE TABLE":""}<b className={styles.timer}>{state.winner===null&&now>=state.readyAt?Math.max(0,Math.ceil((state.deadline-now)/1000)):"—"}</b></span></footer>
 {spinOpen&&<div className={styles.spinPanel}><button aria-label="Close spin" onClick={()=>setSpinOpen(false)}><X size={16}/></button><h3>CUE BALL CONTROL</h3><small>Top spin</small><div className={styles.spinBall} onPointerDown={e=>{if(!canAim)return;const r=e.currentTarget.getBoundingClientRect();let x=(e.clientX-r.left)/r.width*2-1,y=1-(e.clientY-r.top)/r.height*2;const l=Math.max(1,Math.hypot(x,y));x/=l;y/=l;setSpin({x,y});}}><i style={{left:`${50+spin.x*40}%`,top:`${50-spin.y*40}%`}}/></div><small>Back spin · English left / right</small><button className={styles.textButton} onClick={()=>setSpin({x:0,y:0})}>Reset to centre</button></div>}
 {settings&&<div className={styles.modalShade}><div className={styles.settings}><button className={styles.close} aria-label="Close settings" onClick={()=>setSettings(false)}><X/></button><h2>At your table.</h2><p>Live play continues while settings are open.</p><button onClick={()=>{setMuted(v=>!v);mutedRef.current=!muted;}}>{muted?<VolumeX/>:<Volume2/>}{muted?"Sound off":"Sound on"}</button><button onClick={()=>{void document.documentElement.requestFullscreen?.();setSettings(false);}}><Maximize/>Fullscreen</button><button onClick={()=>{command({action:"RESIGN"});setSettings(false);}}><ArrowLeft/>Concede match</button></div></div>}
 {finished&&<div className={styles.resultShade}><div className={styles.coinRain}>{Array.from({length:16},(_,i)=><Coins key={i} style={{left:`${10+i*5}%`,animationDelay:`${i*.08}s`}}/>)}</div><section className={styles.result}><Trophy className={styles.resultTrophy}/><div className={styles.eyebrow}>AURUM CLUB · RACK COMPLETE</div><h1>{state.winner===self?"VICTORY":"DEFEAT"}</h1><strong className={styles.resultCoins}><Coins/>{state.winner===self?"+"+number(amount.reward):"−"+number(amount.stake)}<small>COINS</small></strong><p>{state.reason} · {opponent?.username}</p><button className={styles.play} disabled={busy} onClick={()=>{replay.current=true;command({action:"LEAVE"});}}>PLAY AGAIN<RotateCcw size={19}/></button><button className={styles.textButton} onClick={()=>command({action:"LEAVE"})}>CHANGE STAKE</button></section></div>}
 <div className={styles.rotate}><Smartphone size={50}/><h2>A better angle.</h2><p>Rotate your phone to landscape to play.</p></div></>}
 {error&&<div role="alert" className={styles.error}>{error}<button aria-label="Dismiss message" onClick={()=>setError("")}><X size={15}/></button></div>}
 </main>;
}
