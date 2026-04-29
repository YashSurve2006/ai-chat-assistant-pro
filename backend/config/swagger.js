/* ══════════════════════════════════════════════════════════════
   config/swagger.js
   Swagger / OpenAPI 3.0 documentation setup
   Access at: GET /api-docs
══════════════════════════════════════════════════════════════ */
"use strict";

const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi    = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title:       "AI Chat Assistant Pro — API",
      version:     "1.0.0",
      description: "Production-grade AI Chat platform built with Node.js, Express, Socket.IO, Redis, and Google Gemini.",
      contact: { name: "AI Chat Team", email: "support@aichat.dev" },
    },
    servers: [
      { url: "http://localhost:5000", description: "Development" },
      { url: "http://localhost:5000", description: "Production" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type:         "http",
          scheme:       "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Error description" },
          },
        },
        User: {
          type: "object",
          properties: {
            _id:      { type: "string" },
            name:     { type: "string" },
            email:    { type: "string", format: "email" },
            initials: { type: "string" },
            preferences: {
              type: "object",
              properties: {
                theme:       { type: "string", enum: ["dark", "light"] },
                model:       { type: "string" },
                temperature: { type: "number" },
              },
            },
            createdAt:   { type: "string", format: "date-time" },
            lastLoginAt: { type: "string", format: "date-time" },
          },
        },
        Conversation: {
          type: "object",
          properties: {
            _id:           { type: "string" },
            title:         { type: "string" },
            model:         { type: "string" },
            isPinned:      { type: "boolean" },
            isArchived:    { type: "boolean" },
            messageCount:  { type: "integer" },
            lastMessageAt: { type: "string", format: "date-time" },
            createdAt:     { type: "string", format: "date-time" },
            updatedAt:     { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Auth",          description: "Authentication endpoints" },
      { name: "Chat",          description: "AI chat and conversation management" },
      { name: "Search",        description: "Search conversations" },
      { name: "System",        description: "Health and system endpoints" },
    ],
    paths: {
      /* ── Auth ─────────────────────────────────────────────── */
      "/api/v1/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "email", "password"],
                  properties: {
                    name:     { type: "string", example: "Alice Smith" },
                    email:    { type: "string", format: "email", example: "alice@example.com" },
                    password: { type: "string", minLength: 8, example: "Secret123" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Registered successfully" },
            400: { description: "Validation error" },
            409: { description: "Email already exists" },
          },
        },
      },
      "/api/v1/login": {
        post: {
          tags: ["Auth"],
          summary: "Login and receive JWT",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email:    { type: "string", format: "email", example: "alice@example.com" },
                    password: { type: "string", example: "Secret123" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Login successful, returns JWT" },
            401: { description: "Invalid credentials" },
          },
        },
      },
      "/api/v1/profile": {
        get: {
          tags: ["Auth"],
          summary: "Get current user profile",
          responses: {
            200: { description: "User profile" },
            401: { description: "Unauthorized" },
          },
        },
        patch: {
          tags: ["Auth"],
          summary: "Update user name or preferences",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name:        { type: "string" },
                    preferences: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Profile updated" },
          },
        },
      },

      /* ── Chat ─────────────────────────────────────────────── */
      "/api/v1/chat": {
        post: {
          tags: ["Chat"],
          summary: "Send a message and receive streaming AI response (SSE)",
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    message:        { type: "string" },
                    conversationId: { type: "string" },
                    model:          { type: "string" },
                    files:          { type: "array", items: { type: "string", format: "binary" } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "SSE stream of AI response chunks" },
          },
        },
      },
      "/api/v1/conversations": {
        get: {
          tags: ["Chat"],
          summary: "List conversations with pagination",
          parameters: [
            { name: "page",  in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: {
            200: { description: "Paginated list of conversations" },
          },
        },
        delete: {
          tags: ["Chat"],
          summary: "Delete all conversations (soft delete)",
          responses: { 200: { description: "All conversations deleted" } },
        },
      },
      "/api/v1/conversation/{id}": {
        get: {
          tags: ["Chat"],
          summary: "Get a single conversation with messages",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Conversation object" }, 404: { description: "Not found" } },
        },
        patch: {
          tags: ["Chat"],
          summary: "Update conversation (title, pin, archive)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Updated" } },
        },
        delete: {
          tags: ["Chat"],
          summary: "Soft delete a conversation",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Soft deleted" } },
        },
      },

      /* ── Search ─────────────────────────────────────────────── */
      "/api/v1/search": {
        get: {
          tags: ["Search"],
          summary: "Search conversations by title and message content",
          parameters: [
            { name: "q",     in: "query", required: true, schema: { type: "string" }, description: "Search keyword" },
            { name: "page",  in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Search results" } },
        },
      },

      /* ── System ─────────────────────────────────────────────── */
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health check — status, uptime, memory",
          security: [],
          responses: { 200: { description: "System health info" } },
        },
      },
    },
  },
  apis: [], // Using inline definitions above
};

const spec = swaggerJsdoc(options);

module.exports = { spec, swaggerUi };
