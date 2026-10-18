// Deploy: 2026-08-16 18:59:33
require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const compression= require('compression');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const authRoutes   = require('./routes/auth');
const dataRoutes   = require('./routes/data');
const { router: backupRoutes } = require('./routes/backup');
const { startBackupCron } = require('./cron/backup');
const { bumpAll } = require('./lib/versions');

const app  = express();
const PORT = process.env.PORT || 3000;

// Never let one bad request / dropped DB socket kill the whole ERP.
process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
process.on('uncaughtException',  (e) => console.error('[uncaughtException]', e));

// Behind Render's proxy the socket address is the PROXY, not the user.
app.set('trust proxy', true);
app.disable('x-powered-by');

// Real client IP for rate limiting. Without this every user shared a single
// bucket (so 20 logins/15 min and 300 requests/min were shared by the WHOLE company).
const clientKey = (req) =>
  req.headers['cf-connecting-ip'] ||
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.ip;

// ─── Security & Performance Middleware ───────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // allow inline scripts in our HTML
}));
app.use(compression());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' })); // 10MB for base64 logos

// Rate limiting — brute force protection on login. Only FAILED attempts count,
// so 15 employees logging in at 8 AM from one office can never lock each other out.
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  keyGenerator: clientKey,
  validate: false,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes' }
}));

// General API rate limit (an office shares one public IP, so keep it generous)
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 1200,
  keyGenerator: clientKey,
  validate: false,
}));

// ─── API Routes ──────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/data',   dataRoutes);
app.use('/api/backup', backupRoutes);

// ─── Admin: Full Reset (wipes ALL data from MongoDB) ─────────────
app.post('/api/admin/reset-all', async (req, res) => {
  try {
    // Must be authenticated as admin
    const jwt = require('jsonwebtoken');
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Non authentifié' });

    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Token invalide' }); }

    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admins uniquement' });

    // Require confirmation phrase
    if (req.body.confirm !== 'RESET_TOUT') {
      return res.status(400).json({ error: 'Phrase de confirmation incorrecte' });
    }

    // Verify admin password against stored user
    const Document = require('./models/Document');
    const Settings = require('./models/Settings');
    const Counter  = require('./models/Counter');
    const bcrypt   = require('bcryptjs');

    const password = req.body.password;
    if (!password) return res.status(400).json({ error: 'Mot de passe requis' });

    const adminDoc = await Document.findOne({ col: 'users', 'data.username': decoded.username });
    if (!adminDoc) return res.status(404).json({ error: 'Utilisateur admin introuvable' });

    const storedPw = adminDoc.data.password;
    let pwOk = false;
    if (storedPw?.startsWith('$2')) {
      pwOk = await bcrypt.compare(password, storedPw);
    } else {
      pwOk = (password === storedPw);
    }
    if (!pwOk) return res.status(403).json({ error: 'Mot de passe incorrect' });

    // ── SAFETY NET: take a full backup BEFORE wiping. If it fails, do NOT wipe. ──
    try {
      const { createBackup } = require('./routes/backup');
      await createBackup(`Avant réinitialisation totale — ${new Date().toLocaleString('fr-FR')}`, 'manual', decoded.name || decoded.username);
    } catch (e) {
      console.error('[RESET] Safety backup failed — reset aborted:', e.message);
      return res.status(500).json({ error: 'Sauvegarde de sécurité impossible, réinitialisation annulée : ' + e.message });
    }

    // ── WIPE DATA (backups are intentionally KEPT so the reset can be undone) ──
    await Document.deleteMany({});
    await Settings.deleteMany({});
    await Counter.deleteMany({});

    // Reseed default admin (password hashed — never stored in clear text)
    await Document.create({
      col: 'users',
      data: {
        id: 1,
        name: 'Administrateur',
        username: 'admin',
        password: await bcrypt.hash('admin123', 10),
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    });
    bumpAll();

    console.log('[RESET] All data wiped and admin reseeded by:', decoded.username);
    res.json({ success: true, message: 'Base de données réinitialisée (une sauvegarde de sécurité a été conservée). Admin: admin / admin123' });

  } catch (e) {
    console.error('[RESET] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time:   new Date().toISOString(),
    db:     mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ─── Reset: Clear localStorage & Force Resync from MongoDB ──────
app.get('/reset', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Reset</title></head><body>
    <script>
      localStorage.clear();
      sessionStorage.clear();
      alert('✅ Cache vidé ! L\\'application va recharger les données depuis MongoDB.');
      window.location.href = '/';
    </script>
  </body></html>`);
});

// ─── Serve Frontend ──────────────────────────────────────────────
// SECURITY: this used to serve the ENTIRE project folder, so
//   https://<site>/routes/auth.js, /server.js, /package.json, /seed_v2.js …
// were publicly downloadable (source code, secrets, logic). Only the
// browser-side files below are public now.
const PUBLIC_ROOT_FILES = new Set([
  'index.html', 'style.css', 'all.min.css',
  'api.js', 'core.js', 'modules.js', 'pdf.js',
]);
const staticHandler = express.static(path.join(__dirname, '.'), {
  index: 'index.html',
  dotfiles: 'deny',
  setHeaders(res, filePath) {
    // No cache for JS/CSS — always check for updates
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
});
app.use((req, res, next) => {
  let p;
  try { p = decodeURIComponent(req.path); } catch { return next(); }
  if (p.includes('..') || p.includes('\\')) return next();
  const allowed = p === '/' || PUBLIC_ROOT_FILES.has(p.slice(1)) || p.startsWith('/webfonts/');
  return allowed ? staticHandler(req, res, next) : next(); // not public → SPA shell below
});

// Catch-all: serve index.html for any unknown route (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function warnIfDefaultAdminPassword() {
  const bcrypt = require('bcryptjs');
  const Document = require('./models/Document');
  try {
    const admin = await Document.findOne({ col: 'users', 'data.username': 'admin' });
    if (admin && admin.data && admin.data.password) {
      const isMatch = await bcrypt.compare('admin123', admin.data.password);
      if (isMatch) {
        console.log('⚠️ ATTENTION: Le mot de passe admin par défaut est toujours "admin123" — CHANGEZ-LE IMMÉDIATEMENT!');
      }
    }
  } catch (e) {
    // Ignore error
  }
}

// ─── Connect to MongoDB & Start Server ──────────────────────────
async function start() {
  try {
    console.log('🔌 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('✅ MongoDB connecté');

    // Seed admin user if no users exist
    await seedAdminIfNeeded();
    await warnIfDefaultAdminPassword();

    // Start daily backup cron
    startBackupCron();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
    });
    // Render's proxy keeps sockets open ~60s; Node's default (5s) causes sporadic 502s.
    server.keepAliveTimeout = 65 * 1000;
    server.headersTimeout   = 66 * 1000;

    mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB déconnecté (reconnexion automatique)…'));
    mongoose.connection.on('reconnected',  () => console.log('✅ MongoDB reconnecté'));
  } catch (e) {
    console.error('❌ Impossible de démarrer:', e.message);
    process.exit(1);
  }
}

// ─── Seed initial admin user ──────────────────────────────────────
async function seedAdminIfNeeded() {
  const Document = require('./models/Document');
  const bcrypt   = require('bcryptjs');

  const count = await Document.countDocuments({ col: 'users' });
  if (count === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await Document.create({
      col: 'users',
      data: {
        id: 1,
        name: 'Administrateur',
        username: 'admin',
        password: hash,
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
      }
    });
    console.log('👤 Utilisateur admin créé (admin / admin123) — CHANGEZ LE MOT DE PASSE!');
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('🔄 Arrêt gracieux...');
  await mongoose.connection.close();
  process.exit(0);
});

start();
