// Vercel's Node HTTP-server function entry point. Unlike scripts/server.mjs,
// this file is deployed as a function and receives WebSocket upgrades.
import { createServer } from "node:http";
import { createGameSocket } from "../scripts/pool-socket.mjs";
import { installPoolLive } from "../scripts/pool-live.mjs";

const server = createServer();
const io = createGameSocket(server, "/socket.io");
const origin = process.env.POOL_API_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
if (!origin) throw new Error("POOL_API_ORIGIN or VERCEL_URL is required for the pool function.");
installPoolLive(io, origin, { idleTicks: false });
export default server;
