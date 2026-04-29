/* ════════════════════════════════════════════════════════════
   models/File.js  –  files collection
   Database : ai_chat_app

   Purpose:
     Stores metadata for every uploaded file.
     Actual binary content lives on disk (uploads/ folder).
     This collection lets us:
       • list all files a user has uploaded
       • link files to specific conversations / messages
       • enforce per-user storage quotas
       • clean up orphaned files

   Schema:
     _id             ObjectId  (auto)
     userId          ObjectId  → ref: User           (required, indexed)
     conversationId  ObjectId  → ref: Conversation   (optional)
     messageId       ObjectId  → ref: Message        (optional)
     filename        String    the generated disk name  (e.g. 1711900000000-abc.pdf)
     originalName    String    the original file name the user chose
     filepath        String    relative path on disk  (uploads/<filename>)
     mimetype        String    MIME type  (e.g. application/pdf)
     filetype        String    simplified group: image | pdf | text | other
     filesize        Number    bytes
     url             String    public URL  (/uploads/<filename>)
     isOrphaned      Boolean   true when the parent message/conv is deleted
     createdAt       Date      auto
     updatedAt       Date      auto

   Indexes:
     userId          →  list user's files
     conversationId  →  cascade-delete when a conversation is removed
     filename        →  unique (prevents duplicate disk files)
════════════════════════════════════════════════════════════ */
"use strict";

const mongoose = require("mongoose");
const path     = require("path");

/* ── Schema ─────────────────────────────────────────────── */
const FileSchema = new mongoose.Schema(
  {
    /* ── Ownership ────────────────────────────────────── */
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: [true, "userId is required"],
    },

    /* ── Optional relations ───────────────────────────── */
    conversationId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Conversation",
      default: null,
    },

    messageId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Message",
      default: null,
    },

    /* ── File identity ────────────────────────────────── */
    filename: {
      type:     String,
      required: [true, "filename is required"],
      unique:   true,           // disk-level uniqueness
      trim:     true,
    },

    originalName: {
      type:     String,
      required: [true, "originalName is required"],
      trim:     true,
      maxlength: [255, "originalName too long"],
    },

    filepath: {
      type:     String,
      required: [true, "filepath is required"],
      trim:     true,
    },

    /* ── MIME / type ──────────────────────────────────── */
    mimetype: {
      type:     String,
      required: [true, "mimetype is required"],
      trim:     true,
    },

    filetype: {
      type:    String,
      enum:    {
        values:  ["image", "pdf", "text", "other"],
        message: "filetype must be image | pdf | text | other",
      },
      default: "other",
    },

    /* ── Size ─────────────────────────────────────────── */
    filesize: {
      type:    Number,
      required:[true, "filesize is required"],
      min:     [1,    "filesize must be > 0"],
      max:     [15 * 1024 * 1024, "filesize must be ≤ 15 MB"],  // 15 MB hard cap
    },

    /* ── Public URL ───────────────────────────────────── */
    url: {
      type:    String,
      default: null,
    },

    /* ── Lifecycle flag ───────────────────────────────── */
    isOrphaned: {
      type:    Boolean,
      default: false,
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
// List all files for a user, newest first
FileSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "idx_files_user_created" }
);

// Support cascade cleanup when a conversation is deleted
FileSchema.index(
  { conversationId: 1 },
  { name: "idx_files_conversation", sparse: true }
);

// Fetch files linked to a specific message
FileSchema.index(
  { messageId: 1 },
  { name: "idx_files_message", sparse: true }
);

// Unique disk filename
FileSchema.index(
  { filename: 1 },
  { unique: true, name: "idx_files_filename_unique" }
);

/* ═══════════════════════════════════════════════════════════
   VIRTUALS
═══════════════════════════════════════════════════════════ */
// Human-readable file size: "102 KB", "3.2 MB"
FileSchema.virtual("filesizeHuman").get(function () {
  const bytes = this.filesize;
  if (bytes < 1024)                          return `${bytes} B`;
  if (bytes < 1024 * 1024)                  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
});

// File extension
FileSchema.virtual("extension").get(function () {
  return path.extname(this.originalName).toLowerCase();
});

/* ═══════════════════════════════════════════════════════════
   PRE-SAVE HOOK
   Auto-derive filetype from mimetype if not already set.
═══════════════════════════════════════════════════════════ */
FileSchema.pre("save", function (next) {
  if (this.isModified("mimetype") || this.isNew) {
    if (this.mimetype.startsWith("image/"))              this.filetype = "image";
    else if (this.mimetype === "application/pdf")        this.filetype = "pdf";
    else if (this.mimetype.startsWith("text/") ||
             ["application/json",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
             ].includes(this.mimetype))                  this.filetype = "text";
    else                                                 this.filetype = "other";
  }
  // Auto-build URL from filename
  if (!this.url && this.filename) {
    this.url = `/uploads/${this.filename}`;
  }
  next();
});

/* ═══════════════════════════════════════════════════════════
   STATIC METHODS
═══════════════════════════════════════════════════════════ */
// Compute total storage used by a user (in bytes)
FileSchema.statics.totalStorageForUser = async function (userId) {
  const [result] = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, total: { $sum: "$filesize" } } },
  ]);
  return result?.total ?? 0;
};

// Mark all files in a conversation as orphaned (call after conv deletion)
FileSchema.statics.markOrphaned = function (conversationId) {
  return this.updateMany({ conversationId }, { $set: { isOrphaned: true } });
};

/* ── Export ─────────────────────────────────────────────── */
module.exports = mongoose.model("File", FileSchema);
