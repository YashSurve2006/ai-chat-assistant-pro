/* ════════════════════════════════════════════════════════════
   models/Message.js  –  messages collection
   Database : ai_chat_app

   Purpose:
     Stores every individual chat message as its own document.
     This is more scalable than embedding messages inside
     Conversation, because:
       • unbounded arrays are an anti-pattern in MongoDB
       • you can query/page/delete individual messages
       • you can add per-message metadata (tokens, reaction, etc.)

   Schema:
     _id             ObjectId  (auto)
     conversationId  ObjectId  → ref: Conversation  (required, indexed)
     userId          ObjectId  → ref: User           (denormalized for fast per-user queries)
     sender          String    "user" | "model"
     content         String    required, max 32 000 chars
     attachments     [Object]  references to files collection
     model           String    which Gemini model produced this (for AI msgs)
     tokens          Number    estimated token count
     reaction        String    null | "like" | "dislike"
     createdAt       Date      auto
     updatedAt       Date      auto

   Indexes:
     conversationId  →  compound with createdAt ASC  (chat thread load)
     userId          →  for user activity analytics
════════════════════════════════════════════════════════════ */
"use strict";

const mongoose = require("mongoose");

/* ── Attachment sub-document (links to files collection) ─── */
const AttachmentSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "File",
    },
    filename:     { type: String },
    originalName: { type: String },
    mimetype:     { type: String },
    size:         { type: Number },
    url:          { type: String },       // e.g. /uploads/abc123.pdf
  },
  { _id: false }                          // no separate _id for sub-docs
);

/* ── Main schema ────────────────────────────────────────── */
const MessageSchema = new mongoose.Schema(
  {
    /* ── Relationships ────────────────────────────────── */
    conversationId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Conversation",
      required: [true, "conversationId is required"],
    },

    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: [true, "userId is required"],
    },

    /* ── Core fields ──────────────────────────────────── */
    sender: {
      type:     String,
      required: [true, "sender is required"],
      enum: {
        values:  ["user", "model"],
        message: "sender must be 'user' or 'model'",
      },
    },

    content: {
      type:      String,
      required:  [true, "content is required"],
      trim:      true,
      maxlength: [32_000, "Message content cannot exceed 32 000 characters"],
    },

    /* ── Attachments ──────────────────────────────────── */
    attachments: {
      type:    [AttachmentSchema],
      default: [],
    },

    /* ── AI metadata ──────────────────────────────────── */
    model: {
      type:    String,
      default: null,   // null for user messages
    },

    tokens: {
      type:    Number,
      default: 0,
      min:     0,
    },

    /* ── User feedback ────────────────────────────────── */
    reaction: {
      type:    String,
      enum:    {
        values:  ["like", "dislike", null],
        message: "reaction must be 'like', 'dislike', or null",
      },
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

/* ═══════════════════════════════════════════════════════════
   INDEXES
═══════════════════════════════════════════════════════════ */
// Primary: load all messages in a thread in chronological order
MessageSchema.index(
  { conversationId: 1, createdAt: 1 },
  { name: "idx_msgs_conv_created" }
);

// User-level message history / analytics
MessageSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "idx_msgs_user_created" }
);

// Full-text search on content
MessageSchema.index(
  { content: "text" },
  { name: "idx_msgs_content_text" }
);

/* ═══════════════════════════════════════════════════════════
   VIRTUALS
═══════════════════════════════════════════════════════════ */
// Expose a short preview for list/summary views
MessageSchema.virtual("preview").get(function () {
  return this.content.slice(0, 120) + (this.content.length > 120 ? "…" : "");
});

/* ═══════════════════════════════════════════════════════════
   POST-SAVE HOOK
   Update Conversation.messageCount + lastMessageAt
   on every new message, keeping the list view always in sync.
═══════════════════════════════════════════════════════════ */
MessageSchema.post("save", async function (doc) {
  try {
    const Conversation = mongoose.model("Conversation");
    await Conversation.findByIdAndUpdate(doc.conversationId, {
      $inc: { messageCount: 1 },
      $set: { lastMessageAt: doc.createdAt },
    });
  } catch (_) { /* non-critical – don't crash the main flow */ }
});

/* ═══════════════════════════════════════════════════════════
   STATIC METHODS
═══════════════════════════════════════════════════════════ */
// Rough token estimate (1 token ≈ 4 characters)
MessageSchema.statics.estimateTokens = function (text = "") {
  return Math.ceil(text.length / 4);
};

// Load last N messages for a conversation (for AI context window)
MessageSchema.statics.getContext = function (conversationId, limit = 30) {
  return this.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("sender content model")
    .lean()
    .then((msgs) => msgs.reverse());   // back to chronological order
};

/* ── Export ─────────────────────────────────────────────── */
module.exports = mongoose.model("Message", MessageSchema);
