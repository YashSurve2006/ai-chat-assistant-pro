/* ══════════════════════════════════════════════════════════════
   config/logger.js
   Centralized Winston logger
   – Console (colorized, dev)
   – File: logs/app.log  (JSON, daily rotation, 14-day retention)
   – File: logs/error.log (errors only)
══════════════════════════════════════════════════════════════ */
"use strict";

const path    = require("path");
const fs      = require("fs");
const winston = require("winston");
require("winston-daily-rotate-file");

/* ── Ensure logs directory exists ───────────────────────── */
const logsDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

/* ── Custom format ─────────────────────────────────────── */
const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level}] ${stack || message}${metaStr}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

/* ── Transports ─────────────────────────────────────────── */
const transports = [];

// Console (always)
transports.push(
  new winston.transports.Console({
    format: process.env.NODE_ENV === "production" ? prodFormat : devFormat,
    silent: process.env.NODE_ENV === "test",
  })
);

// Daily-rotating combined log
transports.push(
  new winston.transports.DailyRotateFile({
    filename:      path.join(logsDir, "app-%DATE%.log"),
    datePattern:   "YYYY-MM-DD",
    zippedArchive: true,
    maxSize:       "20m",
    maxFiles:      "14d",
    format:        prodFormat,
  })
);

// Error-only log
transports.push(
  new winston.transports.DailyRotateFile({
    filename:      path.join(logsDir, "error-%DATE%.log"),
    datePattern:   "YYYY-MM-DD",
    level:         "error",
    zippedArchive: true,
    maxSize:       "20m",
    maxFiles:      "30d",
    format:        prodFormat,
  })
);

/* ── Create logger ─────────────────────────────────────── */
const logger = winston.createLogger({
  level:       process.env.LOG_LEVEL || "info",
  exitOnError: false,
  transports,
});

module.exports = logger;
