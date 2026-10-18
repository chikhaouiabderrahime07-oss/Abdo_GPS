const express  = require('express');
const bcrypt   = require('bcryptjs');
const Document = require('../models/Document');
const Settings = require('../models/Settings');
const Counter  = require('../models/Counter');
const auth     = require('../middleware/auth');
const { bump, snapshot } = require('../lib/versions');

const router = express.Router();
router.use(auth); // ALL data routes require authentication

// ─── Helpers ──────────────────────────────────────────────────────
const SECRET_USER_FIELDS = ['password', 'currentSessionId'];

/** Remove secrets from a users document before it leaves the server. */
function publicData(col, data) {
  if (col !== 'users' || !data) return data;
  const safe = { ...data };
  SECRET_USER_FIELDS.forEach(f => delete safe[f]);
  return safe;
}

/** The `users` collection (accounts, roles, passwords) is administrator-only for writes. */
function adminOnlyForUsers(req, res, next) {
  if (req.params.col === 'users' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admins uniquement' });
  }
  next();
}

/** Suppliers can only write to collections relevant to their portal. */
async function supplierWriteGuard(req, res, next) {
  const isSupplier = req.user?.role === 'supplier' || req.user?.role === 'supplier_agent';
  if (!isSupplier) return next();
  const col = req.params.col;
  const ALLOWED_WRITE = ['bls', 'brs', 'notifications', 'sessions'];
  if (!ALLOWED_WRITE.includes(col)) {
    return res.status(403).json({ error: 'Accès refusé pour les fournisseurs' });
  }
  const sid = req.user.supplierId;
  if (!sid && (col === 'bls' || col === 'brs')) {
    return res.status(403).json({ error: 'Fournisseur non associé' });
  }
  if (col === 'bls' || col === 'brs') {
    if (req.method === 'POST' && req.body) {
      req.body.supplierId = sid;
      if (col === 'bls' && req.body.source === 'stock') {
        return res.status(403).json({ error: 'Création non autorisée sur stock pour les fournisseurs' });
      }
    }
    if (req.params.id) {
      try {
        const existing = await Document.findOne(idQuery(col, req.params.id)).lean();
        if (existing) {
          const docSid = existing.data?.supplierId;
          if (docSid && String(docSid) !== String(sid) && Number(docSid) !== Number(sid)) {
            return res.status(403).json({ error: 'Modification interdite sur ce document' });
          }
          if (col === 'bls' && existing.data?.source === 'stock') {
            return res.status(403).json({ error: 'Accès refusé aux bons de déstockage' });
          }
        }
      } catch (err) {
        return res.status(500).json({ error: 'Erreur de vérification des droits' });
      }
    }
  }
  next();
}

/** Never store a plain-text password at rest. */
async function hashPasswordIfNeeded(data) {
  if (data && typeof data.password === 'string' && data.password && !data.password.startsWith('$2')) {
    data.password = await bcrypt.hash(data.password, 10);
  }
  return data;
}

/** Match a document id that may have been stored as number or string. */
function idQuery(col, rawId) {
  const numId = Number(rawId);
  return isNaN(numId)
    ? { col, 'data.id': rawId }
    : { col, $or: [{ 'data.id': numId }, { 'data.id': String(numId) }] };
}

/** Initialise the per-collection id counter ONCE from the current max id (no scan per insert). */
async function ensureCounter(col) {
  const cid = `id_${col}`;
  const existing = await Counter.findOne({ _id: cid }).lean();
  if (!existing) {
    const top = await Document.findOne({ col, 'data.id': { $type: 'number' } })
      .sort({ 'data.id': -1 }).select('data.id').lean();
    try { await Counter.create({ _id: cid, seq: Number(top?.data?.id) || 0 }); }
    catch (_) { /* concurrent init — fine */ }
  }
  return cid;
}

/** Allocate a server-side numeric id for a collection. */
async function allocateId(col) {
  const cid = await ensureCounter(col);
  return Counter.nextSeq(cid);
}

/** Make sure the id counter never falls behind an id supplied by a client. */
async function raiseCounter(col, id) {
  const cid = await ensureCounter(col);
  await Counter.updateOne({ _id: cid }, { $max: { seq: id } });
}

// ─── GET /api/data/_versions — cheap change detector (no DB access) ──
router.get('/_versions', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(snapshot());
});

// ─── GET /api/data/next-num/:type — Atomic counter for BR/BL numbers ──
router.get('/next-num/:type', async (req, res) => {
  try {
    const type = req.params.type; // 'brs' or 'bls'
    const year = parseInt(req.query.year) || new Date().getFullYear();
    if (!['brs', 'bls', 'etat_vente'].includes(type)) {
      return res.status(400).json({ error: 'Type invalide (brs, bls ou etat_vente)' });
    }

    const counterId = `${type}_${year}`;
    const existing = await Counter.findOne({ _id: counterId });
    if (!existing) {
      let docs;
      if (type === 'etat_vente') {
        docs = await Document.find({ col: 'etat_vente_docs', 'data.year': year }).lean();
      } else {
        docs = await Document.find({ col: type, 'data.year': year }).lean();
      }
      const nums = docs.map(d => {
        if (type === 'etat_vente' && d.data?.ref) {
          const match = d.data.ref.match(/ET\/(\d+)\//);
          if (match) return parseInt(match[1]);
        }
        return parseInt(d.data?.brNum || d.data?.blNum) || 0;
      });
      const currentMax = nums.length ? Math.max(...nums) : (type === 'etat_vente' ? 0 : 99);
      try { await Counter.create({ _id: counterId, seq: currentMax }); } catch (_) { /* race */ }
    }

    const next = await Counter.nextSeq(counterId);
    res.json({ num: next });
  } catch (e) {
    console.error('[NEXT-NUM]', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// IMPORTANT: Specific routes MUST come before parameterized routes!
// ═══════════════════════════════════════════════════════════════════

// ─── GET /api/data/timbre-slabs ──────────────────────────────────
router.get('/timbre-slabs', async (req, res) => {
  try {
    const doc = await Document.findOne({ col: 'timbre_slabs', 'data.key': 'main' }).lean();
    res.json(doc?.data?.slabs || []);
  } catch (e) {
    console.error('[TIMBRE-SLABS/GET]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PUT /api/data/timbre-slabs ──────────────────────────────────
router.put('/timbre-slabs', async (req, res) => {
  try {
    const slabs = Array.isArray(req.body) ? req.body : [];
    await Document.findOneAndUpdate(
      { col: 'timbre_slabs', 'data.key': 'main' },
      { col: 'timbre_slabs', data: { key: 'main', slabs } },
      { upsert: true, new: true }
    );
    bump('_timbre_slabs');
    res.json({ ok: true, count: slabs.length });
  } catch (e) {
    console.error('[TIMBRE-SLABS/PUT]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/data/settings/main ─────────────────────────────────
router.get('/settings/main', async (req, res) => {
  try {
    let s = await Settings.findOne({ key: 'main' }).lean();
    if (!s) { s = { value: {} }; }
    res.json(s.value);
  } catch (e) {
    console.error('[SETTINGS/GET]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PATCH /api/data/settings/main ───────────────────────────────
router.patch('/settings/main', async (req, res) => {
  try {
    const doc = await Settings.findOne({ key: 'main' }).lean();
    const current = doc?.value || {};
    const merged = JSON.parse(JSON.stringify({ ...current, ...req.body }));
    await Settings.collection.updateOne(
      { key: 'main' },
      { $set: { value: merged, updatedAt: new Date() } },
      { upsert: true }
    );
    bump('_settings');
    res.json(merged);
  } catch (e) {
    console.error('[SETTINGS/PATCH]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/data/:col  (get all docs in a collection) ──────────
//   ?limit=N          newest N (newest first)        — legacy
//   ?tail=N           newest N, returned oldest→newest — for append-only logs
router.get('/:col', async (req, res) => {
  try {
    const col = req.params.col;
    const limit = parseInt(req.query.limit) || 0;
    const tail  = parseInt(req.query.tail) || 0;

    // ── Supplier data isolation: restrict what supplier users can see ──
    const isSupplier = req.user?.role === 'supplier' || req.user?.role === 'supplier_agent';
    const supplierSid = isSupplier ? req.user.supplierId : null;

    // Collections that suppliers are NOT allowed to access at all
    const BLOCKED_FOR_SUPPLIER = ['caisse_admin', 'bank_accounts', 'bank_transactions', 'etat_vente_docs', 'pointage'];
    if (isSupplier && BLOCKED_FOR_SUPPLIER.includes(col)) {
      return res.json([]); // empty — no access
    }

    // Build MongoDB query with supplier filter for relevant collections
    let filter = { col };
    if (isSupplier) {
      if (supplierSid) {
        // For BLs and BRs: only show documents belonging to this supplier
        if (col === 'bls' || col === 'brs') {
          filter['data.supplierId'] = { $in: [supplierSid, String(supplierSid), Number(supplierSid)] };
          // Strictly exclude internal warehouse stock déstockage from factory suppliers
          if (col === 'bls') {
            filter['data.source'] = { $ne: 'stock' };
          }
        }
        // For notifications: only show their own
        if (col === 'notifications') {
          filter['data.userId'] = { $in: [req.user.id, String(req.user.id), Number(req.user.id)] };
        }
        // For sessions: only show their own
        if (col === 'sessions') {
          filter['data.userId'] = { $in: [req.user.id, String(req.user.id), Number(req.user.id)] };
        }
      } else {
        // If supplier user has no supplierId assigned, block access to BLs/BRs
        if (col === 'bls' || col === 'brs') {
          return res.json([]);
        }
      }
    }

    let docs;
    if (tail > 0) {
      docs = await Document.find(filter).sort({ createdAt: -1 }).limit(tail).lean();
      docs.reverse();
    } else {
      let query = Document.find(filter);
      if (limit > 0) {
        const sortDir = req.query.sort === 'asc' ? 1 : -1;
        query = query.sort({ createdAt: sortDir }).limit(limit);
      }
      docs = await query.lean();
    }

    // For 'users' collection, suppliers can only see their own user record
    let results = docs.map(d => publicData(col, d.data));
    if (isSupplier && col === 'users') {
      results = results.filter(u => u.id === req.user.id || String(u.id) === String(req.user.id));
    }

    res.json(results);
  } catch (e) {
    console.error('[DATA/GET]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/data/:col/:id  (get single doc) ────────────────────
router.get('/:col/:id', async (req, res) => {
  try {
    const col = req.params.col;
    const isSupplier = req.user?.role === 'supplier' || req.user?.role === 'supplier_agent';
    const BLOCKED = ['caisse_admin', 'bank_accounts', 'bank_transactions', 'etat_vente_docs', 'pointage'];
    if (isSupplier && BLOCKED.includes(col)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const doc = await Document.findOne(idQuery(col, req.params.id)).lean();
    if (!doc) return res.status(404).json({ error: 'Non trouvé' });

    // Supplier isolation: BLs/BRs must belong to this supplier and not be internal stock
    if (isSupplier && (col === 'bls' || col === 'brs')) {
      const sid = req.user.supplierId;
      if (!sid) return res.status(403).json({ error: 'Accès refusé' });
      const docSid = doc.data?.supplierId;
      if (docSid && String(docSid) !== String(sid) && Number(docSid) !== Number(sid)) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
      if (col === 'bls' && doc.data?.source === 'stock') {
        return res.status(403).json({ error: 'Accès refusé aux bons de déstockage' });
      }
    }

    res.json(publicData(col, doc.data));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/data/:col  (insert) ───────────────────────────────
router.post('/:col', adminOnlyForUsers, supplierWriteGuard, async (req, res) => {
  try {
    const col  = req.params.col;
    const data = { ...(req.body || {}) };
    const now  = new Date().toISOString();
    const year = new Date().getFullYear();

    if (col === 'users') await hashPasswordIfNeeded(data);

    // ── STRICT PURE CAISSE LAW: Central caisse NEVER accepts direct deliveries, deletion adjustments, or return deductions ──
    if (col === 'caisse_admin' && (data.source === 'bl_delivery' || data.source === 'bl_error_delete' || data.source === 'bl_return')) {
      return res.status(400).json({ error: 'Opération interdite : la caisse centrale est exclusivement alimentée par les clôtures de caisse (user_cloture). Les retours sont déduits exclusivement de la mini-caisse de l\'utilisateur.' });
    }

    const hasId = data.id !== undefined && data.id !== null && data.id !== '' && !isNaN(Number(data.id));

    // ── Idempotency guard: same id already stored → this is a retry, merge instead of duplicating ──
    if (hasId) {
      const numId = Number(data.id);
      const existing = await Document.findOne({ col, 'data.id': numId });
      if (existing) {
        const merged = { ...existing.data, ...data, id: numId, updatedAt: now };
        existing.data = merged;
        existing.updatedAt = new Date();
        await existing.save();
        bump(col);
        return res.status(200).json(publicData(col, merged));
      }
    }

    // ── Idempotency guard by document reference (prevents network retries from creating duplicate docs) ──
    if ((col === 'bls' || col === 'brs' || col === 'bon_retours' || col === 'etat_vente_docs' || col === 'bank_transactions') && data.ref) {
      const existingRef = await Document.findOne({ col, 'data.ref': data.ref });
      if (existingRef) {
        const merged = { ...existingRef.data, ...data, id: existingRef.data.id, updatedAt: now };
        existingRef.data = merged;
        existingRef.updatedAt = new Date();
        await existingRef.save();
        bump(col);
        return res.status(200).json(publicData(col, merged));
      }
    }

    // ── Bank transactions guard by État de Vente reference/ID ──
    if (col === 'bank_transactions' && (data.etatVenteRef || data.etatVenteId)) {
      const query = data.etatVenteId
        ? { col: 'bank_transactions', 'data.etatVenteId': String(data.etatVenteId) }
        : { col: 'bank_transactions', 'data.etatVenteRef': data.etatVenteRef };
      const existingTx = await Document.findOne(query);
      if (existingTx) {
        const merged = { ...existingTx.data, ...data, id: existingTx.data.id, updatedAt: now };
        existingTx.data = merged;
        existingTx.updatedAt = new Date();
        await existingTx.save();
        bump(col);
        return res.status(200).json(publicData(col, merged));
      }
    }

    // ── Sessions guard: at most one session per user per day ──
    if (col === 'sessions' && data.userId && data.date) {
      const existingSession = await Document.findOne({
        col: 'sessions',
        'data.userId': { $in: [data.userId, String(data.userId), Number(data.userId)] },
        'data.date': data.date
      });
      if (existingSession) {
        const merged = { ...existingSession.data, ...data, id: existingSession.data.id, updatedAt: now };
        existingSession.data = merged;
        existingSession.updatedAt = new Date();
        await existingSession.save();
        bump(col);
        return res.status(200).json(publicData(col, merged));
      }
    }

    // ── Caisse Admin session closure & transfer guards: prevent duplicates ──
    if (col === 'caisse_admin') {
      if (data.source === 'user_cloture' || data.source === 'bch_recettes_reelles') {
        const query = data.sessionId 
          ? { col: 'caisse_admin', 'data.sessionId': Number(data.sessionId), 'data.source': { $in: ['user_cloture', 'bch_recettes_reelles'] } }
          : { col: 'caisse_admin', 'data.sessionDate': data.sessionDate, 'data.userId': data.userId, 'data.source': { $in: ['user_cloture', 'bch_recettes_reelles'] } };
        const existingCaisse = await Document.findOne(query);
        if (existingCaisse) {
          const merged = { ...existingCaisse.data, ...data, id: existingCaisse.data.id, updatedAt: now };
          existingCaisse.data = merged;
          existingCaisse.updatedAt = new Date();
          await existingCaisse.save();
          bump(col);
          return res.status(200).json(publicData(col, merged));
        }
      } else if (data.source === 'transfert_banque_etat_vente' && (data.etatVenteRef || data.sessionId)) {
        const query = data.etatVenteRef
          ? { col: 'caisse_admin', 'data.source': 'transfert_banque_etat_vente', 'data.etatVenteRef': data.etatVenteRef }
          : { col: 'caisse_admin', 'data.source': 'transfert_banque_etat_vente', 'data.sessionId': Number(data.sessionId) };
        const existingCaisse = await Document.findOne(query);
        if (existingCaisse) {
          const merged = { ...existingCaisse.data, ...data, id: existingCaisse.data.id, updatedAt: now };
          existingCaisse.data = merged;
          existingCaisse.updatedAt = new Date();
          await existingCaisse.save();
          bump(col);
          return res.status(200).json(publicData(col, merged));
        }
      }
    }

    // ── Internal id ───────────────────────────────────────────────
    let finalId;
    if (hasId) {
      finalId = Number(data.id);
      await raiseCounter(col, finalId);
    } else {
      finalId = await allocateId(col);
    }

    // ── BR numbering: atomic, duplicates rejected ─────────────────
    let brNum = data.brNum;
    if (col === 'brs') {
      const brYear = data.year || year;
      if (brNum) {
        const dup = await Document.findOne({ col: 'brs', 'data.brNum': Number(brNum), 'data.year': brYear });
        if (dup) {
          return res.status(409).json({ error: `Le numéro BR ${brNum} est déjà utilisé pour l'année ${brYear}` });
        }
      } else {
        const counterId = `brs_${brYear}`;
        const existing = await Counter.findOne({ _id: counterId });
        if (!existing) {
          const docs = await Document.find({ col: 'brs', 'data.year': brYear }).select('data.brNum').lean();
          const nums = docs.map(d => parseInt(d.data?.brNum) || 0);
          const currentMax = nums.length ? Math.max(...nums) : 99;
          try { await Counter.create({ _id: counterId, seq: currentMax }); } catch (_) { /* race */ }
        }
        brNum = await Counter.nextSeq(counterId);
      }
      const suppAbbrev = data.ref?.match(/\/([A-Z]+)\//)?.[1] || '';
      const n = String(brNum).padStart(3, '0');
      data.ref = suppAbbrev ? `${n}/BR/${suppAbbrev}/${data.year || brYear}` : `BR/${n}/${data.year || brYear}`;
    }

    const newData = {
      ...data,
      id:        finalId,
      ...(col === 'brs' ? { brNum: Number(brNum) } : {}),
      createdAt:     data.createdAt || now,
      updatedAt:     now,
      createdBy:     data.createdBy    ?? req.user.id,
      createdByName: data.createdByName ?? req.user.name,
    };

    await Document.create({ col, data: newData });
    bump(col);

    // ── Server-Side Referential Guarantee for BL <-> BR ──
    // Ensures parent BR status is synchronized in MongoDB Atlas even if client network disconnects
    if (col === 'bls' && (newData.brId || newData.linkedBrId)) {
      const targetBrId = Number(newData.brId || newData.linkedBrId);
      if (targetBrId) {
        try {
          const brDoc = await Document.findOne(idQuery('brs', targetBrId));
          if (brDoc && brDoc.data) {
            const isHistoricalDelivered = newData.status === 'delivered';
            if (isHistoricalDelivered || brDoc.data.status === 'open' || brDoc.data.status === 'reserved') {
              const updatedStatus = 'delivered';
              const updatedDeliveredAt = newData.deliveredAt || now;
              await Document.updateOne(
                { _id: brDoc._id },
                { $set: { 'data.status': updatedStatus, 'data.deliveredAt': updatedDeliveredAt, updatedAt: new Date() } }
              );
              bump('brs');
            }
          }
        } catch (brErr) {
          console.warn('[SERVER BL->BR SYNC]', brErr);
        }
      }
    }

    res.status(201).json(publicData(col, newData));

  } catch (e) {
    console.error('[DATA/POST]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PUT /api/data/:col/bulk  (safe upsert — never deletes) ──────
router.put('/:col/bulk', adminOnlyForUsers, supplierWriteGuard, async (req, res) => {
  try {
    const col   = req.params.col;
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array expected' });
    if (col !== 'users' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admins uniquement' });
    }

    if (items.length) {
      const ops = items.map(item => ({
        updateOne: {
          filter: { col, 'data.id': item.id },
          update: { $set: { col, data: item, updatedAt: new Date() } },
          upsert: true
        }
      }));
      await Document.bulkWrite(ops);
      bump(col);
    }
    res.json({ synced: items.length });
  } catch (e) {
    console.error('[DATA/BULK]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PUT /api/data/:col/:id  (full replace of one doc) ───────────
router.put('/:col/:id', adminOnlyForUsers, supplierWriteGuard, async (req, res) => {
  try {
    const col    = req.params.col;
    const id     = Number(req.params.id);
    const update = { ...req.body, updatedAt: new Date().toISOString() };
    if (col === 'users') await hashPasswordIfNeeded(update);

    const doc = await Document.findOneAndUpdate(
      { col, 'data.id': id },
      { $set: { data: update, updatedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Non trouvé' });
    bump(col);
    res.json(publicData(col, doc.data));
  } catch (e) {
    console.error('[DATA/PUT]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PATCH /api/data/:col/:id  (partial, ATOMIC field-level update) ──
// Only the fields present in the body are written, using $set on each
// field. Two users editing DIFFERENT fields of the same document can no
// longer overwrite each other (the old read-merge-save lost updates).
router.patch('/:col/:id', adminOnlyForUsers, supplierWriteGuard, async (req, res) => {
  try {
    const col = req.params.col;
    const query = idQuery(col, req.params.id);
    const patch = { ...(req.body || {}) };

    delete patch.id;                       // an id never changes
    delete patch.currentSessionId;         // only the login route may touch sessions
    if (col === 'users') {
      delete patch.lastLoginAt;
      if ('password' in patch) {
        if (!patch.password) delete patch.password;   // empty = unchanged
        else await hashPasswordIfNeeded(patch);
      }
    }

    // ── Duplicate check for BR number on update ──────────────────
    if (col === 'brs' && patch.brNum !== undefined) {
      const current = await Document.findOne(query).select('data.year data.id').lean();
      if (!current) return res.status(404).json({ error: 'Non trouvé' });
      const brYear = patch.year || current.data.year || new Date().getFullYear();
      const dup = await Document.findOne({
        col: 'brs', 'data.brNum': Number(patch.brNum), 'data.year': brYear, 'data.id': { $ne: current.data.id }
      });
      if (dup) {
        return res.status(409).json({ error: `Le numéro BR ${patch.brNum} est déjà utilisé pour l'année ${brYear}` });
      }
    }

    const nowIso = new Date().toISOString();
    const set = { 'data.updatedAt': nowIso, updatedAt: new Date() };
    let dottedSafe = true;
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'updatedAt') continue;
      if (k.includes('.') || k.startsWith('$') || k === '') { dottedSafe = false; break; }
      set[`data.${k}`] = v;
    }

    let doc;
    if (dottedSafe) {
      doc = await Document.findOneAndUpdate(query, { $set: set }, { new: true }).lean();
    } else {
      // Exotic keys: fall back to read-merge-save
      const found = await Document.findOne(query);
      if (!found) return res.status(404).json({ error: 'Non trouvé' });
      found.data = { ...found.data, ...patch, updatedAt: nowIso };
      found.updatedAt = new Date();
      await found.save();
      doc = found.toObject();
    }
    if (!doc) return res.status(404).json({ error: 'Non trouvé' });

    bump(col);
    res.json(publicData(col, doc.data));
  } catch (e) {
    console.error('[DATA/PATCH]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── DELETE /api/data/:col/:id ────────────────────────────────────
router.delete('/:col/:id', adminOnlyForUsers, supplierWriteGuard, async (req, res) => {
  try {
    const col = req.params.col;
    let blDocToDelete = null;
    if (col === 'bls') {
      blDocToDelete = await Document.findOne(idQuery('bls', req.params.id)).lean();
    }
    const result = await Document.deleteOne(idQuery(col, req.params.id));
    if (!result.deletedCount) return res.status(404).json({ error: 'Non trouvé' });
    bump(col);

    // ── Server-Side Auto-Reopening of BR when BL is deleted ──
    if (col === 'bls' && blDocToDelete?.data) {
      const targetBrId = Number(blDocToDelete.data.brId || blDocToDelete.data.linkedBrId);
      if (targetBrId) {
        try {
          const otherBLs = await Document.find({
            col: 'bls',
            $or: [{ 'data.brId': targetBrId }, { 'data.linkedBrId': targetBrId }],
            'data.status': 'delivered'
          }).lean();
          if (!otherBLs.length) {
            await Document.updateOne(
              idQuery('brs', targetBrId),
              { $set: { 'data.status': 'open', 'data.deliveredAt': null, updatedAt: new Date() } }
            );
            bump('brs');
          }
        } catch (brErr) {
          console.warn('[SERVER BL DELETE->BR REOPEN]', brErr);
        }
      }
    }

    res.json({ success: true, id: req.params.id });
  } catch (e) {
    console.error('[DATA/DELETE]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/data/:col/dedup  (remove duplicates from a collection) ──
router.post('/:col/dedup', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
    const col = req.params.col;
    const docs = await Document.find({ col }).sort({ createdAt: 1 }).lean();
    const toDelete = [];
    const seenId = new Set();
    const seenRef = new Set();
    const seenSessions = new Set();
    const seenCaisseCloture = new Set();
    const seenCaisseTransfer = new Set();
    const seenCaisseReturn = new Set();

    for (const doc of docs) {
      const d = doc.data || {};
      const idKey = String(d.id || doc._id);

      // Check 1: Duplicate ID
      if (seenId.has(idKey)) {
        toDelete.push(doc._id);
        continue;
      }
      seenId.add(idKey);

      // Check 2: Pure Caisse Law — purge illegal entries (bl_delivery, bl_error_delete, bl_return)
      if (col === 'caisse_admin') {
        if (d.source === 'bl_delivery' || d.source === 'bl_error_delete' || d.source === 'bl_return') {
          toDelete.push(doc._id);
          continue;
        }
        if (d.source === 'user_cloture' || d.source === 'bch_recettes_reelles') {
          const cKey = d.sessionId ? `sess_${d.sessionId}` : `dt_${d.sessionDate || d.date}_u_${d.userId}`;
          if (seenCaisseCloture.has(cKey)) {
            toDelete.push(doc._id);
            continue;
          }
          seenCaisseCloture.add(cKey);
        } else if (d.source === 'transfert_banque_etat_vente' && d.etatVenteRef) {
          if (seenCaisseTransfer.has(d.etatVenteRef)) {
            toDelete.push(doc._id);
            continue;
          }
          seenCaisseTransfer.add(d.etatVenteRef);
        }
      }

      // Check 3: Sessions deduplication by user + date
      if (col === 'sessions' && d.userId && d.date) {
        const sKey = `${d.userId}_${d.date}`;
        if (seenSessions.has(sKey)) {
          toDelete.push(doc._id);
          continue;
        }
        seenSessions.add(sKey);
      }

      // Check 4: Reference deduplication
      if (['bls', 'brs', 'bon_retours', 'etat_vente_docs', 'bank_transactions'].includes(col) && d.ref) {
        const refKey = String(d.ref).trim();
        if (seenRef.has(refKey)) {
          toDelete.push(doc._id);
          continue;
        }
        seenRef.add(refKey);
      }
    }

    if (toDelete.length) {
      await Document.deleteMany({ _id: { $in: toDelete } });
      bump(col);
    }
    res.json({ removed: toDelete.length, remaining: docs.length - toDelete.length });
  } catch (e) {
    console.error('[DATA/DEDUP]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
