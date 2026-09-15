"use client";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import styles from "./pool.module.css";

export function PoolPowerControl({ enabled, version, powerRef, onShoot }: { enabled: boolean; version: number; powerRef: MutableRefObject<number>; onShoot: () => void }) {
  const [value,setValue]=useState(0);
  const gesture=useRef<{id:number;y:number;height:number;version:number}|null>(null);
  const track=useRef<HTMLDivElement>(null);
  function reset(){const active=gesture.current;gesture.current=null;powerRef.current=0;setValue(0);if(active&&track.current?.hasPointerCapture(active.id))track.current.releasePointerCapture(active.id);}
  useEffect(()=>{const cancel=()=>{gesture.current=null;powerRef.current=0;setValue(0);};window.addEventListener("blur",cancel);window.addEventListener("resize",cancel);return()=>{window.removeEventListener("blur",cancel);window.removeEventListener("resize",cancel);powerRef.current=0;};},[powerRef]);
  return <div className={`${styles.powerControl} ${!enabled?styles.disabledPower:""}`}><span>POWER</span>
    <div ref={track} role="slider" tabIndex={enabled?0:-1} aria-disabled={!enabled} aria-label="Shot power. Pull down and release to shoot." aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value*100)} className={styles.powerTrack}
      onKeyDown={e=>{if(!enabled)return;if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();powerRef.current=Math.min(1,Math.max(0,powerRef.current+(e.key==="ArrowDown"?.05:-.05)));setValue(powerRef.current);}if(e.key==="Enter"||e.key===" "){e.preventDefault();onShoot();reset();}if(e.key==="Escape")reset();}}
      onPointerDown={e=>{if(!enabled||!e.isPrimary||e.button!==0||gesture.current)return;const height=e.currentTarget.getBoundingClientRect().height;if(height<=0)return;e.preventDefault();gesture.current={id:e.pointerId,y:e.clientY,height,version};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;if(!enabled||g.version!==version){reset();return;}powerRef.current=Math.min(1,Math.max(0,(e.clientY-g.y)/g.height));setValue(powerRef.current);}}
      onPointerUp={e=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;if(enabled&&g.version===version){powerRef.current=Math.min(1,Math.max(0,(e.clientY-g.y)/g.height));onShoot();}reset();}}
      onPointerCancel={reset} onLostPointerCapture={reset}>
      <div className={styles.powerFill} style={{height:`${value*100}%`}}/><div className={styles.powerTicks}/><div className={styles.powerHandle} style={{top:`${value*90}%`}}/>
    </div><small>{Math.round(value*100)}%</small></div>;
}
