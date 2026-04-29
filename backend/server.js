/* ══════════════════════════════════════════════════════════════
   server.js  —  AI Chat Assistant Pro
   Production-ready Express + Socket.IO server
   Features: Security, Rate Limiting, Redis, Socket.IO,
             Swagger, Health Check, Logging, Cron Jobs
══════════════════════════════════════════════════════════════ */
"use strict";

require("dotenv").config();

const http    = require("http");
const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const morgan  = require("morgan");
const path    = require("path");
const fs      = require("fs");
const { Server } = require("socket.io");

const connectDB        = require("./config/db");
const logger           = require("./config/logger");
const cache            = require("./config/redis");
const { spec, swaggerUi } = require("./config/swagger");
const { initSocket }   = require("./services/socketService");
const { startCronJobs } = require("./services/cronJobs");
const { globalLimiter } = require("./middleware/rateLimiter");
const performanceMiddleware = require("./middleware/performanceMiddleware");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const authRoutes   = require("./routes/authRoutes");
const chatRoutes   = require("./routes/chatRoutes");
const searchRoutes = require("./routes/searchRoutes");

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5000;

/* ── Socket.IO ──────────────────────────────────────────── */
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      const allowed = [
        "http://localhost:5000", "http://127.0.0.1:5000",
        "http://localhost:5500", "http://127.0.0.1:5500",
        process.env.FRONTEND_URL, "null",
      ].filter(Boolean);
      if (!origin || allowed.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

initSocket(io);

// Make io available to controllers
app.set("io", io);

/* ── Connect Database ───────────────────────────────────── */
connectDB();

/* ── Security middlewares ───────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/* ── CORS ───────────────────────────────────────────────── */
const allowedOrigins = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  process.env.FRONTEND_URL,
  "null",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      logger.warn("CORS blocked origin:", origin);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/* ── Global rate limiter ────────────────────────────────── */
app.use(globalLimiter);

/* ── Performance middleware ─────────────────────────────── */
app.use(performanceMiddleware);

/* ── Body parsers ───────────────────────────────────────── */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ── HTTP Logger ────────────────────────────────────────── */
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// Console (dev format)
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// File (combined format → logs/app.log via write stream)
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, "app.log"),
  { flags: "a" }
);
app.use(morgan("combined", { stream: accessLogStream }));

/* ── Static file serving: uploads ───────────────────────── */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ── Serve Frontend (HTML/CSS/JS) ───────────────────────── */
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

/* ── Swagger API Docs ───────────────────────────────────── */
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(spec, {
  customCss: ".swagger-ui .topbar { background: linear-gradient(135deg, #667eea, #764ba2); }",
  customSiteTitle: "AI Chat Pro — API Docs",
  swaggerOptions: { persistAuthorization: true },
}));

/* ── Health Check ───────────────────────────────────────── */
app.get("/health", async (req, res) => {
  const mem      = process.memoryUsage();
  const toMB     = (b) => parseFloat((b / 1024 / 1024).toFixed(2));
  const redisStatus = await cache.status();

  res.json({
    success:     true,
    status:      "online",
    environment: process.env.NODE_ENV || "development",
    uptime:      process.uptime().toFixed(2) + "s",
    timestamp:   new Date().toISOString(),
    memory: {
      rss:       toMB(mem.rss) + " MB",
      heapUsed:  toMB(mem.heapUsed) + " MB",
      heapTotal: toMB(mem.heapTotal) + " MB",
      external:  toMB(mem.external) + " MB",
    },
    redis:   redisStatus,
    version: process.version,
  });
});

/* ── API Routes (v1) ────────────────────────────────────── */
app.use("/api/v1", authRoutes);
app.use("/api/v1", chatRoutes);
app.use("/api/v1/search", searchRoutes);

/* ── Legacy /api routes (backward compatibility) ────────── */
app.use("/api", authRoutes);
app.use("/api", chatRoutes);
app.use("/api/search", searchRoutes);

/* ── 404 + Global Error Handler ─────────────────────────── */
app.use(notFound);
app.use(errorHandler);

/* ── Background Jobs ────────────────────────────────────── */
startCronJobs();

/* ── Start Server ───────────────────────────────────────── */
server.listen(PORT, () => {
  logger.info(`\n🚀 AI Chat Assistant Pro — Enterprise Edition`);
  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  logger.info(`   Server     : http://localhost:${PORT}`);
  logger.info(`   API v1     : http://localhost:${PORT}/api/v1`);
  logger.info(`   Swagger    : http://localhost:${PORT}/api-docs`);
  logger.info(`   Health     : http://localhost:${PORT}/health`);
  logger.info(`   WebSocket  : ws://localhost:${PORT}`);
  logger.info(`   Env        : ${process.env.NODE_ENV || "development"}`);
  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

module.exports = { app, server, io };
