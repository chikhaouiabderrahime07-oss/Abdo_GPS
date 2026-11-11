'use strict';
/**
 * Atelier Biskra — Bon de réparation suivi (backend)
 * Mounted from server.js:  require('./atelier-routes')(app, deps)
 * deps = { mongoose, checkAccess, Truck, Trailer, Maintenance, ApiKey, acknowledgeVidange, POWERBI_TOKEN }
 */

const crypto = require('crypto');

const STATUSES = ['ouvert', 'en_cours', 'en_attente_piece', 'termine'];
const CATALOG_KINDS = ['panne', 'intervention', 'piece', 'intervenant'];
const DAY_MS = 86400000;

function norm(s) {
  return String(s == null ? '' : s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function clean(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
}

function isOid(s) {
  return /^[a-fA-F0-9]{24}$/.test(String(s));
}

function escRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = function mountAtelier(app, deps) {
  const { mongoose, checkAccess, Truck, Trailer, Maintenance, ApiKey, acknowledgeVidange, POWERBI_TOKEN } = deps;
  const Schema = mongoose.Schema;

  // ───────────────────────── MODELS ─────────────────────────
  const CatalogSchema = new Schema({
    kind: { type: String, enum: CATALOG_KINDS.concat(['setting']), required: true, index: true },
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true },
    parent: { type: String, default: '' },      // intervention → panne name
    parentKey: { type: String, default: '' },
    family: { type: String, default: '' },      // piece → famille
    phone: { type: String, default: '' },       // intervenant
    specialty: { type: String, default: '' },   // intervenant
    interne: { type: Boolean, default: false }, // intervenant interne (le méthodiste lui-même)
    isVidange: { type: Boolean, default: false },// intervention qui remet la vidange à zéro
    value: Schema.Types.Mixed,                  // setting value
    usageCount: { type: Number, default: 0 },
    lastUsedAt: Date,
    active: { type: Boolean, default: true }
  }, { timestamps: true });
  CatalogSchema.index({ kind: 1, parentKey: 1, nameKey: 1 }, { unique: true });
  const AtelierCatalog = mongoose.models.AtelierCatalog || mongoose.model('AtelierCatalog', CatalogSchema);

  const LightVehicleSchema = new Schema({
    plate: { type: String, required: true, trim: true },
    plateKey: { type: String, required: true, unique: true },
    name: { type: String, default: '' },
    brand: { type: String, default: '' },
    type: { type: String, default: 'Véhicule léger' },
    assignedTo: { type: String, default: '' },
    chassis: { type: String, default: '' },
    active: { type: Boolean, default: true }
  }, { timestamps: true });
  const LightVehicle = mongoose.models.LightVehicle || mongoose.model('LightVehicle', LightVehicleSchema);

  const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
  const AtelierCounter = mongoose.models.AtelierCounter || mongoose.model('AtelierCounter', CounterSchema);

  const LineSchema = new Schema({
    intervention: { type: String, default: '' },
    isVidange: { type: Boolean, default: false },
    intervenant: {
      id: String, name: { type: String, default: '' }, type: { type: String, default: 'externe' }
    },
    piece: {
      catalogId: String,
      designation: { type: String, default: '' },
      family: { type: String, default: '' },
      ref: { type: String, default: '' },
      sn: { type: String, default: '' },
      qty: { type: Number, default: 1 },
      source: { type: String, default: 'externe' }, // externe | erp
      erpArticleId: String
    },
    note: { type: String, default: '' },
    done: { type: Boolean, default: false }
  }, { _id: true });

  const BonSchema = new Schema({
    ref: { type: String, required: true, unique: true },
    year: Number,
    vehicle: {
      kind: { type: String, enum: ['camion', 'remorque', 'vehicule'], default: 'camion' },
      refId: String,
      deviceId: String,
      plate: { type: String, default: '', index: true },
      name: { type: String, default: '' },
      chassis: { type: String, default: '' },
      kmAtEntry: { type: Number, default: 0 },
      attachedTrailer: { type: String, default: '' }
    },
    panneType: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, enum: STATUSES, default: 'ouvert', index: true },
    statusHistory: [{ status: String, at: Date, by: String, _id: false }],
    openedAt: { type: Date, default: Date.now, index: true },
    closedAt: Date,
    lines: [LineSchema],
    erpSync: {
      status: { type: String, default: 'pending' }, // pending | synced | failed
      lastAt: Date,
      erpBtRef: { type: String, default: '' },
      error: { type: String, default: '' }
    },
    vidangeReset: { type: Boolean, default: false },
    createdBy: { type: String, default: '' }
  }, { timestamps: true });
  const AtelierBon = mongoose.models.AtelierBon || mongoose.model('AtelierBon', BonSchema);

  // ───────────────────────── HELPERS ─────────────────────────
  async function nextRef(year) {
    const c = await AtelierCounter.findOneAndUpdate(
      { _id: 'bon-' + year }, { $inc: { seq: 1 } }, { upsert: true, new: true }
    );
    return 'BR-' + year + '-' + String(c.seq).padStart(4, '0');
  }

  async function learn(kind, data) {
    const name = clean(data.name);
    if (!name) return null;
    const parent = clean(data.parent);
    const q = { kind, nameKey: norm(name), parentKey: kind === 'intervention' ? norm(parent) : '' };
    const set = { name, lastUsedAt: new Date(), active: true };
    if (kind === 'intervention') set.parent = parent;
    if (kind === 'piece' && data.family) set.family = clean(data.family);
    if (kind === 'intervenant') {
      if (data.phone) set.phone = clean(data.phone);
      if (data.specialty) set.specialty = clean(data.specialty);
      if (typeof data.interne === 'boolean') set.interne = data.interne;
    }
    if (kind === 'intervention' && typeof data.isVidange === 'boolean') set.isVidange = data.isVidange;
    try {
      return await AtelierCatalog.findOneAndUpdate(
        q, { $set: set, $inc: { usageCount: 1 }, $setOnInsert: q }, { upsert: true, new: true }
      );
    } catch (e) {
      if (e && e.code === 11000) return AtelierCatalog.findOne(q);
      throw e;
    }
  }

  async function learnFromBon(bon) {
    if (bon.panneType) await learn('panne', { name: bon.panneType });
    for (const ln of bon.lines || []) {
      if (ln.intervention) {
        await learn('intervention', { name: ln.intervention, parent: bon.panneType });
      }
      if (ln.piece && ln.piece.designation) {
        const c = await learn('piece', { name: ln.piece.designation, family: ln.piece.family });
        if (c) ln.piece.catalogId = String(c._id);
        if (c && !ln.piece.family && c.family) ln.piece.family = c.family;
      }
      if (ln.intervenant && ln.intervenant.name) {
        const c = await learn('intervenant', {
          name: ln.intervenant.name, interne: ln.intervenant.type === 'interne'
        });
        if (c) ln.intervenant.id = String(c._id);
      }
      if (ln.intervention) {
        const ic = await AtelierCatalog.findOne({
          kind: 'intervention', nameKey: norm(ln.intervention), parentKey: norm(bon.panneType)
        }).lean();
        if (ic && ic.isVidange) ln.isVidange = true;
      }
    }
  }

  function sanitizeLines(lines) {
    return (Array.isArray(lines) ? lines : []).map(l => ({
      _id: l && l._id && isOid(l._id) ? l._id : undefined,
      intervention: clean(l && l.intervention),
      isVidange: !!(l && l.isVidange),
      intervenant: {
        id: l && l.intervenant && l.intervenant.id ? String(l.intervenant.id) : undefined,
        name: clean(l && l.intervenant && l.intervenant.name),
        type: l && l.intervenant && l.intervenant.type === 'interne' ? 'interne' : 'externe'
      },
      piece: {
        catalogId: l && l.piece && l.piece.catalogId ? String(l.piece.catalogId) : undefined,
        designation: clean(l && l.piece && l.piece.designation),
        family: clean(l && l.piece && l.piece.family),
        ref: clean(l && l.piece && l.piece.ref),
        sn: clean(l && l.piece && l.piece.sn),
        qty: Math.max(1, Number(l && l.piece && l.piece.qty) || 1),
        source: l && l.piece && l.piece.source === 'erp' ? 'erp' : 'externe',
        erpArticleId: l && l.piece && l.piece.erpArticleId ? String(l.piece.erpArticleId) : undefined
      },
      note: clean(l && l.note),
      done: !!(l && l.done)
    })).filter(l => l.intervention || l.piece.designation || l.intervenant.name);
  }

  // Availability sync: bon open → vehicle "en maintenance"; last open bon closed → "disponible"
  async function setAvailability(vehicle, open) {
    try {
      if (!vehicle) return;
      if (vehicle.kind === 'camion' && vehicle.deviceId) {
        if (open) {
          await Truck.updateOne({ deviceId: String(vehicle.deviceId) }, { $set: { situation: 'maintenance' } });
        } else {
          const still = await AtelierBon.countDocuments({
            'vehicle.deviceId': String(vehicle.deviceId), status: { $ne: 'termine' }
          });
          if (still === 0) {
            await Truck.updateOne(
              { deviceId: String(vehicle.deviceId), situation: { $in: ['maintenance', 'panne'] } },
              { $set: { situation: 'disponible' } }
            );
          }
        }
      } else if (vehicle.kind === 'remorque' && vehicle.refId && isOid(vehicle.refId)) {
        if (open) {
          await Trailer.updateOne({ _id: vehicle.refId }, { $set: { status: 'maintenance' } });
        } else {
          const still = await AtelierBon.countDocuments({ 'vehicle.refId': vehicle.refId, status: { $ne: 'termine' } });
          if (still === 0) {
            const t = await Trailer.findById(vehicle.refId).lean();
            if (t && ['maintenance', 'panne'].includes(t.status)) {
              await Trailer.updateOne({ _id: vehicle.refId }, {
                $set: { status: t.attachedTruckDeviceId ? 'attele' : 'disponible' }
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('[Atelier] setAvailability error:', e.message);
    }
  }

  // Vidange reset: a closed bon containing a Vidange-flagged line acknowledges the vidange
  async function applyVidangeReset(bon, kmAtClose, who) {
    const v = bon.vehicle || {};
    const hasVidange = (bon.lines || []).some(l => l.isVidange);
    if (!hasVidange) return { applied: false, reason: 'no_vidange_line' };
    if (v.kind !== 'camion' || !v.deviceId) return { applied: false, reason: 'not_a_gps_truck' };
    const km = Math.round(Number(kmAtClose) || Number(v.kmAtEntry) || 0);
    if (km <= 0) return { applied: false, reason: 'km_missing' };
    const when = new Date();
    const techn = (bon.lines.find(l => l.isVidange && l.intervenant && l.intervenant.name) || { intervenant: {} })
      .intervenant.name || who || '';
    const note = 'Vidange — Atelier Biskra (' + bon.ref + ')';
    await Maintenance.create({
      deviceId: String(v.deviceId), truckName: v.name, type: 'Vidange', odometer: km,
      date: when, exitDate: when, note, technician: techn, status: 'termine',
      location: 'Atelier Biskra', immatriculation: v.plate, chassisNumber: v.chassis
    });
    const ack = await acknowledgeVidange(String(v.deviceId), v.name, km, when.toISOString(), note);
    return { applied: !!ack, km };
  }

  const wrap = fn => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      console.error('[Atelier] ' + req.method + ' ' + req.path + ':', e.message);
      res.status(500).json({ error: e.message });
    }
  };

  // ───────────────────────── CATALOG ─────────────────────────
  app.get('/api/atelier/catalog', checkAccess, wrap(async (req, res) => {
    const { kind, q, parent } = req.query;
    if (!CATALOG_KINDS.includes(kind)) return res.status(400).json({ error: 'kind invalide' });
    const f = { kind, active: true };
    if (q) f.nameKey = new RegExp(escRx(norm(q)));
    if (kind === 'intervention' && parent) f.parentKey = norm(parent);
    const items = await AtelierCatalog.find(f)
      .sort({ usageCount: -1, name: 1 }).limit(Number(req.query.limit) || 200).lean();
    res.json(items);
  }));

  app.post('/api/atelier/catalog', checkAccess, wrap(async (req, res) => {
    const b = req.body || {};
    if (!CATALOG_KINDS.includes(b.kind)) return res.status(400).json({ error: 'kind invalide' });
    if (!clean(b.name)) return res.status(400).json({ error: 'name requis' });
    if (b.kind === 'intervention' && !clean(b.parent)) {
      return res.status(400).json({ error: 'Une intervention doit être liée à un type de panne' });
    }
    const item = await learn(b.kind, b);
    res.json({ success: true, item });
  }));

  app.patch('/api/atelier/catalog/:id', checkAccess, wrap(async (req, res) => {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const b = req.body || {};
    const set = {};
    if (b.name !== undefined && clean(b.name)) { set.name = clean(b.name); set.nameKey = norm(b.name); }
    ['family', 'phone', 'specialty'].forEach(k => { if (b[k] !== undefined) set[k] = clean(b[k]); });
    ['interne', 'isVidange', 'active'].forEach(k => { if (typeof b[k] === 'boolean') set[k] = b[k]; });
    const before = set.nameKey ? await AtelierCatalog.findById(req.params.id).lean() : null;
    if (before && set.nameKey !== before.nameKey) {
      const dup = await AtelierCatalog.findOne({
        _id: { $ne: before._id }, kind: before.kind, nameKey: set.nameKey, parentKey: before.parentKey || ''
      }).lean();
      if (dup) return res.status(409).json({ error: 'Ce nom existe déjà dans le catalogue' });
    }
    const item = await AtelierCatalog.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
    if (!item) return res.status(404).json({ error: 'Introuvable' });
    // Renaming a panne type keeps its interventions attached
    if (before && before.kind === 'panne' && set.nameKey !== before.nameKey) {
      await AtelierCatalog.updateMany(
        { kind: 'intervention', parentKey: before.nameKey },
        { $set: { parent: set.name, parentKey: set.nameKey } }
      );
    }
    res.json({ success: true, item });
  }));

  app.delete('/api/atelier/catalog/:id', checkAccess, wrap(async (req, res) => {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'id invalide' });
    const item = await AtelierCatalog.findByIdAndDelete(req.params.id);
    if (item && item.kind === 'panne') {
      await AtelierCatalog.deleteMany({ kind: 'intervention', parentKey: item.nameKey });
    }
    res.json({ success: true });
  }));

  app.get('/api/atelier/settings', checkAccess, wrap(async (req, res) => {
    const s = await AtelierCatalog.findOne({ kind: 'setting', nameKey: 'latedays' }).lean();
    res.json({ lateDays: s && Number(s.value) > 0 ? Number(s.value) : 3 });
  }));

  app.put('/api/atelier/settings', checkAccess, wrap(async (req, res) => {
    const n = Math.max(1, Math.min(60, parseInt((req.body || {}).lateDays, 10) || 3));
    const q = { kind: 'setting', nameKey: 'latedays', parentKey: '' };
    await AtelierCatalog.findOneAndUpdate(
      q, { $set: { name: 'lateDays', value: n }, $setOnInsert: q }, { upsert: true }
    );
    res.json({ success: true, lateDays: n });
  }));

  // ───────────────────────── VEHICLES (unified picker) ─────────────────────────
  app.get('/api/atelier/vehicles', checkAccess, wrap(async (req, res) => {
    const q = clean(req.query.q);
    const rx = q ? new RegExp(escRx(q), 'i') : null;
    const out = [];
    const trucks = await Truck.find(rx ? {
      $or: [{ truckName: rx }, { immatriculation: rx }, { chassisNumber: rx }, { trailer: rx }]
    } : {}).limit(300).lean();
    trucks.forEach(t => out.push({
      kind: 'camion', refId: String(t._id), deviceId: String(t.deviceId || ''),
      plate: t.immatriculation || t.truckName || '', name: t.truckName || '',
      chassis: t.chassisNumber || '', attachedTrailer: t.trailer || '', trailerType: t.trailerType || '',
      driver: t.driverName || '', situation: t.situation || ''
    }));
    const trailers = await Trailer.find(rx ? {
      $or: [{ immatriculation: rx }, { trailerId: rx }, { attachedTruckName: rx }, { type: rx }]
    } : {}).limit(300).lean();
    trailers.forEach(t => out.push({
      kind: 'remorque', refId: String(t._id), deviceId: '',
      plate: t.immatriculation || t.trailerId || '', name: (t.type || 'Remorque') + (t.brand ? ' ' + t.brand : ''),
      chassis: '', attachedTrailer: '', attachedTruck: t.attachedTruckName || '', situation: t.status || ''
    }));
    const lights = await LightVehicle.find(Object.assign({ active: true }, rx ? {
      $or: [{ plate: rx }, { name: rx }, { brand: rx }, { assignedTo: rx }]
    } : {})).limit(200).lean();
    lights.forEach(v => out.push({
      kind: 'vehicule', refId: String(v._id), deviceId: '', plate: v.plate,
      name: v.name || [v.brand, v.type].filter(Boolean).join(' '), chassis: v.chassis || '',
      attachedTrailer: '', assignedTo: v.assignedTo || '', situation: ''
    }));
    res.json(out);
  }));

  app.post('/api/atelier/vehicles', checkAccess, wrap(async (req, res) => {
    const b = req.body || {};
    const plate = clean(b.plate);
    if (!plate) return res.status(400).json({ error: 'Immatriculation requise' });
    const doc = await LightVehicle.findOneAndUpdate(
      { plateKey: norm(plate) },
      {
        $set: {
          plate, name: clean(b.name), brand: clean(b.brand), type: clean(b.type) || 'Véhicule léger',
          assignedTo: clean(b.assignedTo), chassis: clean(b.chassis), active: true
        },
        $setOnInsert: { plateKey: norm(plate) }
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, vehicle: doc });
  }));

  // ───────────────────────── BONS ─────────────────────────
  function buildVehicle(v) {
    v = v || {};
    return {
      kind: ['camion', 'remorque', 'vehicule'].includes(v.kind) ? v.kind : 'camion',
      refId: v.refId ? String(v.refId) : undefined,
      deviceId: v.deviceId ? String(v.deviceId) : undefined,
      plate: clean(v.plate), name: clean(v.name), chassis: clean(v.chassis),
      kmAtEntry: Math.max(0, Math.round(Number(v.kmAtEntry) || 0)),
      attachedTrailer: clean(v.attachedTrailer)
    };
  }

  app.get('/api/atelier/bons', checkAccess, wrap(async (req, res) => {
    const f = {};
    const { status, kind, q, from, to, intervenant } = req.query;
    if (status && status !== 'all') {
      f.status = status === 'actifs' ? { $ne: 'termine' } : status;
    }
    if (kind && kind !== 'all') f['vehicle.kind'] = kind;
    if (intervenant) f['lines.intervenant.name'] = new RegExp('^' + escRx(intervenant) + '$', 'i');
    if (from || to) {
      f.openedAt = {};
      if (from) f.openedAt.$gte = new Date(from);
      if (to) f.openedAt.$lte = new Date(to);
    }
    if (q) {
      const rx = new RegExp(escRx(clean(q)), 'i');
      f.$or = [
        { ref: rx }, { 'vehicle.plate': rx }, { 'vehicle.name': rx }, { panneType: rx },
        { 'lines.intervention': rx }, { 'lines.piece.designation': rx }, { 'lines.piece.sn': rx },
        { 'lines.piece.ref': rx }, { 'lines.intervenant.name': rx }
      ];
    }
    const bons = await AtelierBon.find(f).sort({ openedAt: -1 }).limit(Math.min(5000, Number(req.query.limit) || 1000)).lean();
    res.json(bons);
  }));

  app.get('/api/atelier/bons/:id', checkAccess, wrap(async (req, res) => {
    const id = req.params.id;
    const bon = await AtelierBon.findOne(isOid(id) ? { $or: [{ _id: id }, { ref: id }] } : { ref: id }).lean();
    if (!bon) return res.status(404).json({ error: 'Bon introuvable' });
    res.json(bon);
  }));

  app.post('/api/atelier/bons', checkAccess, wrap(async (req, res) => {
    const b = req.body || {};
    const vehicle = buildVehicle(b.vehicle);
    if (!vehicle.plate && !vehicle.name) return res.status(400).json({ error: 'Véhicule requis' });
    if (!clean(b.panneType)) return res.status(400).json({ error: 'Type de panne requis' });
    const openedAt = b.openedAt ? new Date(b.openedAt) : new Date();
    const year = openedAt.getFullYear();
    const bon = new AtelierBon({
      ref: await nextRef(year), year, vehicle, panneType: clean(b.panneType),
      description: clean(b.description), status: 'ouvert', openedAt,
      statusHistory: [{ status: 'ouvert', at: openedAt, by: clean(b.by) }],
      lines: sanitizeLines(b.lines), createdBy: clean(b.by)
    });
    await learnFromBon(bon);
    await bon.save();
    await setAvailability(vehicle, true);
    res.json({ success: true, bon: bon.toObject() });
  }));

  app.put('/api/atelier/bons/:id', checkAccess, wrap(async (req, res) => {
    const bon = await AtelierBon.findById(req.params.id);
    if (!bon) return res.status(404).json({ error: 'Bon introuvable' });
    const b = req.body || {};
    if (b.panneType !== undefined && clean(b.panneType)) bon.panneType = clean(b.panneType);
    if (b.description !== undefined) bon.description = clean(b.description);
    if (b.lines !== undefined) bon.lines = sanitizeLines(b.lines);
    if (b.openedAt) bon.openedAt = new Date(b.openedAt);
    if (b.vehicle && b.vehicle.kmAtEntry !== undefined) {
      bon.vehicle.kmAtEntry = Math.max(0, Math.round(Number(b.vehicle.kmAtEntry) || 0));
    }
    if (b.vehicle && b.vehicle.attachedTrailer !== undefined) bon.vehicle.attachedTrailer = clean(b.vehicle.attachedTrailer);
    await learnFromBon(bon);
    await bon.save();
    res.json({ success: true, bon: bon.toObject() });
  }));

  app.patch('/api/atelier/bons/:id/status', checkAccess, wrap(async (req, res) => {
    const bon = await AtelierBon.findById(req.params.id);
    if (!bon) return res.status(404).json({ error: 'Bon introuvable' });
    const b = req.body || {};
    if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Statut invalide' });
    if (b.status === bon.status) return res.json({ success: true, bon: bon.toObject(), vidange: null });
    const wasClosed = bon.status === 'termine';
    const now = b.at ? new Date(b.at) : new Date();
    bon.status = b.status;
    bon.statusHistory.push({ status: b.status, at: now, by: clean(b.by) });
    let vidange = null;
    if (b.status === 'termine') {
      bon.closedAt = now;
      bon.lines.forEach(l => { l.done = true; });
      bon.erpSync = { status: 'pending', lastAt: bon.erpSync && bon.erpSync.lastAt, erpBtRef: bon.erpSync && bon.erpSync.erpBtRef, error: '' };
      if (!bon.vidangeReset) {
        if (b.skipVidange === true) {
          vidange = { applied: false, reason: 'skipped' };
        } else {
          try {
            vidange = await applyVidangeReset(bon, b.kmAtClose, clean(b.by));
            if (vidange.applied) bon.vidangeReset = true;
          } catch (e) {
            console.error('[Atelier] applyVidangeReset error:', e.message);
            vidange = { applied: false, reason: 'error' };
          }
        }
      }
    } else {
      bon.closedAt = undefined;
    }
    await bon.save();
    if (b.status === 'termine') await setAvailability(bon.vehicle, false);
    else if (wasClosed) await setAvailability(bon.vehicle, true);
    res.json({ success: true, bon: bon.toObject(), vidange });
  }));

  app.delete('/api/atelier/bons/:id', checkAccess, wrap(async (req, res) => {
    const bon = await AtelierBon.findByIdAndDelete(req.params.id);
    if (bon && bon.status !== 'termine') await setAvailability(bon.vehicle, false);
    res.json({ success: true });
  }));

  // Vehicle history (all past bons of one vehicle, by plate or refId)
  app.get('/api/atelier/vehicle-history', checkAccess, wrap(async (req, res) => {
    const { plate, refId } = req.query;
    if (!plate && !refId) return res.status(400).json({ error: 'plate ou refId requis' });
    const or = [];
    if (plate) or.push({ 'vehicle.plate': new RegExp('^' + escRx(clean(plate)) + '$', 'i') });
    if (refId) or.push({ 'vehicle.refId': String(refId) });
    const bons = await AtelierBon.find({ $or: or }).sort({ openedAt: -1 }).lean();
    const snMap = [];
    bons.forEach(bn => (bn.lines || []).forEach(l => {
      if (l.piece && (l.piece.sn || l.piece.designation)) {
        snMap.push({
          bonRef: bn.ref, date: bn.closedAt || bn.openedAt, designation: l.piece.designation,
          family: l.piece.family, ref: l.piece.ref, sn: l.piece.sn, qty: l.piece.qty
        });
      }
    }));
    let repeat = false;
    for (let i = 0; i < bons.length - 1; i++) {
      if (new Date(bons[i].openedAt) - new Date(bons[i + 1].openedAt) <= 30 * DAY_MS) { repeat = true; break; }
    }
    res.json({ bons, pieces: snMap, repeatBreakdown: repeat, total: bons.length });
  }));

  // ───────────────────────── KPIs ─────────────────────────
  function waitPartMs(bon, nowMs) {
    const h = bon.statusHistory || [];
    const end = bon.closedAt ? new Date(bon.closedAt).getTime() : nowMs;
    let total = 0;
    for (let i = 0; i < h.length; i++) {
      if (h[i].status !== 'en_attente_piece') continue;
      const s = new Date(h[i].at).getTime();
      const e = i + 1 < h.length ? new Date(h[i + 1].at).getTime() : end;
      if (e > s) total += e - s;
    }
    return total;
  }

  function topN(map, n, keyName) {
    return Object.keys(map).map(k => Object.assign({ [keyName]: k }, map[k]))
      .sort((a, b) => b.count - a.count).slice(0, n);
  }

  async function computeKpis() {
    const s = await AtelierCatalog.findOne({ kind: 'setting', nameKey: 'latedays' }).lean();
    const lateDays = s && Number(s.value) > 0 ? Number(s.value) : 3;
    const bons = await AtelierBon.find({}).lean();
    const nowMs = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    const counts = { ouvert: 0, en_cours: 0, en_attente_piece: 0, termine: 0 };
    const month = { ouvert: 0, en_cours: 0, en_attente_piece: 0, termine: 0, total: 0 };
    const down = [], late = [];
    let closedCount = 0, closedMs = 0, waitCount = 0, waitMs = 0;
    const perVehicle = {}, pannes = {}, intervenants = {}, pieces = {}, byPlate = {};

    bons.forEach(b => {
      const opened = new Date(b.openedAt).getTime();
      const end = b.closedAt ? new Date(b.closedAt).getTime() : nowMs;
      const dur = Math.max(0, end - opened);
      counts[b.status] = (counts[b.status] || 0) + 1;
      if (opened >= monthStart) { month[b.status]++; month.total++; }

      const plate = (b.vehicle && (b.vehicle.plate || b.vehicle.name)) || '—';
      const pv = perVehicle[plate] || (perVehicle[plate] = { count: 0, ms: 0, kind: b.vehicle && b.vehicle.kind });
      pv.count++; pv.ms += dur;
      (byPlate[plate] || (byPlate[plate] = [])).push(opened);

      const pn = b.panneType || '—';
      (pannes[pn] || (pannes[pn] = { count: 0 })).count++;

      if (b.status !== 'termine') {
        const ageDays = (nowMs - opened) / DAY_MS;
        const row = {
          ref: b.ref, id: String(b._id), plate, name: b.vehicle && b.vehicle.name, kind: b.vehicle && b.vehicle.kind,
          panneType: b.panneType, status: b.status, openedAt: b.openedAt, ageDays: Math.round(ageDays * 10) / 10
        };
        down.push(row);
        if (ageDays > lateDays) late.push(row);
      } else {
        closedCount++; closedMs += dur;
      }
      const w = waitPartMs(b, nowMs);
      if (w > 0) { waitCount++; waitMs += w; }

      const seen = {};
      (b.lines || []).forEach(l => {
        const nm = l.intervenant && l.intervenant.name;
        if (nm) {
          const it = intervenants[nm] || (intervenants[nm] = { count: 0, lines: 0, closed: 0, closedMs: 0, type: l.intervenant.type });
          it.lines++;
          if (!seen[nm]) { seen[nm] = true; it.count++; if (b.status === 'termine') { it.closed++; it.closedMs += dur; } }
        }
        const pd = l.piece && l.piece.designation;
        if (pd) {
          const pc = pieces[pd] || (pieces[pd] = { count: 0, family: l.piece.family || '' });
          pc.count += l.piece.qty || 1;
        }
      });
    });

    const repeat = [];
    Object.keys(byPlate).forEach(p => {
      const t = byPlate[p].sort((a, b) => a - b);
      let n = 0;
      for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] <= 30 * DAY_MS) n++;
      if (n > 0) repeat.push({ plate: p, bons: t.length, repeats: n });
    });
    repeat.sort((a, b) => b.repeats - a.repeats);

    return {
      lateDays, counts, month, downNow: down.sort((a, b) => b.ageDays - a.ageDays), late,
      vehiclesDown: new Set(down.map(d => d.plate)).size,
      mttrDays: closedCount ? Math.round(closedMs / closedCount / DAY_MS * 10) / 10 : 0,
      waitPartAvgDays: waitCount ? Math.round(waitMs / waitCount / DAY_MS * 10) / 10 : 0,
      daysDownPerVehicle: Object.keys(perVehicle).map(p => ({
        plate: p, kind: perVehicle[p].kind, bons: perVehicle[p].count, days: Math.round(perVehicle[p].ms / DAY_MS * 10) / 10
      })).sort((a, b) => b.days - a.days).slice(0, 15),
      topPannes: topN(pannes, 10, 'panne'),
      repeatBreakdowns: repeat.slice(0, 15),
      intervenants: Object.keys(intervenants).map(n => ({
        name: n, type: intervenants[n].type, bons: intervenants[n].count, interventions: intervenants[n].lines,
        avgResolutionDays: intervenants[n].closed ? Math.round(intervenants[n].closedMs / intervenants[n].closed / DAY_MS * 10) / 10 : null
      })).sort((a, b) => b.bons - a.bons),
      topPieces: topN(pieces, 10, 'designation'),
      totalBons: bons.length
    };
  }

  app.get('/api/atelier/kpis', checkAccess, wrap(async (req, res) => {
    res.json(await computeKpis());
  }));

  // Overdue alerts: open bons older than the late threshold (lightweight, polled by the UI)
  app.get('/api/atelier/alerts', checkAccess, wrap(async (req, res) => {
    const s = await AtelierCatalog.findOne({ kind: 'setting', nameKey: 'latedays' }).lean();
    const lateDays = s && Number(s.value) > 0 ? Number(s.value) : 3;
    const bons = await AtelierBon.find({ status: { $ne: 'termine' } })
      .select('ref vehicle.plate vehicle.name vehicle.kind panneType status openedAt').lean();
    const nowMs = Date.now();
    const late = bons.map(b => ({
      ref: b.ref, id: String(b._id),
      plate: (b.vehicle && (b.vehicle.plate || b.vehicle.name)) || '—',
      kind: b.vehicle && b.vehicle.kind, panneType: b.panneType, status: b.status,
      openedAt: b.openedAt, ageDays: Math.round((nowMs - new Date(b.openedAt).getTime()) / DAY_MS * 10) / 10
    })).filter(r => r.ageDays > lateDays).sort((a, b) => b.ageDays - a.ageDays);
    res.json({ lateDays, openCount: bons.length, count: late.length, late });
  }));

  // ───────────────────────── ERP INTEGRATION (API key) ─────────────────────────
  function safeEq(a, b) {
    const A = Buffer.from(String(a)), B = Buffer.from(String(b));
    return A.length === B.length && crypto.timingSafeEqual(A, B);
  }

  // Accepts: header x-api-key  |  Authorization: Bearer <key>  |  ?token=<key>
  async function integrationAuth(req, res, next) {
    const authz = String(req.headers['authorization'] || '');
    const bearer = /^Bearer\s+(.+)$/i.test(authz) ? authz.replace(/^Bearer\s+/i, '').trim() : '';
    const tok = req.headers['x-api-key'] || bearer || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Clé API manquante (header x-api-key)' });
    try {
      const envTok = process.env.ERP_INTEGRATION_TOKEN;
      if (envTok && safeEq(tok, envTok)) return next();
      const doc = await ApiKey.findOne({ token: String(tok) }).lean();
      if (!doc) return res.status(403).json({ error: 'Clé API invalide ou révoquée' });
      next();
    } catch (e) {
      res.status(500).json({ error: 'Auth Error' });
    }
  }

  function shapeBon(b) {
    return {
      ref: b.ref, vehicle: b.vehicle, panneType: b.panneType, description: b.description,
      status: b.status, openedAt: b.openedAt, closedAt: b.closedAt, statusHistory: b.statusHistory,
      lines: (b.lines || []).map(l => ({
        intervention: l.intervention, intervenant: l.intervenant && l.intervenant.name,
        intervenantType: l.intervenant && l.intervenant.type, isVidange: l.isVidange,
        piece: l.piece
      })),
      erpSync: b.erpSync
    };
  }

  // Connectivity / key check for the ERP
  app.get('/api/integration/ping', integrationAuth, (req, res) => {
    res.json({ ok: true, service: 'fleet-atelier', time: new Date().toISOString() });
  });

  // Closed bons with pieces/SN, for the ERP to pull
  // ?since=ISO (closedAt >=)  &pending=1 (not yet acked)  &limit=1..1000  &skip=N
  app.get('/api/integration/bons', integrationAuth, wrap(async (req, res) => {
    const f = { status: 'termine' };
    if (req.query.since) {
      const d = new Date(req.query.since);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Paramètre since invalide (ISO 8601 attendu)' });
      f.closedAt = { $gte: d };
    }
    if (req.query.pending === '1') f['erpSync.status'] = { $ne: 'synced' };
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 1000));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const total = await AtelierBon.countDocuments(f);
    const bons = await AtelierBon.find(f).sort({ closedAt: 1, _id: 1 }).skip(skip).limit(limit).lean();
    res.json({ total, count: bons.length, skip, limit, bons: bons.map(shapeBon) });
  }));

  // One bon by reference (BR-YYYY-####)
  app.get('/api/integration/bons/:ref', integrationAuth, wrap(async (req, res) => {
    const bon = await AtelierBon.findOne({ ref: String(req.params.ref) }).lean();
    if (!bon) return res.status(404).json({ error: 'Bon introuvable' });
    res.json(shapeBon(bon));
  }));

  // Fleet master list (camions + remorques + véhicules légers) for ERP Fleet sync
  app.get('/api/integration/vehicles', integrationAuth, wrap(async (req, res) => {
    const out = [];
    (await Truck.find({}).lean()).forEach(t => out.push({
      kind: 'camion', externalId: String(t.deviceId || t._id), plate: t.immatriculation || '', name: t.truckName || '',
      chassis: t.chassisNumber || '', trailer: t.trailer || '', driver: t.driverName || ''
    }));
    (await Trailer.find({}).lean()).forEach(t => out.push({
      kind: 'remorque', externalId: String(t.trailerId || t._id), plate: t.immatriculation || '',
      name: t.type || 'Remorque', chassis: '', trailer: '', driver: ''
    }));
    (await LightVehicle.find({ active: true }).lean()).forEach(v => out.push({
      kind: 'vehicule', externalId: String(v._id), plate: v.plate, name: v.name || v.brand || '',
      chassis: v.chassis || '', trailer: '', driver: v.assignedTo || ''
    }));
    const kind = String(req.query.kind || '').toLowerCase();
    const list = ['camion', 'remorque', 'vehicule'].includes(kind) ? out.filter(v => v.kind === kind) : out;
    res.json({ count: list.length, vehicles: list });
  }));

  // ERP acknowledges it has processed the bon (stock deduction / bon de travail created).
  // Body: { erpBtRef?: string, status?: 'synced'|'failed', error?: string }
  // Only closed bons can be acknowledged. Idempotent.
  app.post('/api/integration/bons/:ref/ack', integrationAuth, wrap(async (req, res) => {
    const b = req.body || {};
    const st = b.status == null ? 'synced' : String(b.status);
    if (st !== 'synced' && st !== 'failed') return res.status(400).json({ error: "status doit être 'synced' ou 'failed'" });
    const bon = await AtelierBon.findOne({ ref: String(req.params.ref) });
    if (!bon) return res.status(404).json({ error: 'Bon introuvable' });
    if (bon.status !== 'termine') return res.status(409).json({ error: 'Bon non terminé — ack impossible', status: bon.status });
    bon.erpSync = {
      status: st,
      lastAt: new Date(),
      erpBtRef: clean(b.erpBtRef) || (bon.erpSync && bon.erpSync.erpBtRef) || '',
      error: st === 'failed' ? clean(b.error).slice(0, 500) : ''
    };
    await bon.save();
    res.json({ success: true, ref: bon.ref, erpSync: bon.erpSync });
  }));

  console.log('✅ Atelier Biskra routes mounted (/api/atelier/*, /api/integration/*)');
};
