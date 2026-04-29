/* ════════════════════════════════════════════════════════════
   config/db.js  –  Production MongoDB connection
   Database : ai_chat_app
   Collections : users · conversations · messages · files
════════════════════════════════════════════════════════════ */
"use strict";

const mongoose = require("mongoose");

/* ── Connection options ─────────────────────────────────── */
const MONGO_OPTIONS = {
  // Connection pool
  maxPoolSize:              10,   // keep ≤10 connections open
  minPoolSize:               2,   // always keep 2 warm
  // Timeouts
  serverSelectionTimeoutMS: 5000, // give up finding a server after 5 s
  socketTimeoutMS:         45000, // close idle sockets after 45 s
  connectTimeoutMS:        10000, // TCP connect timeout
  // Heartbeat
  heartbeatFrequencyMS:    10000, // check server health every 10 s
};

/* ── Connect ────────────────────────────────────────────── */
const connectDB = async () => {
  try {
    const uri  = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not defined in .env");

    mongoose.set("strictQuery", true); // only allow schema-defined fields

    const conn = await mongoose.connect(uri, MONGO_OPTIONS);

    const { host, port, name } = conn.connection;

    console.log("");
    console.log("📦 MongoDB Connected");
    console.log(`   Host     : ${host}:${port}`);
    console.log(`   Database : ${name}`);
    console.log(`   Status   : ${mongoose.connection.readyState === 1 ? "ready" : "connecting"}`);
    console.log("");

    /* ── Register connection events ─────────────────────── */
    mongoose.connection.on("connected", () =>
      console.log("✅ Mongoose: connected to MongoDB")
    );

    mongoose.connection.on("disconnected", () =>
      console.warn("⚠️  Mongoose: disconnected from MongoDB – will attempt reconnect")
    );

    mongoose.connection.on("reconnected", () =>
      console.log("🔄 Mongoose: reconnected to MongoDB")
    );

    mongoose.connection.on("error", (err) =>
      console.error("❌ Mongoose connection error:", err.message)
    );

    /* ── Graceful shutdown ──────────────────────────────── */
    const closeDB = async (signal) => {
      await mongoose.connection.close();
      console.log(`\n🔌 MongoDB connection closed (${signal})`);
      process.exit(0);
    };

    process.on("SIGINT",  () => closeDB("SIGINT"));
    process.on("SIGTERM", () => closeDB("SIGTERM"));

  } catch (err) {
    console.error(`\n❌ MongoDB connection FAILED:\n   ${err.message}\n`);
    process.exit(1);
  }
};

module.exports = connectDB;
