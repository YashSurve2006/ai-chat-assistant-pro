/* ════════════════════════════════════════════════════════════
   models/Conversation.js  –  conversations collection
   Database : ai_chat_app

   Schema:
     _id           ObjectId  (auto)
     userId        ObjectId  → ref: User  (required, indexed)
     title         String    auto-generated from first message
     model         String    which Gemini model was used
     isPinned      Boolean   default false
     isArchived    Boolean   default false
     messageCount  Number    denormalized count for list views
     lastMessageAt Date      updated when a new message is added
     tags          [String]  optional user-defined tags
     createdAt     Date      auto
     updatedAt     Date      auto

   Relationships:
     User          1 ──< * Conversation
     Conversation  1 ──< * Message   (Message.conversationId)
     Conversation  1 ──< * File      (File.conversationId)

   Indexes:
     userId  →  compound with updatedAt DESC  (list view performance)
     userId + isPinned + updatedAt (pinned-first list sort)
════════════════════════════════════════════════════════════ */
"use strict";

const mongoose = require("mongoose");

/* ── Schema ─────────────────────────────────────────────── */
const ConversationSchema = new mongoose.Schema(
  {
    /* ── Ownership ────────────────────────────────────── */
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: [true, "userId is required"],
    },

    /* ── Metadata ─────────────────────────────────────── */
    title: {
      type:      String,
      trim:      true,
      default:   "New Conversation",
      maxlength: [120, "Title cannot exceed 120 characters"],
    },

    model: {
      type:    String,
      default: "gemini-1.5-flash",
    },

    /* ── Status flags ─────────────────────────────────── */
    isPinned: {
      type:    Boolean,
      default: false,
    },

    isArchived: {
      type:    Boolean,
      default: false,
    },

    /* ── Soft delete ──────────────────────────────────── */
    isDeleted: {
      type:    Boolean,
      default: false,
      index:   true,
    },

    deletedAt: {
      type:    Date,
      default: null,
    },

    /* ── Denormalised counters (updated by Message hooks) ─ */
    messageCount: {
      type:    Number,
      default: 0,
      min:     0,
    },

    lastMessageAt: {
      type:    Date,
      default: null,
    },

    /* ── Optional user-defined tags ───────────────────── */
    tags: [
      {
        type:      String,
        trim:      true,
        maxlength: 30,
      },
    ],

    /* ── Embedded messages (for chat history) ─────────── */
    messages: [
      {
        role: {
          type:    String,
          enum:    ["user", "model"],
          required: true,
        },
        content: {
          type:      String,
          required:  true,
          maxlength: 32000,
        },
        attachments: [
          {
            filename:     { type: String },
            originalName: { type: String },
            mimetype:     { type: String },
            size:         { type: Number },
            url:          { type: String },
            _id:          false,
          },
        ],
        model:    { type: String, default: null },
        tokens:   { type: Number, default: 0 },
        reaction: {
          type:    String,
          enum:    ["like", "dislike", null],
          default: null,
        },
      },
    ],
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
// Primary query: "show all conversations for this user, newest first"
ConversationSchema.index(
  { userId: 1, updatedAt: -1 },
  { name: "idx_convs_user_updated" }
);

// Pinned-first ordering
ConversationSchema.index(
  { userId: 1, isPinned: -1, updatedAt: -1 },
  { name: "idx_convs_user_pinned_updated" }
);

// Full-text search on title
ConversationSchema.index(
  { title: "text" },
  { name: "idx_convs_title_text" }
);

// Soft-delete cleanup query: find soft-deleted by date
ConversationSchema.index(
  { isDeleted: 1, deletedAt: 1 },
  { name: "idx_convs_soft_delete", sparse: true }
);

/* ═══════════════════════════════════════════════════════════
   VIRTUALS
═══════════════════════════════════════════════════════════ */
// Human-readable age for API responses
ConversationSchema.virtual("age").get(function () {
  const diff = Date.now() - this.createdAt.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days} days ago`;
  return this.createdAt.toLocaleDateString();
});

/* ═══════════════════════════════════════════════════════════
   STATIC METHODS
═══════════════════════════════════════════════════════════ */
// Auto-generate a clean title from the first user message
ConversationSchema.statics.generateTitle = function (text = "") {
  const cleaned = text
    .replace(/[#*`_~\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 44) return cleaned || "New Conversation";
  const truncated = cleaned.slice(0, 44);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
};

/* ── Export ─────────────────────────────────────────────── */
module.exports = mongoose.model("Conversation", ConversationSchema);
