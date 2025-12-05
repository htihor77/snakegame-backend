// api/index.js
// Express app wrapped for Vercel (serverless) using serverless-http
const express = require("express");
const serverless = require("serverless-http");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const astra = require("../astraApi");

const app = express();
app.use(bodyParser.json());


// top of file
const cors = require('cors');    // << add this


// allow CORS from dev and your deployed frontend
app.use(cors({
  origin: [
    "http://localhost:3000",                         // local dev
    "https://your-frontend.vercel.app",              // replace with your frontend Vercel domain
    "https://snakegame-backend-g24u.vercel.app"     // optional if needed
  ],
  methods: ["GET","HEAD","PUT","PATCH","POST","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","Accept","Origin"],
  credentials: false
}));

// rest of your middlewares
app.use(express.json());


// Basic validators (same logic as earlier)
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validatePassword(password) {
  return password && password.length >= 4;
}
function validateName(name) {
  const trimmed = (name || "").trim();
  return trimmed.length >= 2 && trimmed.length <= 40 && /^[a-zA-Z\s\-']+$/.test(trimmed);
}

// Helper to make a token (simple base64 JSON)
function makeToken(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
function parseToken(token) {
  try {
    return JSON.parse(Buffer.from(token, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// ---------- AUTH: SIGNUP ----------
app.post("/auth/signup", async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !password || !name) return res.status(400).json({ error: "Email, password, name required" });
  if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email" });
  if (!validatePassword(password)) return res.status(400).json({ error: "Password too short (min 4)" });
  if (!validateName(name)) return res.status(400).json({ error: "Invalid name" });

  try {
    // check if user exists (query by primary key email)
    const existing = await astra.getRow("users", { email });
    if (existing) return res.status(409).json({ error: "User already exists" });

    // hash
    const hash = await bcrypt.hash(password, 10);
    const created_at = new Date().toISOString();

    // Insert row
    await astra.insertRow("users", { email, password: hash, name: name.trim(), created_at });

    const token = makeToken({ email, name: name.trim() });

    return res.json({ success: true, message: "Signup OK", token, email, name: name.trim() });
  } catch (err) {
    console.error("Signup Error:", err);
    return res.status(500).json({ error: "Signup failed", details: err && err.message });
  }
});

// ---------- AUTH: LOGIN ----------
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email" });

  try {
    const user = await astra.getRow("users", { email });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await bcrypt.compare(password, user.password || "");
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = makeToken({ email, name: user.name || "Player" });
    return res.json({ success: true, message: "Login OK", token, email, name: user.name || "Player" });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// ---------- SUBMIT SCORE ----------
app.post("/scores", async (req, res) => {
  const { token, score, level = 1, mode = "classic" } = req.body || {};
  if (!token || typeof score !== "number") return res.status(400).json({ error: "token and numeric score required" });

  const user = parseToken(token);
  if (!user || !user.email) return res.status(400).json({ error: "Invalid token" });

  try {
    const levelInt = parseInt(level) || 1;
    // Fetch existing best for that user & level (allowFiltering on Astra REST: use where query)
    const where = { level: { $eq: levelInt }, email: { $eq: user.email } };
    const existing = await astra.findRows("scores", where);

    let best = -Infinity;
    if (existing && existing.length) {
      best = Math.max(...existing.map(r => r.score || 0));
      if (score <= best) {
        return res.json({ success: true, updated: false, message: "Score not better than best", bestScore: best });
      }
      // delete old rows for this user's level (we'll just let them remain - or optionally delete)
      // Simpler: insert new row and leave older ones — leaderboard logic will take best
    }

    const id = uuidv4();
    const created_at = new Date().toISOString();

    await astra.insertRow("scores", { level: levelInt, created_at, id, email: user.email, name: user.name || "Player", score, mode });

    return res.json({ success: true, message: "Score submitted", id, updated: true });
  } catch (err) {
    console.error("Score Submit Error:", err);
    return res.status(500).json({ error: "Score submit failed", details: err.message });
  }
});

// ---------- GET TOP SCORES ----------
app.get("/scores/top", async (req, res) => {
  try {
    const level = parseInt(req.query.level) || 1;
    // Use a where query to get rows for the level
    const where = { level: { $eq: level } };
    const rows = await astra.findRows("scores", where);

    const arr = (rows || [])
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.created_at) - new Date(a.created_at);
      })
      .slice(0, 20)
      .map((r, idx) => ({ ...r, rank: idx + 1 }));

    res.json({ success: true, level, count: arr.length, data: arr });
  } catch (err) {
    console.error("Get Scores Error:", err);
    res.status(500).json({ error: "Cannot fetch scores", details: err.message });
  }
});

// default root (health)
app.get("/", (req, res) => res.json({ ok: true, service: "snakegame backend (vercel)" }));

// export for vercel (serverless)
module.exports = app;
module.exports.handler = serverless(app);
