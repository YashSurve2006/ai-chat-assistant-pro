/* ══════════════════════════════════════════════════════════════
   middleware/errorHandler.js
   Centralized error handler — logs to Winston, returns clean JSON
══════════════════════════════════════════════════════════════ */
"use strict";

const logger = require("../config/logger");

/**
 * 404 handler — mount AFTER all routes
 */
function notFound(req, res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.url}`);
  err.statusCode = 404;
  next(err);
}

/**
 * Global error handler — mount last
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || err.status || 500;

  /* ── If headers already sent (e.g. SSE stream), just end ── */
  if (res.headersSent) {
    logger.warn(`Error after headers sent: ${err.message}`);
    return res.end();
  }

  /* ── Log to Winston ─────────────────────────────────── */
  if (statusCode >= 500) {
    logger.error(`❌ ${req.method} ${req.url} — ${err.message}`, {
      stack:      err.stack,
      statusCode,
      userId:     req.user?._id,
      ip:         req.ip,
    });
  } else {
    logger.warn(`⚠️  ${req.method} ${req.url} — ${err.message} (${statusCode})`);
  }

  /* ── Response ───────────────────────────────────────── */
  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === "production" && statusCode === 500
        ? "Internal server error."
        : err.message || "Internal server error.",
    ...(process.env.NODE_ENV !== "production" && statusCode >= 500
      ? { stack: err.stack }
      : {}),
  });
}

module.exports = { notFound, errorHandler };
