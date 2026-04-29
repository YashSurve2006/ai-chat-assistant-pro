/* ══════════════════════════════════════════════
   routes/authRoutes.js
══════════════════════════════════════════════ */
"use strict";

const express = require("express");
const { body } = require("express-validator");
const { protect } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  register,
  login,
  getProfile,
  updateProfile,
} = require("../controllers/authController");

const router = express.Router();

/* ── Validation rules ───────────────────────── */

const registerValidation = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required.")
    .isLength({ min: 2, max: 60 }).withMessage("Name must be 2–60 characters."),
  body("email")
    .isEmail().withMessage("Please enter a valid email.")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters.")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
    .matches(/[0-9]/).withMessage("Password must contain at least one number."),
];

const loginValidation = [
  body("email")
    .isEmail().withMessage("Please enter a valid email.")
    .normalizeEmail(),
  body("password")
    .notEmpty().withMessage("Password is required."),
];

/* ── Routes ─────────────────────────────────── */
router.post("/register", authLimiter, registerValidation, register);
router.post("/login", authLimiter, loginValidation, login);
router.get("/profile", protect, getProfile);
router.patch("/profile", protect, updateProfile);

module.exports = router;
