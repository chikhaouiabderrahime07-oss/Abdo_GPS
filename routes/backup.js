const express  = require('express');
const zlib     = require('zlib');
const { once } = require('events');
const Document = require('../models/Document');
const Settings = require('../models/Settings');
const Counter  = require('../models/Counter');
const Backup   = require('../models/Backup');
const auth     = require('../middleware/auth');
const { bumpAll } = require('../lib/versions');

const router = express.Router();
router.use(auth);

// All backup routes require admin
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins uniquement' });
  next();
};
router.use(adminOnly);

// Retention: bounded so backups can never fill the free 512 MB database.
// auto: 14 daily master, safety: 5 pre-restore, manual: 15 user backups, intraday: 48 rolling 2-min snapshots
const KEEP = { auto: 14, safety: 5, manual: 15, intraday: 48 };
const BACKUP_TTL_DAYS = 30;
const MAX_BLOB_BYTES = 15 * 1024 * 1024; // MongoDB hard limit is 16 MB per document

let _running = false;

// ─── Build a gzip snapshot of EVERY collection (streamed, low memory) ───────
async function buildSnapshotBlob() {
  const gzip = zlib.createGzip({ level: 6 });
  const chunks = [];
  gzip.on('data', c => chunks.push(c));
  const finished = new Promise((resolve, reject) => { gzip.on('end', resolve); gzip.on('error', reject); });

  let raw = 0, docCount = 0;
  const write = async (s) => {
    raw += Buffer.byteLength(s);
    if (!gzip.write(s)) await once(gzip, 'drain');
  };

  // Every collection that exists — the old backup silently skipped bank, charges, payroll, returns…
  const cols = (await Document.distinct('col')).sort();
  await write(`{"v":2,"createdAt":${JSON.stringify(new Date().toISOString())},"cols":{`);
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    await write(`${i ? ',' : ''}${JSON.stringify(col)}:[`);
    let first = true;
    const cursor = Document.find({ col }).lean().cursor();
    for await (const d of cursor) {
      await write(`${first ? '' : ','}${JSON.stringify({ d: d.data, c: d.createdAt, u: d.updatedAt })}`);
      first = false; docCount++;
    }
    await write(']');
  }
  const settings = await Settings.findOne({ key: 'main' }).lean();
  const counters = await Counter.find().lean();
  await write(`},"settings":${JSON.stringify(settings?.value || {})},"counters":${JSON.stringify(counters)}}`);
  gzip.end();
  await finished;

  return { blob: Buffer.concat(chunks), raw, docCount, colCount: cols.length };
}

// ─── Core backup function ─────────────────────────────────────────
async function createBackup(label, type = 'auto', createdBy = 'system') {
  if (_running) throw new Error('Une sauvegarde est déjà en cours');
  _running = true;
  try {
    const { blob, raw, docCount } = await buildSnapshotBlob();
    if (blob.length > MAX_BLOB_BYTES) {
      throw new Error(`Sauvegarde trop volumineuse (${(blob.length / 1048576).toFixed(1)} Mo compressés > 15 Mo)`);
    }
    const expiresAt = new Date(Date.now() + BACKUP_TTL_DAYS * 86400000);
    const backup = await Backup.create({
      label, type, createdBy, format: 'gzip-v2',
      blob, sizeBytes: blob.length, rawBytes: raw, docCount, expiresAt,
    });
    await pruneBackups().catch(e => console.warn('[BACKUP/prune]', e.message));
    return backup;
  } finally {
    _running = false;
  }
}

// ─── Keep only the newest N backups of each kind ──────────────────
async function pruneBackups() {
  const all = await Backup.find().select('type label createdAt').sort({ createdAt: -1 }).lean();
  const buckets = { auto: [], safety: [], manual: [], intraday: [] };
  for (const b of all) {
    const kind = b.type === 'manual' ? 'manual' : (b.type === 'intraday' ? 'intraday' : (/^Avant restauration/.test(b.label) ? 'safety' : 'auto'));
    if (buckets[kind]) buckets[kind].push(b._id);
  }
  const drop = [];
  for (const kind of Object.keys(buckets)) drop.push(...buckets[kind].slice(KEEP[kind] || 10));
  if (drop.length) await Backup.deleteMany({ _id: { $in: drop } });
}

// ─── Catch-up backup: the free Render tier sleeps, so the 23:59 cron may never fire ──
async function maybeDailyBackup() {
  if (_running) return null;
  const last = await Backup.findOne({ type: 'auto', label: { $not: /^Avant restauration/ } })
    .sort({ createdAt: -1 }).select('createdAt').lean();
  if (last && Date.now() - new Date(last.createdAt).getTime() < 20 * 3600 * 1000) return null;
  const label = `Automatique — ${new Date().toLocaleString('fr-DZ', { timeZone: 'Africa/Algiers' })}`;
  const b = await createBackup(label, 'auto', 'system');
  console.log(`✅ [BACKUP] Sauvegarde de rattrapage créée: ${b.label} (${(b.sizeBytes / 1024).toFixed(0)} Ko)`);
  return b;
}

// ─── 2-Minute High-Frequency Intraday Continuous Snapshot ──────────
let _lastDocState = null;
async function maybeIntradayBackup() {
  if (_running) return null;
  try {
    // Only snapshot if data was actually written/modified
    const docCount = await Document.countDocuments();
    const latestDoc = await Document.findOne().sort({ updatedAt: -1 }).select('updatedAt').lean();
    const latestTime = latestDoc?.updatedAt ? new Date(latestDoc.updatedAt).getTime() : 0;
    const stateKey = `${docCount}_${latestTime}`;
    if (_lastDocState && _lastDocState === stateKey) {
      return null; // Database unchanged in this 2-minute interval
    }

    const timeStr = new Date().toLocaleTimeString('fr-DZ', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit' });
    const label = `Point 2-Min — ${timeStr}`;
    const b = await createBackup(label, 'intraday', 'system');
    _lastDocState = stateKey;
    console.log(`⏱️ [BACKUP-2MIN] Point de restauration 2-minutes créé: ${b.label} (${(b.sizeBytes / 1024).toFixed(0)} Ko)`);
    return b;
  } catch (e) {
    console.warn('⚠️ [BACKUP-2MIN]', e.message);
    return null;
  }
}

// .lean() returns BSON Binary for Buffer fields — normalise to a real Buffer.
function toBuffer(bin) {
  if (!bin) return null;
  if (Buffer.isBuffer(bin)) return bin;
  if (bin.buffer) {
    const b = Buffer.isBuffer(bin.buffer) ? bin.buffer : Buffer.from(bin.buffer);
    const len = typeof bin.length === 'function' ? bin.length() : (bin.position ?? b.length);
    return b.subarray(0, len);
  }
  return Buffer.from(bin);
}

// ─── Decode a stored backup (new gzip format or legacy) into one shape ──────
function decodeBackup(backup) {
  if (backup.format === 'gzip-v2' && backup.blob) {
    const snap = JSON.parse(zlib.gunzipSync(toBuffer(backup.blob)).toString('utf8'));
    return { cols: snap.cols || {}, settings: snap.settings || null, counters: snap.counters || null };
  }
  // legacy: { col: [data...], _settings, _timestamp }
  const cols = {};
  for (const [col, items] of Object.entries(backup.data || {})) {
    if (col.startsWith('_') || !Array.isArray(items)) continue;
    cols[col] = items.map(d => ({ d }));
  }
  return { cols, settings: backup.data?._settings || null, counters: null };
}

function asDate(v, fallback) {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? d : fallback;
}

// ─── GET /api/backup  (list all backups) ─────────────────────────
router.get('/', async (req, res) => {
  try {
    const backups = await Backup.find()
      .select('label type createdBy createdAt expiresAt format sizeBytes rawBytes docCount')
      .sort({ createdAt: -1 })
      .lean();
    res.json(backups);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/backup  (create manual backup) ────────────────────
router.post('/', async (req, res) => {
  try {
    const label = req.body.label || `Manuel — ${new Date().toLocaleString('fr-FR')}`;
    const backup = await createBackup(label, 'manual', req.user.name);
    res.status(201).json({ success: true, id: backup._id, label: backup.label, sizeBytes: backup.sizeBytes, docCount: backup.docCount });
  } catch (e) {
    console.error('[BACKUP/create]', e);
    res.status(500).json({ error: e.message || 'Erreur lors de la sauvegarde' });
  }
});

// ─── GET /api/backup/:id/download  (off-site copy: .json.gz) ─────
router.get('/:id/download', async (req, res) => {
  try {
    const backup = await Backup.findById(req.params.id).lean();
    if (!backup) return res.status(404).json({ error: 'Sauvegarde non trouvée' });
    const stamp = new Date(backup.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    let payload;
    if (backup.format === 'gzip-v2' && backup.blob) {
      payload = toBuffer(backup.blob);
    } else {
      payload = zlib.gzipSync(Buffer.from(JSON.stringify(backup.data || {})));
    }
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="erp-backup-${stamp}.json.gz"`,
      'Content-Length': payload.length,
    });
    res.send(payload);
  } catch (e) {
    console.error('[BACKUP/download]', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/backup/:id/restore  (restore a backup) ────────────
router.post('/:id/restore', async (req, res) => {
  try {
    const backup = await Backup.findById(req.params.id).lean();
    if (!backup) return res.status(404).json({ error: 'Sauvegarde non trouvée' });

    const snap = decodeBackup(backup);

    // Safety backup of the CURRENT state first — if anything fails below we can go back.
    await createBackup(`Avant restauration — ${new Date().toLocaleString('fr-FR')}`, 'auto', 'system');

    const now = new Date();
    for (const [col, items] of Object.entries(snap.cols)) {
      await Document.deleteMany({ col });
      for (let i = 0; i < items.length; i += 500) {
        const batch = items.slice(i, i + 500).map(it => {
          const data = { ...it.d };
          if (col === 'users') delete data.currentSessionId; // sessions of the restored moment are meaningless
          return {
            col, data,
            createdAt: asDate(it.c, asDate(data.createdAt, now)),
            updatedAt: asDate(it.u, asDate(data.updatedAt, now)),
          };
        });
        if (batch.length) await Document.insertMany(batch, { ordered: false });
      }
    }

    if (snap.settings) {
      await Settings.findOneAndUpdate({ key: 'main' }, { value: snap.settings }, { upsert: true });
    }
    if (Array.isArray(snap.counters) && snap.counters.length) {
      await Counter.deleteMany({});
      await Counter.insertMany(snap.counters.map(c => ({ _id: c._id, seq: c.seq })));
    }

    bumpAll(); // every client must re-download everything
    res.json({ success: true, message: `Restauration effectuée depuis: ${backup.label}` });
  } catch (e) {
    console.error('[BACKUP/restore]', e);
    res.status(500).json({ error: 'Erreur lors de la restauration' });
  }
});

// ─── POST /api/backup/close-day (Clôture Journée: archive Master & Purge 5-min) ──
router.post('/close-day', async (req, res) => {
  try {
    const dateStr = new Date().toLocaleDateString('fr-DZ', { timeZone: 'Africa/Algiers' });
    const masterLabel = `Clôture Validée Journée — ${dateStr}`;
    
    // 1. Create permanent master backup of the closed journey
    const master = await createBackup(masterLabel, 'auto', req.user?.name || 'Clôture');
    
    // 2. Delete all temporary 5-min intraday snapshots of this day
    const deleted = await Backup.deleteMany({ type: 'intraday' });
    
    console.log(`🔒 [BACKUP/CLOSE-DAY] Journée validée: ${masterLabel}. ${deleted.deletedCount} sauvegardes intraday 5-min purgées.`);
    res.json({
      success: true,
      message: `Journée validée avec succès. Sauvegarde maître archivée et ${deleted.deletedCount} points temporaires purgés.`,
      masterId: master._id,
      purgedCount: deleted.deletedCount
    });
  } catch (e) {
    console.error('[BACKUP/close-day]', e);
    res.status(500).json({ error: e.message || 'Erreur lors de la clôture des sauvegardes' });
  }
});

// ─── DELETE /api/backup/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await Backup.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = { router, createBackup, maybeDailyBackup, maybeIntradayBackup, decodeBackup };
