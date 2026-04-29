/* ════════════════════════════════════════════════════════════
   models/Session.js  –  sessions collection  (optional)
   Database : ai_chat_app

   Purpose:
     Track active JWT sessions for per-device logout, session
     analytics, and suspicious-login detection.

   Fields:
     _id         ObjectId  (auto)
     userId      ObjectId  → ref: User
     token       String    hashed JWT (never store raw JWT)
     device      Object    user-agent, browser, OS, IP
     expiresAt   Date      TTL index auto-deletes expired docs
     isRevoked   Boolean   explicit logout before expiry
     createdAt   Date      auto

   Indexes:
     userId + isRevoked   →  list active sessions per user
     expiresAt            →  TTL (MongoDB auto-purges expired docs)
════════════════════════════════════════════════════════════ */
"use strict";

const mongoose = require("mongoose");
const crypto   = require("crypto");

/* ── Schema ─────────────────────────────────────────────── */
const SessionSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: [true, "userId is required"],
    },

    /* Store a HASH of the token, never the raw JWT */
    tokenHash: {
      type:     String,
      required: [true, "tokenHash is required"],
      unique:   true,
    },

    /* Device / client information */
    device: {
      ip:        { type: String, default: null },
      userAgent: { type: String, default: null },
      browser:   { type: String, default: null },
      os:        { type: String, default: null },
    },

    /* Session lifecycle */
    expiresAt: {
      type:     Date,
      required: [true, "expiresAt is required"],
    },

    isRevoked: {
      type:    Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/* ═══════════════════════════════════════════════════════════
   INDEXES
═══════════════════════════════════════════════════════════ */
// List active sessions for a user
SessionSchema.index(
  { userId: 1, isRevoked: 1 },
  { name: "idx_sessions_user_active" }
);

// TTL index: MongoDB automatically deletes expired session documents
SessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "idx_sessions_ttl" }
);

/* ═══════════════════════════════════════════════════════════
   STATIC METHODS
═══════════════════════════════════════════════════════════ */
// Hash a raw JWT before storing
SessionSchema.statics.hashToken = function (rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
};

// Revoke all sessions for a user (e.g. password reset / logout-all)
SessionSchema.statics.revokeAll = function (userId) {
  return this.updateMany({ userId }, { $set: { isRevoked: true } });
};

// Check if a token is valid (not revoked, not expired)
SessionSchema.statics.isValid = async function (rawToken) {
  const hash = this.hashToken(rawToken);
  const session = await this.findOne({
    tokenHash: hash,
    isRevoked:  false,
    expiresAt:  { $gt: new Date() },
  });
  return !!session;
};

/* ── Export ─────────────────────────────────────────────── */
module.exports = mongoose.model("Session", SessionSchema);
