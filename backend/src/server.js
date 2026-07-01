import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { router } from "./routes/api.js";
import { bus, getFullState, startClock } from "./pipeline/incidentManager.js";

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", router);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  socket.emit("state", getFullState());
});

bus.on("update", (state) => {
  io.emit("state", state);
});

bus.on("notifications", (notifications) => {
  io.emit("notifications", notifications);
});

httpServer.listen(PORT, () => {
  console.log(`Emergency Response System backend listening on port ${PORT}`);
  startClock();
  console.log(`Closed-loop tick running every ${process.env.TICK_INTERVAL_MS || 4000}ms`);
});
