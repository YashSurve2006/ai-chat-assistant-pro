/* ══════════════════════════════════════════════════════════════
   services/socketService.js
   Socket.IO real-time features:
   – Real-time message delivery
   – Typing indicators
   – Online / offline status
   – Auto-reconnect (handled client-side; server broadcasts presence)
══════════════════════════════════════════════════════════════ */
"use strict";

const jwt    = require("jsonwebtoken");
const logger = require("../config/logger");

/* ── Track online users: { userId → socketId[] } ────────── */
const onlineUsers = new Map();

/**
 * Initialize Socket.IO on the http.Server instance.
 * Called once from server.js.
 */
function initSocket(io) {
  /* ── JWT auth middleware for socket connections ────────── */
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded  = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId  = decoded.id;
      socket.user    = { id: decoded.id };
      return next();
    } catch (err) {
      return next(new Error("Invalid token"));
    }
  });

  /* ── Connection handler ─────────────────────────────────── */
  io.on("connection", (socket) => {
    const userId = socket.userId;
    logger.info(`🔌 Socket connected: userId=${userId} socketId=${socket.id}`);

    /* Track online status */
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    /* Notify others that this user is online */
    socket.broadcast.emit("user:online", { userId });

    /* Send current online list to newly connected socket */
    socket.emit("users:online", { users: [...onlineUsers.keys()] });

    /* ── Join conversation room ──────────────────────────── */
    socket.on("conversation:join", ({ conversationId }) => {
      if (conversationId) {
        socket.join(`conv:${conversationId}`);
        logger.debug(`User ${userId} joined room conv:${conversationId}`);
      }
    });

    /* ── Leave conversation room ─────────────────────────── */
    socket.on("conversation:leave", ({ conversationId }) => {
      if (conversationId) {
        socket.leave(`conv:${conversationId}`);
      }
    });

    /* ── Typing indicators ───────────────────────────────── */
    socket.on("typing:start", ({ conversationId }) => {
      if (conversationId) {
        socket.to(`conv:${conversationId}`).emit("typing:start", {
          userId,
          conversationId,
        });
      }
    });

    socket.on("typing:stop", ({ conversationId }) => {
      if (conversationId) {
        socket.to(`conv:${conversationId}`).emit("typing:stop", {
          userId,
          conversationId,
        });
      }
    });

    /* ── Ping / heartbeat ────────────────────────────────── */
    socket.on("ping", () => socket.emit("pong", { ts: Date.now() }));

    /* ── Disconnect ──────────────────────────────────────── */
    socket.on("disconnect", (reason) => {
      logger.debug(`Socket disconnected: userId=${userId} reason=${reason}`);

      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          /* Notify others this user went offline */
          socket.broadcast.emit("user:offline", { userId });
        }
      }
    });
  });

  logger.info("✅ Socket.IO initialized");
  return io;
}

/**
 * Emit an event to all sockets in a conversation room.
 * Called from controllers after saving messages.
 */
function emitToConversation(io, conversationId, event, data) {
  if (io) {
    io.to(`conv:${conversationId}`).emit(event, data);
  }
}

/**
 * Check if a user is currently online.
 */
function isUserOnline(userId) {
  return onlineUsers.has(String(userId));
}

/**
 * Get list of all online user IDs.
 */
function getOnlineUsers() {
  return [...onlineUsers.keys()];
}

module.exports = { initSocket, emitToConversation, isUserOnline, getOnlineUsers };
