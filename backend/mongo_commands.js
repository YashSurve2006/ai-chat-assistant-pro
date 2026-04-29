// ═══════════════════════════════════════════════════════════════
//  mongo_commands.js  –  MongoDB Shell Command Reference
//  Database : ai_chat_app
//
//  Usage:
//    mongosh < mongo_commands.js         (run all at once)
//    mongosh                             (paste blocks interactively)
//
//  Sections:
//    1. Connect & Switch Database
//    2. Create Collections
//    3. Create Indexes
//    4. Sample Insert Documents
//    5. Useful Query Patterns
//    6. Aggregation Examples
//    7. Admin / Maintenance
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// SECTION 1 — Connect & Switch Database
// ─────────────────────────────────────────────────────────────

use ai_chat_app;

db.runCommand({ connectionStatus: 1 });       // verify connection
db.stats();                                   // show DB stats

// ─────────────────────────────────────────────────────────────
// SECTION 2 — Create Collections with Validators
// ─────────────────────────────────────────────────────────────

// ── users ──────────────────────────────────────────────────
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "email", "password"],
      properties: {
        name: {
          bsonType:    "string",
          minLength:   2,
          maxLength:   60,
          description: "required – full display name"
        },
        email: {
          bsonType:    "string",
          pattern:     "^\\S+@\\S+\\.\\S+$",
          description: "required – must be a valid email"
        },
        password: {
          bsonType:    "string",
          minLength:   60,   // bcrypt hash length
          description: "required – must be a bcrypt hash"
        },
        role: {
          bsonType: "string",
          enum:     ["user", "admin"],
          description: "defaults to 'user'"
        },
        isActive: {
          bsonType:    "bool",
          description: "soft-delete flag"
        }
      }
    }
  },
  validationLevel:  "moderate",   // only validate on insert/update
  validationAction: "error"
});

// ── conversations ───────────────────────────────────────────
db.createCollection("conversations", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "title"],
      properties: {
        userId: {
          bsonType:    "objectId",
          description: "required – ref to users._id"
        },
        title: {
          bsonType:    "string",
          maxLength:   120,
          description: "required – conversation title"
        },
        messageCount: {
          bsonType:    "int",
          minimum:     0,
          description: "denormalized message count"
        }
      }
    }
  },
  validationLevel:  "moderate",
  validationAction: "error"
});

// ── messages ────────────────────────────────────────────────
db.createCollection("messages", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["conversationId", "userId", "sender", "content"],
      properties: {
        conversationId: {
          bsonType:    "objectId",
          description: "required – ref to conversations._id"
        },
        userId: {
          bsonType:    "objectId",
          description: "required – ref to users._id"
        },
        sender: {
          bsonType: "string",
          enum:     ["user", "model"],
          description: "required – who sent this message"
        },
        content: {
          bsonType:    "string",
          maxLength:   32000,
          description: "required – message body"
        },
        reaction: {
          bsonType: ["string", "null"],
          enum:     ["like", "dislike", null],
          description: "user feedback on AI message"
        }
      }
    }
  },
  validationLevel:  "moderate",
  validationAction: "error"
});

// ── files ────────────────────────────────────────────────────
db.createCollection("files", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "filename", "originalName", "filepath", "mimetype", "filesize"],
      properties: {
        userId: {
          bsonType:    "objectId",
          description: "required – ref to users._id"
        },
        filetype: {
          bsonType: "string",
          enum:     ["image", "pdf", "text", "other"]
        },
        filesize: {
          bsonType: "int",
          minimum:  1,
          maximum:  15728640   // 15 MB
        }
      }
    }
  },
  validationLevel:  "moderate",
  validationAction: "error"
});

// ── sessions (optional) ─────────────────────────────────────
db.createCollection("sessions");

// ─────────────────────────────────────────────────────────────
// SECTION 3 — Indexes
// ─────────────────────────────────────────────────────────────

// ── users ──────────────────────────────────────────────────
db.users.createIndex(
  { email: 1 },
  { unique: true, name: "idx_users_email_unique" }
);

db.users.createIndex(
  { role: 1, isActive: 1 },
  { name: "idx_users_role_active" }
);

// ── conversations ───────────────────────────────────────────
db.conversations.createIndex(
  { userId: 1, updatedAt: -1 },
  { name: "idx_convs_user_updated" }
);

db.conversations.createIndex(
  { userId: 1, isPinned: -1, updatedAt: -1 },
  { name: "idx_convs_user_pinned_updated" }
);

db.conversations.createIndex(
  { title: "text" },
  { name: "idx_convs_title_text" }
);

// ── messages ────────────────────────────────────────────────
db.messages.createIndex(
  { conversationId: 1, createdAt: 1 },
  { name: "idx_msgs_conv_created" }
);

db.messages.createIndex(
  { userId: 1, createdAt: -1 },
  { name: "idx_msgs_user_created" }
);

db.messages.createIndex(
  { content: "text" },
  { name: "idx_msgs_content_text" }
);

// ── files ────────────────────────────────────────────────────
db.files.createIndex(
  { userId: 1, createdAt: -1 },
  { name: "idx_files_user_created" }
);

db.files.createIndex(
  { conversationId: 1 },
  { name: "idx_files_conversation", sparse: true }
);

db.files.createIndex(
  { filename: 1 },
  { unique: true, name: "idx_files_filename_unique" }
);

// ── sessions ─────────────────────────────────────────────────
db.sessions.createIndex(
  { userId: 1, isRevoked: 1 },
  { name: "idx_sessions_user_active" }
);

// TTL index: auto-delete expired session documents
db.sessions.createIndex(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "idx_sessions_ttl" }
);

// Verify all indexes
print("\n=== Index Report ===");
["users","conversations","messages","files","sessions"].forEach(col => {
  print("\n" + col + ":");
  db[col].getIndexes().forEach(i => print("  " + i.name + " → " + JSON.stringify(i.key)));
});

// ─────────────────────────────────────────────────────────────
// SECTION 4 — Sample Insert Documents
// ─────────────────────────────────────────────────────────────

// NOTE: In the real app, passwords are hashed by bcrypt before insert.
//       This is just a structure demonstration.

const userId = new ObjectId();
const convId  = new ObjectId();

db.users.insertOne({
  _id:         userId,
  name:        "John Doe",
  email:       "john@example.com",
  password:    "$2b$12$HASHED_PASSWORD_PLACEHOLDER",
  role:        "user",
  isActive:    true,
  avatar:      null,
  preferences: {
    theme:        "dark",
    model:        "gemini-1.5-flash",
    systemPrompt: "",
    temperature:  0.85
  },
  lastLoginAt: new Date(),
  createdAt:   new Date(),
  updatedAt:   new Date()
});

db.conversations.insertOne({
  _id:           convId,
  userId:        userId,
  title:         "JavaScript Promises Explained",
  model:         "gemini-1.5-flash",
  isPinned:      false,
  isArchived:    false,
  messageCount:  0,
  lastMessageAt: null,
  tags:          ["javascript", "async"],
  createdAt:     new Date(),
  updatedAt:     new Date()
});

const userMsgId = new ObjectId();
const aiMsgId   = new ObjectId();

db.messages.insertOne({
  _id:            userMsgId,
  conversationId: convId,
  userId:         userId,
  sender:         "user",
  content:        "Explain JavaScript promises with a real-world example.",
  attachments:    [],
  model:          null,
  tokens:         12,
  reaction:       null,
  createdAt:      new Date(),
  updatedAt:      new Date()
});

db.messages.insertOne({
  _id:            aiMsgId,
  conversationId: convId,
  userId:         userId,
  sender:         "model",
  content:        "A Promise in JavaScript represents a value that may be available now or in the future...",
  attachments:    [],
  model:          "gemini-1.5-flash",
  tokens:         98,
  reaction:       "like",
  createdAt:      new Date(),
  updatedAt:      new Date()
});

db.files.insertOne({
  userId:         userId,
  conversationId: convId,
  messageId:      userMsgId,
  filename:       "1711900000000-document.pdf",
  originalName:   "my-document.pdf",
  filepath:       "uploads/1711900000000-document.pdf",
  mimetype:       "application/pdf",
  filetype:       "pdf",
  filesize:       102400,
  url:            "/uploads/1711900000000-document.pdf",
  isOrphaned:     false,
  createdAt:      new Date(),
  updatedAt:      new Date()
});

// ─────────────────────────────────────────────────────────────
// SECTION 5 — Useful Query Patterns
// ─────────────────────────────────────────────────────────────

// Find user by email
db.users.findOne({ email: "john@example.com" }, { password: 0 });

// Count all users
db.users.countDocuments();

// All conversations for a user (newest first)
db.conversations.find({ userId: userId }).sort({ updatedAt: -1 }).limit(50);

// Pinned conversations first
db.conversations.find({ userId: userId, isArchived: false })
  .sort({ isPinned: -1, updatedAt: -1 });

// All messages in a conversation (chronological)
db.messages.find({ conversationId: convId }).sort({ createdAt: 1 });

// Last 30 messages for AI context
db.messages.find({ conversationId: convId })
  .sort({ createdAt: -1 })
  .limit(30)
  .project({ sender: 1, content: 1, model: 1 });

// Full-text search on message content
db.messages.find({ $text: { $search: "promises async await" } })
  .sort({ score: { $meta: "textScore" } })
  .limit(10);

// Files uploaded by a user
db.files.find({ userId: userId }).sort({ createdAt: -1 });

// ─────────────────────────────────────────────────────────────
// SECTION 6 — Aggregation Examples
// ─────────────────────────────────────────────────────────────

// ── Conversation list with message count join ───────────────
db.conversations.aggregate([
  { $match: { userId: userId, isArchived: false } },
  { $sort:  { isPinned: -1, updatedAt: -1 } },
  { $limit: 50 },
  {
    $lookup: {
      from:         "messages",
      localField:   "_id",
      foreignField: "conversationId",
      as:           "messages",
      pipeline:     [
        { $sort:    { createdAt: -1 } },
        { $limit:   1 },
        { $project: { content: 1, sender: 1, createdAt: 1 } }
      ]
    }
  },
  { $addFields: { lastMessage: { $arrayElemAt: ["$messages", 0] } } },
  { $project:   { messages: 0 } }
]);

// ── User stats: conversations + messages per user ───────────
db.conversations.aggregate([
  {
    $group: {
      _id:           "$userId",
      conversations: { $sum: 1 },
      totalMessages: { $sum: "$messageCount" }
    }
  },
  {
    $lookup: {
      from:         "users",
      localField:   "_id",
      foreignField: "_id",
      as:           "user"
    }
  },
  { $unwind:  "$user" },
  { $project: { "user.password": 0 } },
  { $sort:    { conversations: -1 } }
]);

// ── Total storage used per user ──────────────────────────────
db.files.aggregate([
  { $group: { _id: "$userId", totalBytes: { $sum: "$filesize" }, fileCount: { $sum: 1 } } },
  { $sort:  { totalBytes: -1 } },
  { $project: {
    totalBytes:  1,
    fileCount:   1,
    totalMB: { $round: [{ $divide: ["$totalBytes", 1048576] }, 2] }
  }}
]);

// ── Daily message volume over last 30 days ───────────────────
db.messages.aggregate([
  { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
  {
    $group: {
      _id: {
        year:  { $year:  "$createdAt" },
        month: { $month: "$createdAt" },
        day:   { $dayOfMonth: "$createdAt" }
      },
      count: { $sum: 1 }
    }
  },
  { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
]);

// ─────────────────────────────────────────────────────────────
// SECTION 7 — Admin / Maintenance
// ─────────────────────────────────────────────────────────────

// List all collections
db.getCollectionNames();

// Show collection stats
db.users.stats();
db.messages.stats();

// Count documents per collection
print("\n=== Document Counts ===");
["users","conversations","messages","files","sessions"].forEach(col => {
  print(col + ": " + db[col].countDocuments());
});

// Explain a query (verify index usage)
db.messages
  .find({ conversationId: convId })
  .sort({ createdAt: 1 })
  .explain("executionStats");

// Drop a collection (USE WITH CARE)
// db.sessions.drop();

// Drop + recreate the whole database (DANGEROUS!)
// db.dropDatabase();

print("\n✅ mongo_commands.js complete.");
