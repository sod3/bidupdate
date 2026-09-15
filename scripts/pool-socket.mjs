import { Server } from "socket.io";
import { jwtVerify } from "jose";

// Shared by the local custom server and the Vercel function entry point.
export function createGameSocket(server, path = "/race-socket") {
  const origins = new Set((process.env.RACE_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean));
  const io = new Server(server, {
    path, serveClient: false, transports: ["websocket"], maxHttpBufferSize: 24000,
    pingInterval: 10000, pingTimeout: 12000,
    // CORS alone does not protect WebSocket upgrades. Check the Origin here.
    allowRequest(request, done) {
      const origin = request.headers.origin;
      let allowed = !origin; // Native clients must still supply a valid signed JWT.
      if (origin) {
        try {
          const url = new URL(origin);
          allowed = ["http:", "https:"].includes(url.protocol) &&
            (url.host === request.headers.host || origins.has(url.origin));
        } catch { allowed = false; }
      }
      done(allowed ? null : "Origin is not allowed.", allowed);
    },
    cors: { origin: [...origins], methods: ["GET", "POST"] },
  });
  io.engine.on("connection_error", error => {
    // Do not log request headers, cookies, tokens or query strings.
    console.warn("[game-socket] handshake failed", { code: error.code, message: error.message });
  });
  io.use(async (socket, next) => {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret || secret.length < 32) throw new Error("Socket signing secret is not configured.");
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string") throw new Error("Missing game token.");
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"], issuer: "neon-drift-web", audience: "neon-drift-race-server" });
      if (!payload.sub || typeof payload.username !== "string") throw new Error("Invalid game identity.");
      socket.data.driver = { id: payload.sub, username: payload.username, level: Number(payload.level) || 1, rank: typeof payload.rank === "string" ? payload.rank : "Bronze III", winStreak: Number(payload.winStreak) || 0 };
      next();
    } catch { next(new Error("Game authentication failed. Refresh your session.")); }
  });
  return io;
}
