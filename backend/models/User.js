/* ════════════════════════════════════════════════════════════
   models/User.js  –  users collection
   Database : ai_chat_app

   Schema:
     _id        ObjectId  (auto)
     name       String    required, 2-60 chars
     email      String    required, unique, lowercase
     password   String    required, min 8 chars, never returned
     role       String    enum: user | admin, default: "user"
     avatar     String    optional URL / initials fallback
     preferences Object   theme, model, systemPrompt, temperature
     isActive   Boolean   default true
     lastLoginAt Date     updated on every login
     createdAt  Date      auto (timestamps)
     updatedAt  Date      auto (timestamps)

   Indexes:
     email  →  unique
════════════════════════════════════════════════════════════ */
"use strict";

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

/* ── Schema ─────────────────────────────────────────────── */
const UserSchema = new mongoose.Schema(
  {
    /* ── Identity ─────────────────────────────────────── */
    name: {
      type:      String,
      required:  [true, "Name is required"],
      trim:      true,
      minlength: [2,  "Name must be at least 2 characters"],
      maxlength: [60, "Name cannot exceed 60 characters"],
    },

    email: {
      type:      String,
      required:  [true, "Email is required"],
      unique:    true,          // → unique index created automatically
      lowercase: true,
      trim:      true,
      match: [
        /^\S+@\S+\.\S+$/,
        "Please provide a valid email address",
      ],
    },

    password: {
      type:      String,
      required:  [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select:    false,         // NEVER returned in queries by default
    },

    /* ── Role & Status ────────────────────────────────── */
    role: {
      type:    String,
      enum:    {
        values:  ["user", "admin"],
        message: "Role must be 'user' or 'admin'",
      },
      default: "user",
    },

    isActive: {
      type:    Boolean,
      default: true,
    },

    /* ── Profile ──────────────────────────────────────── */
    avatar: {
      type:    String,
      default: null,
    },

    /* ── User preferences (synced from frontend) ──────── */
    preferences: {
      theme: {
        type:    String,
        enum:    ["dark", "light", "system"],
        default: "dark",
      },
      model: {
        type:    String,
        default: "gemini-1.5-flash",
      },
      systemPrompt: {
        type:      String,
        default:   "",
        maxlength: [2000, "System prompt cannot exceed 2000 characters"],
      },
      temperature: {
        type:    Number,
        default: 0.85,
        min:     [0, "Temperature minimum is 0"],
        max:     [2, "Temperature maximum is 2"],
      },
    },

    /* ── Audit ────────────────────────────────────────── */
    lastLoginAt: {
      type:    Date,
      default: null,
    },
  },
  {
    timestamps: true,          // adds createdAt + updatedAt automatically
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

/* ═══════════════════════════════════════════════════════════
   INDEXES
═══════════════════════════════════════════════════════════ */
// email uniqueness is enforced both by `unique: true` above
// and this explicit index for production readability:
UserSchema.index({ email: 1 }, { unique: true, name: "idx_users_email_unique" });

/* ═══════════════════════════════════════════════════════════
   VIRTUALS
═══════════════════════════════════════════════════════════ */
// Derive 1–2 letter initials from name for avatar fallback
UserSchema.virtual("initials").get(function () {
  return this.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
});

/* ═══════════════════════════════════════════════════════════
   PRE-SAVE HOOK – hash password before storing
═══════════════════════════════════════════════════════════ */
UserSchema.pre("save", async function (next) {
  // only re-hash when the password field was actually modified
  if (!this.isModified("password")) return next();

  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/* ═══════════════════════════════════════════════════════════
   INSTANCE METHODS
═══════════════════════════════════════════════════════════ */
// Compare a plain-text attempt against the stored hash
UserSchema.methods.matchPassword = async function (plainText) {
  return bcrypt.compare(plainText, this.password);
};

// Safe serialisation – strip password even if accidentally selected
UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  return obj;
};

/* ═══════════════════════════════════════════════════════════
   STATIC METHODS
═══════════════════════════════════════════════════════════ */
// Find active user by email (includes password for auth only)
UserSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email: email.toLowerCase(), isActive: true }).select("+password");
};

/* ── Export ─────────────────────────────────────────────── */
module.exports = mongoose.model("User", UserSchema);
