import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL;
app.set("trust proxy", 1);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
  },
});

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

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Backend is running 🚀");
});

app.get("/traffic-data", (_req, res) => {
  res.json(trafficState);
});

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.emit("traffic:update", trafficState);

  socket.on("traffic:counts", (counts) => {
    if (!counts || typeof counts !== "object") return;

    const sanitize = (v, fallback) =>
      Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : fallback;

    trafficState.north = sanitize(counts.north, trafficState.north);
    trafficState.south = sanitize(counts.south, trafficState.south);
    trafficState.east = sanitize(counts.east, trafficState.east);
    trafficState.west = sanitize(counts.west, trafficState.west);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
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
  console.log(`Backend running on port ${PORT}`);
});