/* ══════════════════════════════════════════════════════════════
   middleware/performanceMiddleware.js
   – Attach response-time to every response header
   – Log slow requests (> 2 seconds) to winston
══════════════════════════════════════════════════════════════ */
"use strict";

const logger = require("../config/logger");

const SLOW_THRESHOLD_MS = 2000;

/**
 * Adds X-Response-Time header and logs slow requests.
 */
function performanceMiddleware(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    if (duration > SLOW_THRESHOLD_MS) {
      logger.warn(`🐢 Slow request: ${req.method} ${req.url} — ${duration}ms (status ${res.statusCode})`);
    } else {
      logger.debug(`${req.method} ${req.url} — ${duration}ms (${res.statusCode})`);
    }
  });

  // Set a start-time header we can observe before response
  res.locals.requestStartTime = start;

  next();
}

module.exports = performanceMiddleware;
