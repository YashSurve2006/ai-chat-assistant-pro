/* ══════════════════════════════════════════════
   routes/chatRoutes.js
   Production-ready Chat Routes
   - Secure authentication
   - File upload validation
   - Rate limiting
   - Safe controller binding
══════════════════════════════════════════════ */
"use strict";

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { protect } = require("../middleware/authMiddleware");
const { chatLimiter } = require("../middleware/rateLimiter");

const controller = require("../controllers/chatController");

const router = express.Router();
console.log(
  "Controller keys:",
  Object.keys(
    require("../controllers/chatController")
  )
);
/* ══════════════════════════════════════════════
   Validate Controller Functions
══════════════════════════════════════════════ */

const requiredHandlers = [
  "chat",
  "getConversations",
  "getConversation",
  "updateConversation",
  "deleteConversation",
  "clearAllConversations",
  "reactToMessage",
];

requiredHandlers.forEach((fn) => {
  if (typeof controller[fn] !== "function") {
    console.error(`❌ Missing controller function: ${fn}`);
    throw new Error(`Controller function "${fn}" is not defined`);
  }
});

/* ══════════════════════════════════════════════
   Upload Directory Setup
══════════════════════════════════════════════ */

const uploadDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 Upload directory created");
}

/* ══════════════════════════════════════════════
   Multer Storage Configuration
══════════════════════════════════════════════ */

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {

    const unique =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9);

    const ext =
      path.extname(file.originalname);

    cb(null, `${unique}${ext}`);
  },

});

/* ══════════════════════════════════════════════
   File Validation
══════════════════════════════════════════════ */

const ALLOWED_TYPES = [

  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",

  "application/pdf",

  "text/plain",
  "text/markdown",
  "text/csv",

  "application/json",

  "application/msword",

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

];

const MAX_FILE_SIZE =
  (parseInt(process.env.MAX_FILE_SIZE_MB) || 10)
  * 1024
  * 1024;

/* ══════════════════════════════════════════════
   Multer Middleware
══════════════════════════════════════════════ */

const upload = multer({

  storage,

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },

  fileFilter: (req, file, cb) => {

    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    }
    else {
      cb(
        new Error(
          `File type not allowed: ${file.mimetype}`
        ),
        false
      );
    }

  },

});

/* ══════════════════════════════════════════════
   Upload Error Handler
══════════════════════════════════════════════ */

const handleUpload = (req, res, next) => {

  upload.array("files", 5)(
    req,
    res,
    (err) => {

      if (err instanceof multer.MulterError) {

        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`,
        });

      }

      if (err) {

        return res.status(400).json({
          success: false,
          message: err.message,
        });

      }

      next();

    }
  );

};

/* ══════════════════════════════════════════════
   Health Route (Debug)
══════════════════════════════════════════════ */

router.get(
  "/chat-health",
  protect,
  async (req, res) => {

    res.json({
      success: true,
      message: "Chat routes working",
      timestamp: new Date(),
    });

  }
);

/* ══════════════════════════════════════════════
   Chat Routes
══════════════════════════════════════════════ */

/* Send message */

router.post(
  "/chat",
  protect,
  chatLimiter,
  handleUpload,
  controller.chat
);

/* Get conversation list */

router.get(
  "/conversations",
  protect,
  controller.getConversations
);

/* Get single conversation */

router.get(
  "/conversation/:id",
  protect,
  controller.getConversation
);

/* Update conversation */

router.patch(
  "/conversation/:id",
  protect,
  controller.updateConversation
);

/* Delete single conversation */

router.delete(
  "/conversation/:id",
  protect,
  controller.deleteConversation
);

/* Clear all conversations */

router.delete(
  "/conversations",
  protect,
  controller.clearAllConversations
);

/* React to message */

router.post(
  "/conversation/:id/react",
  protect,
  controller.reactToMessage
);

/* ================================
   GET ALL CONVERSATIONS
================================ */

exports.getConversations = async (req, res) => {
  try {

    const conversations =
      await Conversation.find({
        userId: req.user._id,
        isDeleted: { $ne: true }
      })
        .sort({ updatedAt: -1 })
        .lean();

    res.json({
      success: true,
      conversations,
    });

  } catch (err) {

    logger.error(
      "Get conversations error:",
      err.message
    );

    res.status(500).json({
      success: false,
      message: "Server error",
    });

  }
};
/* ══════════════════════════════════════════════ */

module.exports = router;