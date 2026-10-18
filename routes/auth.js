const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const Document = require('../models/Document');
const { invalidateUser } = require('../middleware/auth');

const router = express.Router();
const JWT_EXPIRY = '12h';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

// ─── POST /api/auth/login ───────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Identifiants manquants' });

    // Find user document
    const doc = await Document.findOne({ col: 'users', 'data.username': username.toLowerCase().trim() });
    if (!doc) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

    const user = doc.data;
    // Admin can NEVER be locked out — only non-admin users can be deactivated
    if (user.active === false && user.role !== 'admin') {
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    // Compare password (supports both bcrypt and legacy plain-text for migration)
    let passwordOk = false;
    if (user.password?.startsWith('$2')) {
      passwordOk = await bcrypt.compare(password, user.password);
    } else {
      passwordOk = (password === user.password); // legacy plain-text
      // Upgrade to bcrypt on successful login
      if (passwordOk) {
        const hash = await bcrypt.hash(password, 10);
        await Document.updateOne({ _id: doc._id }, { $set: { 'data.password': hash } });
      }
    }

    if (!passwordOk) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

    // Generate unique session identifier for single-session enforcement
    const sessionId = 'sess_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
    await Document.updateOne(
      { _id: doc._id },
      { $set: { 'data.currentSessionId': sessionId, 'data.lastLoginAt': new Date().toISOString(), updatedAt: new Date() } }
    );
    invalidateUser(user.username); // the previous session must be rejected immediately

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role, supplierId: user.supplierId || null, sessionId },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Warn the client when the account still uses the factory password
    const weakPassword = password === DEFAULT_ADMIN_PASSWORD;

    res.json({
      token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role, supplierId: user.supplierId || null, sessionId },
      weakPassword,
    });

    // Opportunistic safety net: Render's free tier sleeps, so the nightly cron
    // may never fire. An admin login triggers a backup if the last one is >24h old.
    if (user.role === 'admin') {
      try { require('../cron/backup').maybeDailyBackup().catch(() => {}); } catch (_) { /* ignore */ }
    }
  } catch (e) {
    console.error('[AUTH/login]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/auth/refresh ─────────────────────────────────────
router.post('/refresh', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    const age = Date.now()/1000 - decoded.iat;
    if (age > 86400) return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
    const newToken = jwt.sign(
      // keep sessionId and supplierId so single-session enforcement and supplier portal isolation still apply to refreshed tokens
      { id: decoded.id, username: decoded.username, name: decoded.name, role: decoded.role, supplierId: decoded.supplierId || null, sessionId: decoded.sessionId },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    res.json({ token: newToken });
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// ─── POST /api/auth/logout ──────────────────────────────────────
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.json({ ok: true });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    if (decoded?.id) {
      invalidateUser(decoded.username);
      await Document.findOneAndUpdate(
        { col: 'users', 'data.id': decoded.id },
        { $unset: { 'data.currentSessionId': '' } }
      );
    }
  } catch (_) { /* token already invalid */ }
  res.json({ ok: true });
});

// ─── POST /api/auth/recover-admin  (emergency admin recovery) ───
// SECURITY: this endpoint used to accept a secret hard-coded in the source,
// and the source was publicly downloadable → anyone could take over the admin.
// It is now DISABLED unless ADMIN_RECOVERY_SECRET (>= 16 chars) is set in the
// server environment, and it generates a random password instead of "admin123".
router.post('/recover-admin', async (req, res) => {
  try {
    const expected = process.env.ADMIN_RECOVERY_SECRET || '';
    if (expected.length < 16) return res.status(404).json({ error: 'Non trouvé' });

    const given = Buffer.from(String(req.body?.secret || ''));
    const want  = Buffer.from(expected);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
      return res.status(403).json({ error: 'Phrase incorrecte' });
    }

    const newPassword = crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, 'x');
    const hash = await bcrypt.hash(newPassword, 10);
    const existing = await Document.findOne({ col: 'users', 'data.role': 'admin' });

    if (existing) {
      await Document.updateMany(
        { col: 'users', 'data.role': 'admin' },
        { $set: { 'data.active': true, 'data.password': hash, updatedAt: new Date() }, $unset: { 'data.currentSessionId': '' } }
      );
      invalidateUser(existing.data.username);
      return res.json({ success: true, action: 'unlocked', username: existing.data.username, newPassword,
        message: 'Admin débloqué. Notez ce mot de passe maintenant, il ne sera plus affiché.' });
    }

    await Document.create({
      col: 'users',
      data: {
        id: 1, name: 'Administrateur', username: 'admin', password: hash,
        role: 'admin', active: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }
    });
    return res.json({ success: true, action: 'created', username: 'admin', newPassword,
      message: 'Admin créé. Notez ce mot de passe maintenant, il ne sera plus affiché.' });
  } catch (e) {
    console.error('[recover-admin]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
