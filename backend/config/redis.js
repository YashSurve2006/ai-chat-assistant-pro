/* ══════════════════════════════════════════════════════════════
   config/redis.js
   IORedis client with graceful fallback (server works without Redis)
══════════════════════════════════════════════════════════════ */
"use strict";

const Redis  = require("ioredis");
const logger = require("./logger");

let client = null;
let connected = false;

/* ── Create client only if REDIS_URL is set ─────────────── */
if (process.env.REDIS_URL) {
  try {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest:   null,
      connectTimeout:         3000,
      commandTimeout:         3000,
      enableOfflineQueue:     false,
      retryStrategy:          (times) => {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 500, 2000);
      },
      reconnectOnError:       () => false,
    });

    client.on("connect", () => {
      connected = true;
      logger.info("✅ Redis connected");
    });

    client.on("ready", () => {
      connected = true;
    });

    client.on("error", (err) => {
      connected = false;
      // Only log once, not every reconnect attempt
      if (err.code === "ECONNREFUSED") {
        logger.warn("⚠️  Redis unavailable — caching disabled (server continues without it)");
      } else {
        logger.warn(`Redis error: ${err.message}`);
      }
    });

    client.on("close", () => {
      connected = false;
    });

    // IORedis auto-connects; no manual connect() needed

  } catch (err) {
    logger.warn("Redis client init failed — caching disabled");
    client = null;
  }
} else {
  logger.info("ℹ️  REDIS_URL not set — Redis caching disabled");
}

/* ── Cache helpers ──────────────────────────────────────── */
const DEFAULT_TTL = 300; // 5 minutes

const cache = {
  isConnected: () => connected && client !== null,

  async get(key) {
    if (!this.isConnected()) return null;
    try {
      const val = await client.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      logger.warn(`Redis GET failed: ${err.message}`);
      return null;
    }
  },

  async set(key, value, ttlSeconds = DEFAULT_TTL) {
    if (!this.isConnected()) return false;
    try {
      await client.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (err) {
      logger.warn(`Redis SET failed: ${err.message}`);
      return false;
    }
  },

  async del(key) {
    if (!this.isConnected()) return false;
    try {
      await client.del(key);
      return true;
    } catch (err) {
      logger.warn(`Redis DEL failed: ${err.message}`);
      return false;
    }
  },

  async delPattern(pattern) {
    if (!this.isConnected()) return false;
    try {
      const keys = await client.keys(pattern);
      if (keys.length) await client.del(...keys);
      return true;
    } catch (err) {
      logger.warn(`Redis DELPATTERN failed: ${err.message}`);
      return false;
    }
  },

  async status() {
    if (!this.isConnected()) return { connected: false };
    try {
      const pong = await client.ping();
      return { connected: true, ping: pong };
    } catch {
      return { connected: false };
    }
  },
};

module.exports = cache;
