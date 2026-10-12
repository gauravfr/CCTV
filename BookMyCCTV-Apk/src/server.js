'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
require('dotenv').config({ quiet: true });

const camerasModule = require('./routes/cameras');
const streamRoutes = require('./routes/streams');
const deviceRoutes = require('./routes/devices');
const { resolveExecutables } = require('./services/executableService');
const app = express();
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const username = process.env.DASHBOARD_USERNAME;
const plainPassword = process.env.DASHBOARD_PASSWORD;
const passwordHash = process.env.DASHBOARD_PASSWORD_HASH;
const sessionSecret = process.env.SESSION_SECRET;

if (!username || (!plainPassword && !passwordHash) || !sessionSecret) {
  console.error('DASHBOARD_USERNAME, DASHBOARD_PASSWORD (or DASHBOARD_PASSWORD_HASH), and SESSION_SECRET are required.');
  process.exit(1);
}
if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
  console.error('Built React frontend not found at frontend/dist/index.html. Run "npm run build" before starting the dashboard.');
  process.exit(1);
}
if (isProduction && (plainPassword === 'CHANGE_ME_NOW' || sessionSecret.length < 32)) {
  console.error('Production requires a strong dashboard password and SESSION_SECRET of at least 32 characters.');
  process.exit(1);
}

const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');
fs.mkdirSync(sessionsDir, { recursive: true });
const sessionDb = new Database(path.join(sessionsDir, 'sessions.db'));
sessionDb.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL)');
class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = sessionDb.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires_at < Date.now()) { if (row) this.destroy(sid, () => {}); return callback(null, null); }
      callback(null, JSON.parse(row.data));
    } catch (error) { callback(error); }
  }
  set(sid, value, callback = () => {}) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 60 * 60_000;
      sessionDb.prepare('INSERT INTO sessions(sid,data,expires_at) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at').run(sid, JSON.stringify(value), expires);
      callback();
    } catch (error) { callback(error); }
  }
  destroy(sid, callback = () => {}) { try { sessionDb.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); callback(); } catch (error) { callback(error); } }
  touch(sid, value, callback = () => {}) { this.set(sid, value, callback); }
}

if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'],
  mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'self'"]
} } }));
app.use(express.json({ limit: '32kb' }));
app.use(session({ name: 'cctv.sid', secret: sessionSecret, store: new SQLiteSessionStore(), resave: false,
  saveUninitialized: false, rolling: true, cookie: { httpOnly: true, sameSite: 'strict', secure: isProduction, maxAge: 8 * 60 * 60_000 } }));

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' } });
const apiLimiter = rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.' } });
const cameraTestLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many camera tests. Wait a moment and try again.' } });

function requireAuth(req, res, next) { if (req.session?.authenticated === true) return next(); res.status(401).json({ error: 'Authentication required' }); }
function sameOrigin(req, res, next) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try { if (new URL(origin).host === req.get('host')) return next(); } catch {}
  res.status(403).json({ error: 'Request origin is not allowed' });
}
async function passwordMatches(candidate) {
  if (passwordHash) return bcrypt.compare(candidate, passwordHash);
  const left = crypto.createHash('sha256').update(String(candidate)).digest();
  const right = crypto.createHash('sha256').update(String(plainPassword)).digest();
  return crypto.timingSafeEqual(left, right);
}

app.get('/api/auth/session', (req, res) => res.json({ authenticated: req.session?.authenticated === true, username: req.session?.authenticated ? username : null }));
app.post('/api/auth/login', loginLimiter, sameOrigin, async (req, res) => {
  const valid = String(req.body?.username || '') === username && await passwordMatches(String(req.body?.password || ''));
  if (!valid) return res.status(401).json({ error: 'Incorrect username or password' });
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Login could not be completed' });
    req.session.authenticated = true;
    req.session.save((saveError) => saveError ? res.status(500).json({ error: 'Login could not be completed' }) : res.json({ authenticated: true, username }));
  });
});
app.post('/api/auth/logout', sameOrigin, (req, res) => req.session.destroy(() => { res.clearCookie('cctv.sid'); res.sendStatus(204); }));
app.use('/api', apiLimiter, sameOrigin);
app.post('/api/cameras/test', requireAuth, cameraTestLimiter);
app.use('/api/cameras', requireAuth, camerasModule.router);
app.use('/api/devices', requireAuth, deviceRoutes);
app.use('/stream', requireAuth, streamRoutes);
app.use(express.static(frontendDist, {
  extensions: ['html'], etag: true, maxAge: 0,
  setHeaders: (res, filePath) => {
    if (/\.(?:html|css|js)$/.test(filePath)) res.set('Cache-Control', 'no-store');
  }
}));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/stream/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});
app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  const safe = status < 500 ? error.message : 'The request could not be completed';
  res.status(status).json({ error: safe, code: error.code || null, field: error.field || null });
});

let server = null;

async function startServer() {
  const executables = await resolveExecutables();
  if (executables.ffmpeg.ready) console.log('FFmpeg: Ready');
  else console.error(`FFmpeg: Not Ready — ${executables.ffmpeg.reason}`);
  if (executables.ffprobe.ready) console.log('FFprobe: Ready');
  else console.error(`FFprobe: Not Ready — ${executables.ffprobe.reason}`);
  if (!executables.ffmpeg.ready || !executables.ffprobe.ready) {
    console.error('CCTV Dashboard startup stopped because the streaming tools are unavailable.');
    process.exitCode = 1;
    sessionDb.close();
    return;
  }
  server = app.listen(port, '0.0.0.0', () => {
    console.log(`CCTV Dashboard is ready at http://localhost:${port}`);
    camerasModule.restoreSaved();
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') console.error(`CCTV Dashboard could not start: port ${port} is already in use.`);
    else console.error(`CCTV Dashboard server error: ${error.message}`);
    process.exitCode = 1;
  });
}
function shutdown() {
  for (const camera of camerasModule.cameras.values()) require('./services/streamService').stop(camera.id);
  if (!server) { sessionDb.close(); process.exit(0); return; }
  server.close(() => { sessionDb.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
startServer().catch((error) => {
  console.error(`CCTV Dashboard startup failed: ${error.message}`);
  process.exit(1);
});


