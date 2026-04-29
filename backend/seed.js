/* ════════════════════════════════════════════════════════════
   seed.js  –  Database seed script
   Database  : ai_chat_app
   Run with  : node seed.js                (uses .env)
               node seed.js --clean        (wipe + re-seed)

   Inserts:
     1 admin user
     1 regular test user
     2 conversations per user
     3 messages per conversation
     1 sample file record
════════════════════════════════════════════════════════════ */
"use strict";

require("dotenv").config();

const mongoose     = require("mongoose");
const User         = require("./models/User");
const Conversation = require("./models/Conversation");
const Message      = require("./models/Message");
const File         = require("./models/File");

/* ── CLI flag ────────────────────────────────────────────── */
const CLEAN_FIRST  = process.argv.includes("--clean");

/* ── Connect ─────────────────────────────────────────────── */
async function connect() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai_chat_app";
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`\n📦 Connected to: ${mongoose.connection.host}/${mongoose.connection.name}\n`);
}

/* ── Clean ───────────────────────────────────────────────── */
async function cleanDB() {
  console.log("🗑️  Dropping existing seed data…");
  await Promise.all([
    User.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    File.deleteMany({}),
  ]);
  console.log("   Done.\n");
}

/* ── Seed ────────────────────────────────────────────────── */
async function seed() {
  /* ─────────── 1. USERS ─────────── */
  console.log("👤 Creating users…");

  const admin = await User.create({
    name:      "Admin User",
    email:     "admin@example.com",
    password:  "Admin123!",          // hashed by pre-save hook
    role:      "admin",
    isActive:  true,
    lastLoginAt: new Date(),
    preferences: {
      theme:        "dark",
      model:        "gemini-1.5-pro",
      systemPrompt: "You are an expert full-stack developer.",
      temperature:  0.7,
    },
  });

  const testUser = await User.create({
    name:      "John Doe",
    email:     "test@example.com",
    password:  "Test1234!",          // hashed by pre-save hook
    role:      "user",
    isActive:  true,
    lastLoginAt: new Date(),
    preferences: {
      theme:        "dark",
      model:        "gemini-1.5-flash",
      systemPrompt: "",
      temperature:  0.85,
    },
  });

  console.log(`   ✅ admin@example.com   (role: admin,  id: ${admin._id})`);
  console.log(`   ✅ test@example.com    (role: user,   id: ${testUser._id})\n`);

  /* ─────────── 2. CONVERSATIONS (test user) ─────────── */
  console.log("💬 Creating conversations…");

  const conv1 = await Conversation.create({
    userId:   testUser._id,
    title:    "JavaScript Promises Explained",
    model:    "gemini-1.5-flash",
    isPinned: true,
    tags:     ["javascript", "async"],
  });

  const conv2 = await Conversation.create({
    userId: testUser._id,
    title:  "Building a REST API with Express",
    model:  "gemini-1.5-flash",
    tags:   ["nodejs", "express", "api"],
  });

  /* Admin conversation */
  const conv3 = await Conversation.create({
    userId: admin._id,
    title:  "System Architecture Review",
    model:  "gemini-1.5-pro",
    tags:   ["architecture"],
  });

  console.log(`   ✅ conv1: "${conv1.title}" (id: ${conv1._id})`);
  console.log(`   ✅ conv2: "${conv2.title}" (id: ${conv2._id})`);
  console.log(`   ✅ conv3: "${conv3.title}" (id: ${conv3._id})\n`);

  /* ─────────── 3. MESSAGES ─────────── */
  console.log("✉️  Creating messages…");

  /* ── Conv1 thread ── */
  await Message.create({
    conversationId: conv1._id,
    userId:         testUser._id,
    sender:         "user",
    content:        "Explain JavaScript promises with a real-world example.",
    tokens:         12,
  });

  await Message.create({
    conversationId: conv1._id,
    userId:         testUser._id,
    sender:         "model",
    content: `A **Promise** in JavaScript represents a value that may be available now, in the future, or never.

\`\`\`javascript
// Real-world example: fetching user data
function fetchUser(id) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (id > 0) {
        resolve({ id, name: "John", email: "john@example.com" });
      } else {
        reject(new Error("Invalid user ID"));
      }
    }, 500);
  });
}

// Usage with async/await (cleaner syntax)
async function main() {
  try {
    const user = await fetchUser(42);
    console.log("User:", user);
  } catch (err) {
    console.error("Error:", err.message);
  }
}
\`\`\`

Promises have three states: **pending**, **fulfilled**, and **rejected**.`,
    model:    "gemini-1.5-flash",
    tokens:   120,
    reaction: "like",
  });

  await Message.create({
    conversationId: conv1._id,
    userId:         testUser._id,
    sender:         "user",
    content:        "What is the difference between Promise.all and Promise.allSettled?",
    tokens:         15,
  });

  /* ── Conv2 thread ── */
  await Message.create({
    conversationId: conv2._id,
    userId:         testUser._id,
    sender:         "user",
    content:        "How do I build a REST API with Express.js and MongoDB?",
    tokens:         13,
  });

  await Message.create({
    conversationId: conv2._id,
    userId:         testUser._id,
    sender:         "model",
    content: `Here's a minimal but production-ready Express + MongoDB REST API skeleton:

\`\`\`javascript
const express  = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI);

// GET /api/users
app.get('/api/users', async (req, res) => {
  const users = await User.find().select('-password');
  res.json({ success: true, data: users });
});

app.listen(5000, () => console.log('Server running on :5000'));
\`\`\`

Key packages: **express**, **mongoose**, **dotenv**, **cors**, **helmet**, **bcryptjs**, **jsonwebtoken**.`,
    model:  "gemini-1.5-flash",
    tokens: 98,
  });

  /* ── Conv3 thread (admin) ── */
  await Message.create({
    conversationId: conv3._id,
    userId:         admin._id,
    sender:         "user",
    content:        "Review our microservices architecture for potential bottlenecks.",
    tokens:         11,
  });

  await Message.create({
    conversationId: conv3._id,
    userId:         admin._id,
    sender:         "model",
    content:        "I'll analyze your microservices architecture. Common bottlenecks include synchronous inter-service calls, shared databases, and missing circuit breakers. I recommend implementing an API gateway, event-driven communication via a message queue (RabbitMQ / Kafka), and per-service databases to achieve true loose coupling.",
    model:          "gemini-1.5-pro",
    tokens:         62,
    reaction:       "like",
  });

  console.log("   ✅ 7 messages created\n");

  /* ── Update conversation counters (post-save hook handles new messages,
         but we do a manual sync here for accuracy after bulk inserts) ── */
  await Conversation.findByIdAndUpdate(conv1._id, { messageCount: 3, lastMessageAt: new Date() });
  await Conversation.findByIdAndUpdate(conv2._id, { messageCount: 2, lastMessageAt: new Date() });
  await Conversation.findByIdAndUpdate(conv3._id, { messageCount: 2, lastMessageAt: new Date() });

  /* ─────────── 4. FILE RECORD ─────────── */
  console.log("📎 Creating sample file record…");

  const sampleFile = await File.create({
    userId:         testUser._id,
    conversationId: conv2._id,
    filename:       "1711900000000-sample.pdf",
    originalName:   "express-guide.pdf",
    filepath:       "uploads/1711900000000-sample.pdf",
    mimetype:       "application/pdf",
    filesize:       102_400,   // 100 KB
    url:            "/uploads/1711900000000-sample.pdf",
  });

  console.log(`   ✅ ${sampleFile.originalName}  (${sampleFile.filesizeHuman}, id: ${sampleFile._id})\n`);

  /* ─────────── SUMMARY ─────────── */
  console.log("═══════════════════════════════════════════");
  console.log("✅ Seed Complete!");
  console.log("───────────────────────────────────────────");
  console.log("Test Credentials:");
  console.log("  📧 test@example.com       🔑 Test1234!");
  console.log("  📧 admin@example.com      🔑 Admin123!");
  console.log("───────────────────────────────────────────");
  console.log(`Users         : 2`);
  console.log(`Conversations : 3`);
  console.log(`Messages      : 7`);
  console.log(`Files         : 1`);
  console.log("═══════════════════════════════════════════\n");
}

/* ── Main ────────────────────────────────────────────────── */
(async () => {
  try {
    await connect();
    if (CLEAN_FIRST) await cleanDB();
    await seed();
  } catch (err) {
    console.error("\n❌ Seed failed:", err.message);
    if (err.code === 11000) {
      console.error(
        "   Duplicate key error — database already seeded.\n" +
        "   Re-run with --clean to wipe first:  node seed.js --clean\n"
      );
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Connection closed.");
    process.exit(0);
  }
})();
