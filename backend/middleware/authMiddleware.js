/* ══════════════════════════════════════════════
   middleware/authMiddleware.js
   JWT verification + optional auth
══════════════════════════════════════════════ */
"use strict";

const jwt  = require("jsonwebtoken");
const User = require("../models/User");

/* ── Protect: require valid JWT ─────────────── */
const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. No token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or account deactivated.",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    const message =
      err.name === "JsonWebTokenError"
        ? "Invalid token."
        : err.name === "TokenExpiredError"
        ? "Token has expired. Please log in again."
        : "Authentication failed.";

    return res.status(401).json({ success: false, message });
  }
};

module.exports = { protect };
