
// require("dotenv").config();

// const express = require("express");
// const cors = require("cors");
// const cassandra = require("cassandra-driver");
// const { v4: uuidv4 } = require("uuid");

// const app = express();
// app.use(cors());
// app.use(express.json());

// // ---------- config ----------
// const KEYSPACE = process.env.KEYSPACE || "snakeks";
// const ASTRA_SECURE_BUNDLE = process.env.ASTRA_SECURE_BUNDLE; // path to secure-connect-*.zip
// const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN; // full token string (starts with AstraCS:)
// const ASTRA_CLIENT_ID = process.env.ASTRA_CLIENT_ID; // optional older flow
// const ASTRA_CLIENT_SECRET = process.env.ASTRA_CLIENT_SECRET; // optional older flow

// const MAX_RETRIES = 6;
// const RETRY_DELAY_MS = 2000;

// // ---------- create cassandra client ----------
// let client;

// function createLocalClient() {
//   return new cassandra.Client({
//     contactPoints: (process.env.CONTACT_POINTS || "127.0.0.1").split(","),
//     localDataCenter: process.env.LOCAL_DATACENTER || "datacenter1",
//     keyspace: KEYSPACE,
//   });
// }

// function createAstraClient() {
//   // prefer token auth (recommended)
//   if (!ASTRA_SECURE_BUNDLE) {
//     throw new Error("ASTRA_SECURE_BUNDLE is required for Astra mode");
//   }
//   const cloud = { secureConnectBundle: ASTRA_SECURE_BUNDLE };

//   // If user provided application token use username "token" and that token as password
//   if (ASTRA_DB_APPLICATION_TOKEN) {
//     const authProvider = new cassandra.auth.PlainTextAuthProvider("token", ASTRA_DB_APPLICATION_TOKEN);
//     return new cassandra.Client({ cloud, authProvider, keyspace: KEYSPACE });
//   }

//   // fallback: older clientId/secret pattern
//   if (ASTRA_CLIENT_ID && ASTRA_CLIENT_SECRET) {
//     const authProvider = new cassandra.auth.PlainTextAuthProvider(ASTRA_CLIENT_ID, ASTRA_CLIENT_SECRET);
//     return new cassandra.Client({ cloud, authProvider, keyspace: KEYSPACE });
//   }

//   throw new Error("No valid Astra auth provided (ASTRA_DB_APPLICATION_TOKEN or ASTRA_CLIENT_ID/ASTRA_CLIENT_SECRET)");
// }

// const runningInAstra = Boolean(ASTRA_SECURE_BUNDLE);
// if (runningInAstra) {
//   console.log("🔐 Using Astra auth (secure bundle + token/clientId).");
//   try {
//     client = createAstraClient();
//   } catch (e) {
//     console.error("Astra client creation error:", e.message);
//     process.exit(1);
//   }
// } else {
//   console.log("⚡ Running in LOCAL Cassandra mode.");
//   client = createLocalClient();
// }

// // ---------- connect with retry ----------
// async function connectDBWithRetry(retries = 0) {
//   try {
//     await client.connect();
//     console.log(`✅ Connected to Cassandra (keyspace=${KEYSPACE})`);
//   } catch (err) {
//     console.error(`❌ Cassandra connection attempt ${retries + 1} failed:`, err.message || err);
//     if (retries + 1 >= MAX_RETRIES) {
//       console.error("Exceeded max connection retries. Exiting.");
//       console.error("Fatal DB connect error:", err);
//       process.exit(1);
//     }
//     await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
//     return connectDBWithRetry(retries + 1);
//   }
// }
// connectDBWithRetry().catch((e) => {
//   console.error("ConnectDB unexpected error:", e);
//   process.exit(1);
// });

// // ---------- utils ----------
// function validateEmail(email) {
//   const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//   return regex.test(email);
// }
// function validatePassword(password) {
//   return password && password.length >= 4;
// }
// function validateName(name) {
//   const trimmed = (name || "").trim();
//   return trimmed.length >= 2 && trimmed.length <= 20 && /^[a-zA-Z\s\-']+$/.test(trimmed);
// }

// // ---------- routes ----------
// // Debug route
// app.get("/debug/pingdb", async (req, res) => {
//   try {
//     // lightweight query to check connection
//     const result = await client.execute("SELECT now() FROM system.local", [], { prepare: true });
//     res.json({ success: true, keyspace: KEYSPACE, rows: result.rowLength });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message || err });
//   }
// });

// // Signup
// app.post("/auth/signup", async (req, res) => {
//   const { email, password, name } = req.body;
//   if (!email || !password || !name) return res.status(400).json({ error: "Email, password, and name required" });
//   if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email format" });
//   if (!validatePassword(password)) return res.status(400).json({ error: "Password must be at least 4 characters" });
//   if (!validateName(name)) return res.status(400).json({ error: "Name must be 2-20 chars (letters/spaces/-/')" });

//   try {
//     const existing = await client.execute("SELECT email FROM users WHERE email = ?", [email], { prepare: true });
//     if (existing.rowLength > 0) {
//       return res.status(409).json({ error: "User already exists" });
//     }

//     const created_at = new Date();
//     await client.execute(
//       "INSERT INTO users (email, password, name, created_at) VALUES (?, ?, ?, ?)",
//       [email, password, name.trim(), created_at],
//       { prepare: true }
//     );

//     console.log(`👤 New user registered: ${email}`);
//     const token = Buffer.from(JSON.stringify({ email, name: name.trim() })).toString("base64");
//     return res.json({ success: true, message: "Signup successful", token, email, name: name.trim() });
//   } catch (err) {
//     console.error("Signup Error:", err);
//     return res.status(500).json({ error: "Signup failed", details: (err && err.message) || err });
//   }
// });

// // Login
// app.post("/auth/login", async (req, res) => {
//   const { email, password } = req.body;
//   if (!email || !password) return res.status(400).json({ error: "Email and password required" });
//   if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email format" });

//   try {
//     const result = await client.execute("SELECT password, name FROM users WHERE email = ?", [email], { prepare: true });
//     if (result.rowLength === 0) return res.status(401).json({ error: "Invalid email or password" });

//     const row = result.rows[0];
//     if (row.password !== password) return res.status(401).json({ error: "Invalid email or password" });

//     const name = row.name || "Player";
//     const token = Buffer.from(JSON.stringify({ email, name })).toString("base64");
//     console.log(`✅ User logged in: ${email}`);
//     return res.json({ success: true, message: "Login successful", token, email, name });
//   } catch (err) {
//     console.error("Login Error:", err);
//     return res.status(500).json({ error: "Login failed", details: (err && err.message) || err });
//   }
// });

// // Submit score
// app.post("/scores", async (req, res) => {
//   const { token, score, level = 1, mode = "classic" } = req.body;
//   if (!token || typeof score !== "number") return res.status(400).json({ error: "Missing token or valid score" });

//   let user;
//   try {
//     user = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
//   } catch {
//     return res.status(400).json({ error: "Invalid token" });
//   }

//   const levelInt = parseInt(level) || 1;
//   try {
//     // fetch top scores for the level to determine existing best by this user
//     // NOTE: scores table partition key is (level, created_at, id) in your schema,
//     // So we query by level (valid). We cannot reliably query by email without schema change.
//     const levelRows = await client.execute("SELECT id, email, score FROM scores WHERE level = ?", [levelInt], { prepare: true });

//     // if user already has scores for this level, compare best
//     const userRows = levelRows.rows.filter((r) => r.email === user.email);
//     if (userRows.length > 0) {
//       const bestExistingScore = Math.max(...userRows.map((r) => r.score || 0));
//       if (score <= bestExistingScore) {
//         console.log(`📊 Score NOT updated: ${user.name} - Level ${levelInt} - Score ${score} (Best: ${bestExistingScore})`);
//         return res.json({ success: true, message: "Score not better than best", updated: false, bestScore: bestExistingScore });
//       }

//       // delete all older rows for this user+level (costly but matches your previous intent)
//       // Note: delete requires exact primary key. Using allowFiltering isn't available in driver execute options,
//       // so build deletes by id for rows we found for this user
//       for (const r of userRows) {
//         await client.execute("DELETE FROM scores WHERE level = ? AND created_at = ? AND id = ?", [levelInt, r.created_at || null, r.id || null], { prepare: true }).catch(() => {});
//       }
//     }

//     // insert new best score
//     const id = uuidv4();
//     const created_at = new Date();
//     await client.execute(
//       "INSERT INTO scores (level, created_at, id, email, name, score, mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
//       [levelInt, created_at, id, user.email, user.name, score, mode],
//       { prepare: true }
//     );

//     console.log(`📊 Score submitted: ${user.name} - Level ${levelInt} - Score ${score}`);
//     return res.json({ success: true, message: "Score submitted", id, updated: true });
//   } catch (err) {
//     console.error("Score Submit Error:", err);
//     return res.status(500).json({ error: "Score submit failed", details: (err && err.message) || err });
//   }
// });

// // Get top scores by level
// app.get("/scores/top", async (req, res) => {
//   try {
//     const level = parseInt(req.query.level) || 1;
//     const result = await client.execute("SELECT id, email, name, score, level, mode, created_at FROM scores WHERE level = ?", [level], { prepare: true });

//     const arr = result.rows
//       .sort((a, b) => {
//         if (b.score !== a.score) return b.score - a.score;
//         return new Date(b.created_at) - new Date(a.created_at);
//       })
//       .slice(0, 20)
//       .map((item, index) => ({ ...item, rank: index + 1 }));

//     console.log(`📊 Fetched top ${arr.length} scores for level ${level}`);
//     res.json({ success: true, level, count: arr.length, data: arr });
//   } catch (err) {
//     console.error("Get Scores Error:", err);
//     res.status(500).json({ error: "Cannot fetch scores", details: (err && err.message) || err });
//   }
// });

// // server start
// const PORT = process.env.PORT || 3001;
// app.listen(PORT, "0.0.0.0", () => {
//   console.log(`🚀 Backend listening on http://0.0.0.0:${PORT}`);
// });


// index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const {
  insertDocument,
  listDocuments,
  deleteByWhere,
  BASE
} = require('./astraApi');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
console.log('🔐 Using Astra Data API base:', BASE);

// ----------------------------
// validation helpers
// ----------------------------
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}
function validatePassword(password) {
  return password && password.length >= 4;
}
function validateName(name) {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 20 && /^[a-zA-Z\s\-']+$/.test(trimmed);
}

// ----------------------------
// AUTH — SIGNUP
// ----------------------------
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    if (!validateName(name)) {
      return res.status(400).json({ error: 'Name must be 2-20 characters (letters, spaces, hyphens, apostrophes only)' });
    }

    // Check if user exists in 'users' collection
    const existing = await listDocuments('users', { where: { email } }).catch(err => {
      // if API doesn't support 'where' it may return all; check accordingly
      if (err.response && err.response.data) {
        console.error('Signup listDocuments error:', err.response.data);
      } else {
        console.error('Signup listDocuments error:', err.message || err);
      }
      throw err;
    });

    // existing._embedded ? Astra v2 responses wrap data differently; handle both forms
    const docs = (existing && (existing.data || existing || existing.documents)) || existing;

    // Many Astra responses return { data: [...]} or raw array. Normalize:
    let rows = [];
    if (Array.isArray(docs)) rows = docs;
    else if (docs && Array.isArray(docs.data)) rows = docs.data;
    else if (docs && Array.isArray(docs.documents)) rows = docs.documents;
    else if (existing && existing._embedded && existing._embedded.documents) rows = existing._embedded.documents;

    if (rows && rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Insert new user document
    const created_at = new Date().toISOString();
    const userDoc = { email, password, name: name.trim(), created_at };

    await insertDocument('users', userDoc);

    console.log(`👤 New user registered: ${email}`);

    const token = Buffer.from(JSON.stringify({ email, name: name.trim() })).toString('base64');

    res.json({
      success: true,
      message: 'Signup successful',
      token,
      email,
      name: name.trim()
    });
  } catch (err) {
    console.error('Signup Error:', err.response ? err.response.data || err.response.statusText : (err.message || err));
    res.status(500).json({ error: 'Signup failed', detail: (err.response && err.response.data) ? err.response.data : undefined });
  }
});

// ----------------------------
// AUTH — LOGIN
// ----------------------------
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // find user doc
    const existing = await listDocuments('users', { where: { email } });
    let rows = [];
    if (Array.isArray(existing)) rows = existing;
    else if (existing && Array.isArray(existing.data)) rows = existing.data;
    else if (existing && existing._embedded && Array.isArray(existing._embedded.documents)) rows = existing._embedded.documents;

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    if (user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const name = user.name || 'Player';
    const token = Buffer.from(JSON.stringify({ email, name })).toString('base64');

    console.log(`✅ User logged in: ${email}`);

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      email,
      name
    });
  } catch (err) {
    console.error('Login Error:', err.response ? err.response.data || err.response.statusText : (err.message || err));
    res.status(500).json({ error: 'Login failed' });
  }
});

// ----------------------------
// SUBMIT SCORE
// ----------------------------
app.post('/scores', async (req, res) => {
  try {
    const { token, score, level = 1, mode = 'classic' } = req.body;
    if (!token || typeof score !== 'number') {
      return res.status(400).json({ error: 'Missing token or valid score' });
    }

    let user;
    try {
      user = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid token' });
    }
    const levelInt = parseInt(level) || 1;

    // find existing scores for this user + level
    const existingResp = await listDocuments('scores', { where: { email: user.email, level: levelInt }, pageSize: 500 }).catch(err => {
      // log but continue
      console.error('listDocuments scores error:', err.response ? err.response.data : err.message);
      return null;
    });

    let existingRows = [];
    if (existingResp) {
      if (Array.isArray(existingResp)) existingRows = existingResp;
      else if (existingResp.data && Array.isArray(existingResp.data)) existingRows = existingResp.data;
      else if (existingResp._embedded && Array.isArray(existingResp._embedded.documents)) existingRows = existingResp._embedded.documents;
    }

    if (existingRows.length > 0) {
      const bestExisting = Math.max(...existingRows.map(r => r.score || 0));
      if (score <= bestExisting) {
        console.log(`📊 Score NOT updated: ${user.name} - Level ${levelInt} - Score ${score} (Best: ${bestExisting})`);
        return res.json({ success: true, message: 'Score not better than best', updated: false, bestScore: bestExisting });
      }

      // delete old user scores for this level (optional)
      try {
        // try to remove previous docs via deleteByWhere if supported
        await deleteByWhere('scores', { email: user.email, level: levelInt });
      } catch (e) {
        // ignore if not supported by API
        console.warn('deleteByWhere not supported or failed (safe to ignore):', (e.response && e.response.data) ? e.response.data : e.message);
      }
      console.log(`🔄 Updating best score for ${user.email} level ${levelInt}`);
    }

    const id = uuidv4();
    const created_at = new Date().toISOString();
    const doc = { level: levelInt, created_at, id, email: user.email, name: user.name, score, mode };

    await insertDocument('scores', doc);

    console.log(`📊 Score submitted: ${user.name} - Level ${levelInt} - Score ${score}`);

    res.json({ success: true, message: 'Score submitted', id, updated: true });
  } catch (err) {
    console.error('Score Submit Error:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: 'Score submit failed' });
  }
});

// ----------------------------
// GET TOP SCORES (by level)
// ----------------------------
app.get('/scores/top', async (req, res) => {
  try {
    const level = parseInt(req.query.level) || 1;

    // fetch scores for the level (page size large enough for your needs)
    const results = await listDocuments('scores', { where: { level }, pageSize: 500 }).catch(err => {
      console.error('listDocuments top scores error:', err.response ? err.response.data : err.message);
      throw err;
    });

    // normalize
    let rows = [];
    if (Array.isArray(results)) rows = results;
    else if (results && Array.isArray(results.data)) rows = results.data;
    else if (results && results._embedded && Array.isArray(results._embedded.documents)) rows = results._embedded.documents;

    // sort by score desc and created_at desc
    rows.sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const top = rows.slice(0, 20).map((r, i) => ({ ...r, rank: i + 1 }));

    console.log(`📊 Fetched top ${top.length} scores for level ${level}`);

    res.json({ success: true, level, count: top.length, data: top });
  } catch (err) {
    console.error('Get Scores Error:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: 'Cannot fetch scores' });
  }
});

// health
app.get('/health', (req, res) => res.json({ ok: true }));

// ----------------------------
// START SERVER
// ----------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend listening on http://0.0.0.0:${PORT}`);
});
