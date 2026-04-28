import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const PORT = 4000;
const UPDATE_INTERVAL_MS = 1000;
const DECISION_INTERVAL_MS = 4000;
const MIN_SWITCH_DELAY_MS = 3000;

const trafficState = {
  north: 0,
  south: 0,
  east: 0,
  west: 0,
  activeSignal: "north",
};

let lastSwitchTime = Date.now();
const CYCLE_ORDER = ["north", "south", "east", "west"];
let currentIdx = 0;

app.use(cors());
app.use(express.json());

app.get("/traffic-data", (_req, res) => {
  res.json(trafficState);
});

io.on("connection", (socket) => {
  socket.emit("traffic:update", trafficState);

  socket.on("traffic:counts", (counts) => {
    if (!counts || typeof counts !== "object") return;

    const nextNorth = Number(counts.north);
    const nextSouth = Number(counts.south);
    const nextEast = Number(counts.east);
    const nextWest = Number(counts.west);

    trafficState.north = Number.isFinite(nextNorth) ? Math.max(0, Math.floor(nextNorth)) : trafficState.north;
    trafficState.south = Number.isFinite(nextSouth) ? Math.max(0, Math.floor(nextSouth)) : trafficState.south;
    trafficState.east = Number.isFinite(nextEast) ? Math.max(0, Math.floor(nextEast)) : trafficState.east;
    trafficState.west = Number.isFinite(nextWest) ? Math.max(0, Math.floor(nextWest)) : trafficState.west;
  });
});

setInterval(() => {
  io.emit("traffic:update", trafficState);
}, UPDATE_INTERVAL_MS);

setInterval(() => {
  const canSwitch = Date.now() - lastSwitchTime >= MIN_SWITCH_DELAY_MS;

  if (canSwitch) {
    currentIdx = (currentIdx + 1) % CYCLE_ORDER.length;
    trafficState.activeSignal = CYCLE_ORDER[currentIdx];
    lastSwitchTime = Date.now();
  }
}, DECISION_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
