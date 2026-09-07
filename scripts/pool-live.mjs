// Transport only. All decisions and wallet writes live in the transactional API.
export function installPoolLive(io, port) {
  const clients = new Map();
  const versions = new Map();
  let busy = false, lastHeartbeat = 0;
  async function request(body) {
    const response = await fetch(`http://127.0.0.1:${port}/api/eight-ball/live`, {
      method: "POST", headers: { "content-type": "application/json", "x-pool-server-secret": process.env.RACE_SERVER_SECRET || process.env.JWT_SECRET }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The table could not be reached.");
    return result;
  }
  io.on("connection", socket => {
    let pending = false, lastCommand = 0;
    socket.on("pool-live:command", async (input = {}, reply = () => {}) => {
      if (pending || Date.now() - lastCommand < 120) return reply({ error: "Please wait for the previous action." });
      if (!["JOIN", "STATUS", "SHOT", "PLACE", "LEAVE", "CANCEL", "RESIGN"].includes(input.action)) return reply({ error: "Unknown table command." });
      pending = true; lastCommand = Date.now();
      clients.set(socket.id, { socket, userId: socket.data.driver.id });
      try {
        const view = await request({ ...input, userId: socket.data.driver.id });
        socket.emit("pool-live:state", view); reply({ ok: true });
      } catch (error) { reply({ error: error.message }); }
      finally { pending = false; }
    });
    socket.on("disconnect", () => { clients.delete(socket.id); versions.delete(socket.id); });
  });
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const heartbeat = Date.now() - lastHeartbeat >= 5000;
      // Also ticks with no viewers: disconnects and settlement survive closed tabs.
      const result = await request({ action: "TICK", users: [...new Set([...clients.values()].map(c => c.userId))], heartbeat });
      if (heartbeat) lastHeartbeat = Date.now();
      for (const { socket, userId } of clients.values()) {
        const view = result.views.find(v => v.selfId === userId);
        if (!view) continue;
        const version = `${view.state?.id}:${view.state?.version}:${view.state?.settled}:${view.queuedAt}`;
        if (versions.get(socket.id) !== version) { socket.emit("pool-live:state", view); versions.set(socket.id, version); }
      }
    } catch (error) {
      for (const { socket } of clients.values()) socket.emit("pool-live:availability", { error: error.message });
    } finally { busy = false; }
  }, 500);
  timer.unref();
}
