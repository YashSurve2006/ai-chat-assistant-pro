"use strict";

const axios = require("axios");
const xss = require("xss");

const Conversation = require("../models/Conversation");
const cache = require("../config/redis");
const logger = require("../config/logger");

/* ================================
   OLLAMA CONFIG
================================ */

const OLLAMA_URL =
  process.env.OLLAMA_URL ||
  "http://localhost:11434";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ||
  "llama3";

/* ================================
   HELPERS
================================ */

const sanitize = (str) =>
  xss(String(str || "").trim());

const estimateTokens = (text) =>
  Math.ceil((text || "").length / 4);

const generateTitle = (text) => {
  const cleaned = text
    .replace(/[#*`_~\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= 44)
    return cleaned;

  return cleaned.slice(0, 44) + "…";
};

/* ================================
   CHAT
================================ */

exports.chat = async (req, res) => {
  const { message, conversationId } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      message: "Message required",
    });
  }

  const cleanMessage = sanitize(message);

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Standardized SSE sender
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let conversation;

    const mongoose = require("mongoose");

    /* ================================
       FIND EXISTING CONVERSATION SAFELY
    ================================ */

    if (
      conversationId &&
      mongoose.Types.ObjectId.isValid(conversationId)
    ) {
      try {
        conversation = await Conversation.findOne({
          _id: conversationId,
          userId: req.user._id,
          isDeleted: { $ne: true },
        });
      } catch (err) {
        logger.warn(
          "Invalid conversation lookup:",
          err.message
        );
        conversation = null;
      }
    }

    /* ================================
       CREATE NEW CONVERSATION IF NEEDED
    ================================ */

    if (!conversation) {
      conversation = new Conversation({
        userId: req.user._id,
        title: generateTitle(cleanMessage),
        model: OLLAMA_MODEL,
        messages: [],
      });
    }

    /* ================================
       ADD USER MESSAGE
    ================================ */

    conversation.messages = conversation.messages || [];

    conversation.messages.push({
      role: "user",
      content: cleanMessage,
      tokens: estimateTokens(cleanMessage),
    });

    /* ================================
       BUILD HISTORY
    ================================ */

    const history = conversation.messages
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    /* ================================
       NOTIFY FRONTEND START
    ================================ */

    sendEvent("start", {
      conversationId: conversation._id,
      model: OLLAMA_MODEL,
    });

    /* ================================
       CALL OLLAMA STREAM
    ================================ */

    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: history,
        stream: true,
      },
      {
        responseType: "stream",
        timeout: 120000,
      }
    );

    let aiText = "";
    let streamBuffer = "";

    response.data.on("data", async (chunk) => {
      try {
        // Append chunk to buffer
        streamBuffer += chunk.toString();

        const lines = streamBuffer.split("\n");

        // Keep incomplete JSON in buffer
        streamBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let parsed;

          try {
            parsed = JSON.parse(trimmed);
          } catch {
            continue;
          }

          /* ===============================
             STREAM TOKEN
          =============================== */

          if (parsed.response) {
            aiText += parsed.response;

            if (!res.writableEnded) {
              sendEvent("token", {
                text: parsed.response,
              });
            }
          }

          /* ===============================
             STREAM FINISHED
          =============================== */

          if (parsed.done) {

            // Prevent duplicate execution
            if (res.writableEnded) return;

            try {
              conversation.messages.push({
                role: "model",
                content: sanitize(aiText),
                tokens: estimateTokens(aiText),
                model: OLLAMA_MODEL,
              });

              await conversation.save();

              if (cache?.delPattern) {
                await cache.delPattern(
                  `convList:${req.user._id}:*`
                );
              }

              if (!res.writableEnded) {
                sendEvent("done", {
                  conversationId: conversation._id,
                  title: conversation.title,
                });

                res.end();
              }

            } catch (dbErr) {
              logger.error("Conversation save error:", dbErr.message);

              if (!res.writableEnded) {
                sendEvent("error", {
                  message: "Database save error",
                });

                res.end();
              }
            }

            return;
          }
        }

      } catch (err) {
        logger.error("Stream processing error:", err.message);

        if (!res.writableEnded) {
          sendEvent("error", {
            message: "Stream processing error",
          });

          res.end();
        }
      }
    });


    /* ===============================
       STREAM END SAFETY
    ================================ */

    response.data.on("end", () => {
      if (!res.writableEnded) {
        res.end();
      }
    });


    /* ===============================
       STREAM CLOSE SAFETY
    ================================ */

    response.data.on("close", () => {
      if (!res.writableEnded) {
        res.end();
      }
    });


    /* ===============================
       STREAM ERROR HANDLER
    ================================ */

    response.data.on("error", (err) => {
      logger.error("Stream error:", err.message);

      if (!res.writableEnded) {
        sendEvent("error", {
          message: "Streaming error",
        });

        res.end();
      }
    });


    /* ===============================
       GLOBAL TRY/CATCH
    ================================ */

  } catch (err) {
    logger.error("Chat error FULL:", {
      message: err.message,
      stack: err.stack,
    });

    console.error("Chat error FULL:", err);

    if (!res.writableEnded) {
      sendEvent("error", {
        message: "AI service error",
      });

      res.end();
    }
  }
};   // <-- ADD THIS LINE HERE
/* ================================
   GET ALL CONVERSATIONS
================================ */

exports.getConversations =
  async (req, res) => {
    try {
      const conversations =
        await Conversation.find({
          userId:
            req.user._id,
          isDeleted: {
            $ne: true,
          },
        })
          .sort({
            updatedAt: -1,
          })
          .lean();

      res.json({
        success: true,
        conversations,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message:
          "Server error",
      });
    }
  };

/* ================================
   GET SINGLE CONVERSATION
================================ */

exports.getConversation =
  async (req, res) => {
    try {
      const conversation =
        await Conversation.findOne(
          {
            _id:
              req.params.id,
            userId:
              req.user._id,
          }
        );

      if (!conversation) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Conversation not found",
          });
      }

      res.json({
        success: true,
        conversation,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message:
          "Server error",
      });
    }
  };

/* ================================
   DELETE CONVERSATION
================================ */

exports.deleteConversation =
  async (req, res) => {
    try {
      await Conversation.updateOne(
        {
          _id:
            req.params.id,
          userId:
            req.user._id,
        },
        {
          $set: {
            isDeleted: true,
            deletedAt:
              new Date(),
          },
        }
      );

      res.json({
        success: true,
        message:
          "Conversation deleted",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message:
          "Server error",
      });
    }
  };

/* ================================
   UPDATE CONVERSATION
================================ */

exports.updateConversation =
  async (req, res) => {
    try {
      const { title } =
        req.body;

      const conversation =
        await Conversation.findOneAndUpdate(
          {
            _id:
              req.params.id,
            userId:
              req.user._id,
          },
          {
            title:
              sanitize(title),
          },
          {
            new: true,
          }
        );

      res.json({
        success: true,
        conversation,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
      });
    }
  };

/* ================================
   CLEAR ALL
================================ */

exports.clearAllConversations =
  async (req, res) => {
    try {
      await Conversation.updateMany(
        {
          userId:
            req.user._id,
        },
        {
          $set: {
            isDeleted: true,
          },
        }
      );

      res.json({
        success: true,
        message:
          "All conversations cleared",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
      });
    }
  };

/* ================================
   REACT TO MESSAGE
================================ */

exports.reactToMessage =
  async (req, res) => {
    try {
      res.json({
        success: true,
        message:
          "Reaction saved",
      });
    } catch {
      res.status(500).json({
        success: false,
      });
    }
  };