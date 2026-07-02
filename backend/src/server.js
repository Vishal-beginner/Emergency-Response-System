import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { router } from "./routes/api.js";
import { bus, getFullState, startClock } from "./pipeline/incidentManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", router);

// Single-port mode: if the frontend has been built (frontend/dist exists),
// serve it directly from the backend so the whole app is reachable through
// one port. This avoids needing two separately-firewalled ports and the
// dev-server proxy entirely -- useful when running both on the same host
// behind a restrictive firewall. Run `npm run build` in frontend/ first.
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api|\/socket\.io).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  console.log("Serving built frontend from frontend/dist (single-port mode)");
}

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
