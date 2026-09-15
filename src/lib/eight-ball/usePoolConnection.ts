"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { MatchState } from "./match";

export type PoolView = { now: number; selfId: string; queuedAt: number | null; state: MatchState | null };
type Command = Record<string, unknown>;

// One transport owner per mounted game. Polling does not lock player input, and
// mutations are never automatically replayed after an ambiguous acknowledgement.
export function usePoolConnection(identity: string | null, onView: (view: PoolView) => void) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const receive = useRef(onView);
  const dispatch = useRef<(input: Command) => void>(() => {});
  useEffect(() => { receive.current = onView; }, [onView]);
  const command = useCallback((input: Command) => dispatch.current(input), []);

  useEffect(() => {
    if (!identity) return;
    let disposed = false, pending = false, failures = 0, latestNow = -Infinity;
    let current: PoolView | null = null, socket: Socket | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | undefined, authTimer: ReturnType<typeof setTimeout> | undefined;
    let token = "", tokenAt = 0, tokenRequest: Promise<string> | null = null;
    const requests = new Set<AbortController>();
    let statusRequest: Promise<void> | null = null;

    async function request(path: string, input: Command) {
      const controller = new AbortController();requests.add(controller);
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: controller.signal, cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Table request failed (${res.status}).`);
        return data;
      } finally { clearTimeout(timer);requests.delete(controller); }
    }
    function apply(view: PoolView) {
      if (disposed || !Number.isFinite(view.now) || view.now < latestNow) return;
      if (current?.state && view.state?.id === current.state.id && view.state.version < current.state.version) return;
      latestNow = view.now;current = view;failures = 0;
      setConnected(true);receive.current(view);
    }
    function status(): Promise<void> {
      if (disposed || pending) return Promise.resolve();
      if (statusRequest) return statusRequest;
      statusRequest=(async()=>{
        try { apply(await request("/api/eight-ball/live", { action: "STATUS" })); }
        catch { if (!disposed) { failures++;if (!socket?.connected) setConnected(false); } }
      })().finally(()=>{statusRequest=null;});
      return statusRequest;
    }
    async function poll() {
      if (disposed) return;
      if (!socket?.connected) await status();
      if (!disposed) pollTimer = setTimeout(() => void poll(), failures ? Math.min(8000, 500 * 2 ** Math.min(failures, 4)) * (.8 + Math.random() * .4) : current?.state || current?.queuedAt ? 600 : 3000);
    }
    async function submit(input: Command) {
      if (disposed || pending) return;
      pending = true;setBusy(true);setError("");
      try {
        // Finish any heartbeat first; do not race a stale STATUS with LEAVE/JOIN.
        await statusRequest;
        if (disposed) return;
        if (socket?.connected) {
          const result = await socket.timeout(15000).emitWithAck("pool-live:command", input) as { error?: string };
          if (result?.error) throw new Error(result.error);
        } else apply(await request("/api/eight-ball/live", input));
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : "Connection interrupted. Checking your saved table.");
      } finally {
        pending = false;
        if (!disposed) { setBusy(false);void status(); }
      }
    }
    dispatch.current = input => { void submit(input); };

    async function authorize() {
      const data = await request("/api/eight-ball/session", {});
      if (typeof data.token !== "string") throw new Error("Missing table token.");
      token = data.token;tokenAt = Date.now();return data;
    }
    async function startSocket() {
      try {
        const session = await authorize();
        if (disposed) return;
        const url = new URL(session.socketUrl || window.location.origin);
        if (!["http:", "https:"].includes(url.protocol) || (window.location.protocol === "https:" && url.protocol !== "https:")) throw new Error("The realtime endpoint must use HTTPS.");
        socket = io(url.origin, {
          path: session.socketPath || "/race-socket", transports: ["websocket"], autoConnect: false,
          reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 8000, randomizationFactor: .4, timeout: 8000,
          auth: callback => {
            if (Date.now() - tokenAt < 15 * 60_000) { callback({ token });return; }
            tokenRequest ??= authorize().then(data => data.token as string).finally(() => { tokenRequest=null; });
            void tokenRequest.then(fresh => { if (!disposed) callback({ token: fresh }); }).catch(() => { if (!disposed) callback({ token: "" }); });
          },
        });
        socket.on("connect", () => {
          if (disposed) return;
          // Connected transport is not yet a recovered table: fetch its state.
          socket?.timeout(15000).emit("pool-live:command", { action: "STATUS" }, (err: Error | null, result: { error?: string }) => {
            if (!disposed && (err || result?.error)) { setError(result?.error || "Unable to restore the table."); }
          });
        });
        socket.on("pool-live:state", apply);
        socket.on("disconnect", () => { if (!disposed) { setConnected(false); } });
        socket.on("connect_error", () => {
          if (disposed) return;
          // Middleware failures do not trigger Socket.IO's automatic reconnect.
          if (!socket?.active) { tokenAt=0;clearTimeout(authTimer);authTimer=setTimeout(()=>socket?.connect(),8000); }
        });
        socket.on("pool-live:availability", () => { if (!disposed) setError("The table is reconnecting. Your match is saved."); });
        socket.connect();
      } catch (err) {
        if (!disposed) { setError(err instanceof Error ? err.message : "Unable to authorize the table.");authTimer=setTimeout(()=>void startSocket(),8000); }
      }
    }
    void poll();void startSocket();
    return () => {
      disposed=true;dispatch.current=()=>{};clearTimeout(pollTimer);clearTimeout(authTimer);
      socket?.removeAllListeners();socket?.disconnect();requests.forEach(controller=>controller.abort());
    };
  }, [identity]);
  return { command, connected, busy, error, setError };
}
