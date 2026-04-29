/* ══════════════════════════════════════════════════════════════
   services/cronJobs.js
   Background job scheduler using node-cron
   – Cleanup soft-deleted conversations older than 30 days
   – Remove orphaned upload files
   – Log memory usage every hour
══════════════════════════════════════════════════════════════ */
"use strict";

const cron         = require("node-cron");
const path         = require("path");
const fs           = require("fs");
const logger       = require("../config/logger");
const Conversation = require("../models/Conversation");

function startCronJobs() {
  /* ── 1. Cleanup soft-deleted conversations (daily at 2 AM) ── */
  cron.schedule("0 2 * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const result = await Conversation.deleteMany({
        isDeleted: true,
        deletedAt: { $lt: cutoff },
      });
      if (result.deletedCount > 0) {
        logger.info(`🗑️  Cron: permanently deleted ${result.deletedCount} soft-deleted conversations`);
      }
    } catch (err) {
      logger.error("Cron cleanup error:", err);
    }
  });

  /* ── 2. Log memory usage every hour ────────────────────── */
  cron.schedule("0 * * * *", () => {
    const mem  = process.memoryUsage();
    const toMB = (b) => (b / 1024 / 1024).toFixed(1);
    logger.info(`📊 Memory — RSS: ${toMB(mem.rss)}MB  Heap: ${toMB(mem.heapUsed)}/${toMB(mem.heapTotal)}MB`);
  });

  /* ── 3. Cleanup uploads folder (weekly Sunday 3 AM) ────── */
  cron.schedule("0 3 * * 0", () => {
    try {
      const uploadsDir = path.join(__dirname, "..", "uploads");
      if (!fs.existsSync(uploadsDir)) return;

      const files = fs.readdirSync(uploadsDir);
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
      let deleted = 0;

      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            deleted++;
          }
        } catch {
          // skip locked files
        }
      }

      if (deleted > 0) {
        logger.info(`🗑️  Cron: cleaned up ${deleted} old upload files`);
      }
    } catch (err) {
      logger.error("Upload cleanup error:", err);
    }
  });

  logger.info("✅ Cron jobs scheduled");
}

module.exports = { startCronJobs };
