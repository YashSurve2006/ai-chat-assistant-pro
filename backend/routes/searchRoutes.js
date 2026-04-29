/* ══════════════════════════════════════════════════════════════
   routes/searchRoutes.js
   GET /api/v1/search?q=keyword&page=1&limit=20
   Searches conversation titles + embedded message content
══════════════════════════════════════════════════════════════ */
"use strict";

const express      = require("express");
const Conversation = require("../models/Conversation");
const { protect }  = require("../middleware/authMiddleware");
const cache        = require("../config/redis");
const logger       = require("../config/logger");

const router = express.Router();

/**
 * GET /api/v1/search?q=keyword
 */
router.get("/", protect, async (req, res) => {
  const q     = (req.query.q || "").trim();
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  if (!q || q.length < 2) {
    return res.status(400).json({ success: false, message: "Search query must be at least 2 characters." });
  }

  const cacheKey = `search:${req.user._id}:${q}:${page}:${limit}`;
  const cached   = await cache.get(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); // escape regex

    const [results, total] = await Promise.all([
      Conversation.find({
        userId:    req.user._id,
        isDeleted: { $ne: true },
        $or: [
          { title: regex },
          { "messages.content": regex },
        ],
      })
        .select("title model isPinned messageCount lastMessageAt createdAt updatedAt")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Conversation.countDocuments({
        userId:    req.user._id,
        isDeleted: { $ne: true },
        $or: [
          { title: regex },
          { "messages.content": regex },
        ],
      }),
    ]);

    const response = {
      success: true,
      query:   q,
      results,
      pagination: {
        total,
        page,
        pages:   Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };

    await cache.set(cacheKey, response, 120); // 2-minute cache for search
    res.json(response);

  } catch (err) {
    logger.error("Search error:", err);
    res.status(500).json({ success: false, message: "Search failed." });
  }
});

module.exports = router;
