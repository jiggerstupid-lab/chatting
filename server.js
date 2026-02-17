const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.FLY_APP_NAME
  ? '/data/db.json'
  : path.join(__dirname, 'db.json');
const MAX_MESSAGES = 200;

// ── Database helpers ──────────────────────────────────────────────────────────

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { messages: [], users: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { messages: [], users: {} };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getDB() {
  return readDB();
}

function addMessage(msg) {
  const db = readDB();
  db.messages.push(msg);
  if (db.messages.length > MAX_MESSAGES) {
    db.messages = db.messages.slice(-MAX_MESSAGES);
  }
  writeDB(db);
  return db;
}

// ── SSE client registry ───────────────────────────────────────────────────────

const clients = new Set();

function broadcast(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-User-Token']
}));
app.use(express.json({ limit: '10kb' }));

// ── Rate limiting (simple in-memory) ─────────────────────────────────────────

const rateLimits = new Map(); // token -> { count, resetAt }

function checkRateLimit(token) {
  const now = Date.now();
  const limit = rateLimits.get(token);
  if (!limit || now > limit.resetAt) {
    rateLimits.set(token, { count: 1, resetAt: now + 5000 });
    return true;
  }
  if (limit.count >= 3) return false; // max 3 messages per 5s
  limit.count++;
  return true;
}

// Clean up old rate limit entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimits) {
    if (now > val.resetAt) rateLimits.delete(key);
  }
}, 60_000);

// ── Sanitize ──────────────────────────────────────────────────────────────────

function sanitize(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, maxLen)
    .trim();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Register / refresh a username
app.post('/api/register', (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username required' });
  }
  const clean = sanitize(username, 24).replace(/\s+/g, '_');
  if (!clean || clean.length < 1) return res.status(400).json({ error: 'Invalid username' });

  const token = crypto.randomBytes(16).toString('hex');
  const db = readDB();
  db.users[token] = { username: clean, joinedAt: Date.now() };
  writeDB(db);

  res.json({ token, username: clean });
});

// Get recent messages
app.get('/api/messages', (req, res) => {
  const db = getDB();
  res.json({ messages: db.messages });
});

// Post a message
app.post('/api/messages', (req, res) => {
  const token = req.headers['x-user-token'];
  const db = readDB();

  if (!token || !db.users[token]) {
    return res.status(401).json({ error: 'Invalid token. Please register.' });
  }
  if (!checkRateLimit(token)) {
    return res.status(429).json({ error: 'Slow down! Max 3 messages per 5 seconds.' });
  }

  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Message text required' });
  }

  const msg = {
    id: crypto.randomBytes(8).toString('hex'),
    username: db.users[token].username,
    text: sanitize(text),
    timestamp: Date.now(),
  };

  addMessage(msg);
  broadcast('message', msg);

  res.json({ ok: true, message: msg });
});

// SSE stream for real-time updates
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send a heartbeat every 20s so the connection doesn't drop
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 20_000);

  // Send connected event with recent messages
  const db = getDB();
  const recentMessages = db.messages.slice(-50);
  res.write(`event: connected\ndata: ${JSON.stringify({ messages: recentMessages })}\n\n`);

  clients.add(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

// Active user count
app.get('/api/stats', (req, res) => {
  res.json({ onlineCount: clients.size });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐 GlobalChat server running on http://0.0.0.0:${PORT}`);
  console.log(`   SSE stream: http://0.0.0.0:${PORT}/api/stream`);
  console.log(`   Messages:   http://0.0.0.0:${PORT}/api/messages`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});
