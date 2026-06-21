const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme123';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signups (
      id        SERIAL PRIMARY KEY,
      email     TEXT UNIQUE NOT NULL,
      name      TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      ip        TEXT
    )
  `);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/signup', async (req, res) => {
  const { email, name } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const cleanEmail = email.toLowerCase().trim();
  const cleanName = name ? name.trim().slice(0, 100) : null;

  try {
    await pool.query(
      'INSERT INTO signups (email, name, ip) VALUES ($1, $2, $3)',
      [cleanEmail, cleanName, ip]
    );
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM signups');
    res.json({ success: true, already: false, count: parseInt(rows[0].count) });
  } catch (err) {
    if (err.code === '23505') {
      const { rows } = await pool.query('SELECT COUNT(*) AS count FROM signups');
      return res.json({ success: true, already: true, count: parseInt(rows[0].count) });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.get('/api/count', async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM signups');
  res.json({ count: parseInt(rows[0].count) });
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

app.get('/api/signups', requireBasicAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, created_at FROM signups ORDER BY created_at DESC'
  );
  res.json({ count: rows.length, signups: rows });
});

app.get('/admin', requireBasicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  Waitlist server running → http://localhost:${PORT}`);
      console.log(`  Admin panel          → http://localhost:${PORT}/admin`);
      console.log(`  Admin credentials    → ${ADMIN_USER} / ${ADMIN_PASS}`);
      console.log(`  Override with env:   ADMIN_USER=... ADMIN_PASS=... node server.js\n`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  });
