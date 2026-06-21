const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme123';

const db = new Database(path.join(__dirname, 'waitlist.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip TEXT
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/signup', (req, res) => {
  const { email, name } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const cleanEmail = email.toLowerCase().trim();
  const cleanName = name ? name.trim().slice(0, 100) : null;

  try {
    db.prepare('INSERT INTO signups (email, name, ip) VALUES (?, ?, ?)').run(cleanEmail, cleanName, ip);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM signups').get();
    res.json({ success: true, already: false, count });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      const { count } = db.prepare('SELECT COUNT(*) AS count FROM signups').get();
      return res.json({ success: true, already: true, count });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.get('/api/count', (req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM signups').get();
  res.json({ count });
});

function requireBasicAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Waitlist Admin"');
    return res.status(401).send('Login required.');
  }
  const [user, pass] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Waitlist Admin"');
  return res.status(401).send('Invalid credentials.');
}

app.get('/api/signups', requireBasicAuth, (req, res) => {
  const signups = db
    .prepare('SELECT id, email, name, created_at FROM signups ORDER BY created_at DESC')
    .all();
  res.json({ count: signups.length, signups });
});

app.get('/admin', requireBasicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Waitlist server running → http://localhost:${PORT}`);
  console.log(`  Admin panel          → http://localhost:${PORT}/admin`);
  console.log(`  Admin credentials    → ${ADMIN_USER} / ${ADMIN_PASS}`);
  console.log(`  Override with env:   ADMIN_USER=... ADMIN_PASS=... node server.js\n`);
});
