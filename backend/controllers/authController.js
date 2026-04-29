/* ══════════════════════════════════════════════
   controllers/authController.js
   Register · Login · Get Profile · Update Profile
══════════════════════════════════════════════ */
"use strict";

const jwt              = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const User             = require("../models/User");

/* ── Helper: generate JWT ────────────────────── */
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
    algorithm: "HS256",
  });

/* ── Helper: format user response ───────────── */
const userResponse = (user) => ({
  _id:         user._id,
  name:        user.name,
  email:       user.email,
  initials:    user.initials,
  preferences: user.preferences,
  createdAt:   user.createdAt,
  lastLoginAt: user.lastLoginAt,
});

/* ═════════════════════════════════════════════
   POST /api/register
═════════════════════════════════════════════ */
exports.register = async (req, res) => {
  /* Validate */
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array(),
    });
  }

  const { name, email, password } = req.body;

  try {
    /* Check duplicate */
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    /* Create user (password hashed by pre-save hook) */
    const user = await User.create({ name: name.trim(), email, password });

    /* Update last login */
    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      message: "Account created successfully! Welcome aboard 🎉",
      token,
      user: userResponse(user),
    });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ success: false, message: "Server error during registration." });
  }
};

/* ═════════════════════════════════════════════
   POST /api/login
═════════════════════════════════════════════ */
exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { email, password } = req.body;

  try {
    /* Find user (include password for comparison) */
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    /* Update last login */
    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user._id);

    res.json({
      success: true,
      message: `Welcome back, ${user.name}! 👋`,
      token,
      user: userResponse(user),
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ success: false, message: "Server error during login." });
  }
};

/* ═════════════════════════════════════════════
   GET /api/profile
═════════════════════════════════════════════ */
exports.getProfile = async (req, res) => {
  try {
    res.json({ success: true, user: userResponse(req.user) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
};

/* ═════════════════════════════════════════════
   PATCH /api/profile
═════════════════════════════════════════════ */
exports.updateProfile = async (req, res) => {
  const { name, preferences } = req.body;

  try {
    const user = await User.findById(req.user._id);

    if (name && name.trim()) user.name = name.trim().slice(0, 60);

    if (preferences && typeof preferences === "object") {
      const allowed = ["theme", "model", "systemPrompt", "temperature"];
      allowed.forEach((key) => {
        if (preferences[key] !== undefined) {
          user.preferences[key] = preferences[key];
        }
      });
    }

    await user.save();

    res.json({
      success: true,
      message: "Profile updated.",
      user: userResponse(user),
    });
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ success: false, message: "Server error updating profile." });
  }
};
