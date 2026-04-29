/* ══════════════════════════════════════════════════════════════
   middleware/rateLimiter.js
   Per-user and global rate limiters
══════════════════════════════════════════════════════════════ */
"use strict";

const rateLimit = require("express-rate-limit");
const logger    = require("../config/logger");

/* ── Key generator: authenticated user ID or IP ─────────── */
const userKeyGenerator = (req) => {
  return req.user?._id?.toString() || req.ip;
};

/* ── Global limiter (200 req / 15 min per IP) ───────────── */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
  handler: (req, res) => {
    logger.warn(`Rate limit hit: ${req.ip} ${req.method} ${req.url}`);
    res.status(429).json({ success: false, message: "Too many requests. Please try again later." });
  },
});

/* ── Authenticated user limiter (100 req / min) ─────────── */
const userLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Rate limit exceeded. Max 100 requests per minute." },
  handler: (req, res) => {
    logger.warn(`User rate limit hit: userId=${req.user?._id} ip=${req.ip}`);
    res.status(429).json({ success: false, message: "Rate limit exceeded. Max 100 requests per minute." });
  },
});

/* ── Auth rate limiter (10 attempts / 15 min) ───────────── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many authentication attempts. Try again in 15 minutes." },
});

/* ── Chat rate limiter (20 messages / min) ──────────────── */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: userKeyGenerator,
  message: { success: false, message: "Too many chat requests. Please slow down." },
});

module.exports = { globalLimiter, userLimiter, authLimiter, chatLimiter };
