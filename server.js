const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// --- 1. CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const GPS_API_URL = 'https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_LOCATIONS,*';
const DB_URI = process.env.MONGO_URI || "mongodb+srv://MrNoBoDy:123Chikh1994@cluster0.cljee0n.mongodb.net/fleet_db?retryWrites=true&w=majority&appName=Cluster0";

// --- 2. DATA MODELS ---
const AccessCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  note: String
});
const AccessCode = mongoose.model('AccessCode', AccessCodeSchema);

const TruckSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true },
  truckName: String,
  lastUpdate: Number,
  lastFuelLiters: Number,
  lastFuelPercent: Number,
  lat: Number, lng: Number, speed: Number,
  zone: String, entryTime: Number,
  hasLogged: Boolean, logId: String,
  params: Object,
  // 🔧 FIX: engineState replaces refuelSession for cleaner engine-off monitoring
  engineState: Object
}, { strict: false });

const expireRule = { expires: '90d' };

const RefuelSchema = new mongoose.Schema({
  deviceId: String, truckName: String,
  addedLiters: Number, oldLevel: Number, newLevel: Number,
  timestamp: { type: Date, required: true, index: expireRule },
  locationRaw: String, isInternal: Boolean,
  lat: Number, lng: Number
});

const MaintenanceSchema = new mongoose.Schema({
  truckName: String, deviceId: String, type: String,
  location: String, odometer: Number,
  date: { type: Date, required: true, index: expireRule },
  exitDate: Date, note: String, isAuto: Boolean
});

// 🔧 FIX: Added locationName field; removed mandatory status (simplified)
const DecouchageSchema = new mongoose.Schema({
  date: String,
  snapshotTime: { type: Date, required: true, index: expireRule },
  deviceId: String, truckName: String,
  locationAtMidnight: { lat: Number, lng: Number },
  locationName: String,
  distanceFromSite: Number,
  isClosed: Boolean
});

const SettingsSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  customLocations: Array,
  maintenanceRules: Object,
  defaultConfig: Object,
  fleetRules: Array,
  lastDecouchageCheck: String
}, { strict: false });

const Truck = mongoose.model('Truck', TruckSchema);
const Refuel = mongoose.model('Refuel', RefuelSchema);
const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);
const Decouchage = mongoose.model('Decouchage', DecouchageSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// --- 3. SMART CACHE ---
let SYSTEM_SETTINGS = {
  customLocations: [],
  maintenanceRules: { minDurationMinutes: 60, vidangeKmTolerance: 3000 },
  defaultConfig: { fuelTankCapacity: 600, fuelConsumption: 35 },
  fleetRules: [],
  lastDecouchageCheck: null
};

// --- 4. HELPERS ---
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180, phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180, dLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTruckConfig(deviceId) {
  const globalDefault = SYSTEM_SETTINGS.defaultConfig || {};
  let specificConfig = {};
  if (SYSTEM_SETTINGS.fleetRules && Array.isArray(SYSTEM_SETTINGS.fleetRules)) {
    const matchedRule = SYSTEM_SETTINGS.fleetRules.find(rule =>
      rule.truckIds && rule.truckIds.includes(deviceId.toString())
    );
    if (matchedRule && matchedRule.config) specificConfig = matchedRule.config;
  }
  return { ...globalDefault, ...specificConfig };
}

// 🔧 NEW: calculateVidangeStatus (same as config.js helper, used server-side)
function calculateVidangeStatus(currentOdometer, config) {
  if (!config.vidangeMilestones) return { alert: false, kmUntilNext: 999999 };
  let milestones = [];
  if (typeof config.vidangeMilestones === 'string') {
    milestones = config.vidangeMilestones.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).sort((a, b) => a - b);
  } else if (Array.isArray(config.vidangeMilestones)) {
    milestones = config.vidangeMilestones;
  }
  const nextMilestone = milestones.find(m => m > currentOdometer);
  if (!nextMilestone) return { alert: false, kmUntilNext: 999999 };
  const kmUntilNext = nextMilestone - currentOdometer;
  const alertKm = config.vidangeAlertKm || 5000;
  return { alert: kmUntilNext <= alertKm, nextKm: nextMilestone, kmUntilNext, alertKm };
}

const fmt = (list) => list.map(d => {
  const o = d.toObject ? d.toObject() : d;
  o.id = (o._id || '').toString();
  if (o.lat) o.lat = parseFloat(o.lat);
  if (o.lng) o.lng = parseFloat(o.lng);
  if (o.locationAtMidnight) {
    o.locationAtMidnight.lat = parseFloat(o.locationAtMidnight.lat);
    o.locationAtMidnight.lng = parseFloat(o.locationAtMidnight.lng);
  }
  delete o._id;
  return o;
});

// --- 5. SETTINGS LOAD/SAVE ---
async function loadSettings() {
  try {
    let doc = await Settings.findOne({ id: 'global' });
    if (!doc) doc = await Settings.create({ id: 'global', ...SYSTEM_SETTINGS });
    SYSTEM_SETTINGS = { ...SYSTEM_SETTINGS, ...doc.toObject() };
  } catch (e) { console.error("Settings Load Error:", e.message); }
}

async function saveSettings() {
  try {
    await Settings.findOneAndUpdate({ id: 'global' }, SYSTEM_SETTINGS, { upsert: true });
  } catch (e) { console.error("Settings Save Error:", e.message); }
}

// ============================================================
// 🔧 FIX #1: VIDANGE AUTO-DETECTION AT MAINTENANCE LOCATIONS
// ============================================================
// Called each bot cycle per truck. Checks if truck is inside a
// maintenance-type zone ('maintenance' only) and has been there long enough to log.
// NOTE: 'douroub' zones are home base — they do NOT trigger maintenance logging.
async function runVidangeDetection(truck, dbTruck, config) {
  const deviceId = String(truck.id || truck.imei);
  const truckName = truck.name;
  const now = Date.now();

  // CORRECT: Only 'maintenance' zones trigger vidange/maintenance auto-detection
  // 'douroub' = your own home base = safe zone for découchage ONLY, unrelated to maintenance
  const maintLocations = (SYSTEM_SETTINGS.customLocations || []).filter(
    l => l.type === 'maintenance'
  );
  if (maintLocations.length === 0) return;

  const odometerMeters = parseInt(truck.params?.io192 || 0);
  const odometerKm = Math.round(odometerMeters / 1000);
  const vidangeStatus = calculateVidangeStatus(odometerKm, config);
  const minDurationMs = (SYSTEM_SETTINGS.maintenanceRules?.minDurationMinutes || 60) * 60000;

  // Check if truck is inside any zone
  let currentZone = null;
  for (const loc of maintLocations) {
    const dist = calculateDistance(parseFloat(truck.lat), parseFloat(truck.lng), loc.lat, loc.lng);
    if (dist <= (loc.radius || 500)) {
      currentZone = loc;
      break;
    }
  }

  if (currentZone) {
    // Truck is inside a maintenance zone
    if (!dbTruck.zone || dbTruck.zone !== currentZone.name) {
      // ENTRY: Just arrived - start timer
      await Truck.findOneAndUpdate({ deviceId }, {
        zone: currentZone.name,
        entryTime: now,
        hasLogged: false
      });
      console.log(`📍 ${truckName} entered zone: ${currentZone.name}`);
    } else if (!dbTruck.hasLogged && dbTruck.entryTime && (now - dbTruck.entryTime) >= minDurationMs) {
      // DURATION MET: Stayed long enough → determine maintenance type
      let maintenanceType = 'Maintenance Générale';
      if (vidangeStatus.alert) {
        maintenanceType = 'Vidange';
      }

      // Anti-duplicate: don't log same type twice in 24h
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
      const recentLog = await Maintenance.findOne({
        deviceId,
        type: maintenanceType,
        date: { $gte: oneDayAgo }
      });

      if (!recentLog) {
        const durationMins = Math.round((now - dbTruck.entryTime) / 60000);
        await Maintenance.create({
          truckName, deviceId,
          type: maintenanceType,
          location: currentZone.name,
          odometer: odometerKm,
          date: new Date(dbTruck.entryTime),
          isAuto: true,
          note: `Auto-détecté: ${durationMins} min sur place (${currentZone.name})`
        });
        await Truck.findOneAndUpdate({ deviceId }, { hasLogged: true });
        console.log(`🔧 AUTO ${maintenanceType}: ${truckName} at ${currentZone.name} (${durationMins}min, ${odometerKm}km)`);
      } else {
        // Mark as logged to stop repeat checks
        await Truck.findOneAndUpdate({ deviceId }, { hasLogged: true });
      }
    }
  } else {
    // Truck is OUTSIDE all zones - reset zone tracking
    if (dbTruck.zone) {
      await Truck.findOneAndUpdate({ deviceId }, { zone: null, entryTime: null, hasLogged: false });
    }
  }
}

// ============================================================
// 🔧 FIX #2: DÉCOUCHAGE LOGIC - Simplified + Correct Date Rule
// ============================================================
// Rules:
// - Runs during 00:00–06:30 Algeria time (window to catch all overnight stops)
// - Date assigned = PREVIOUS DAY (e.g., detection at 00:05 Jan 18 → logged as Jan 17)
// - A truck is découchage if: outside all Douroub zones AND engine is off/stopped
// - No more confirmée/non-confirmée — just simple recording
async function runDecouchageLogic(trucks) {
  const nowUTC = new Date();
  // Algeria = UTC+1
  const dzTime = new Date(nowUTC.getTime() + 3600000);
  const dzHour = dzTime.getUTCHours();

  // Only run between 00:00 and 06:30 Algeria time
  if (dzHour < 0 || dzHour >= 7) return;

  // The "logic date" = yesterday (the night we are reporting for)
  const logicDate = new Date(dzTime);
  logicDate.setDate(logicDate.getDate() - 1);
  const logicDateStr = logicDate.toISOString().split('T')[0];

  // Safe zones = all "douroub" type locations
  const safeZones = (SYSTEM_SETTINGS.customLocations || []).filter(l => l.type === 'douroub');

  for (const t of trucks) {
    if (!t.params || !t.lat || !t.lng) continue;
    const deviceId = String(t.id || t.imei);

    // Check if truck is at a safe zone
    let isSafe = false;
    let closestDist = Infinity;

    for (const zone of safeZones) {
      const dist = calculateDistance(parseFloat(t.lat), parseFloat(t.lng), zone.lat, zone.lng);
      if (dist <= (zone.radius || 500)) {
        isSafe = true;
        break;
      }
      if (dist < closestDist) closestDist = dist;
    }

    if (isSafe) continue; // Safe at site → not découchage

    // 🔧 FIX: Only record if engine is OFF (truly stopped overnight)
    const ign = parseInt(t.params?.io1 ?? t.params?.acc ?? 0);
    const spd = parseInt(t.speed) || 0;
    const isStopped = (ign === 0 && spd === 0);
    if (!isStopped) continue;

    // Avoid duplicate: one record per truck per date
    const existing = await Decouchage.findOne({ date: logicDateStr, deviceId });
    if (existing) continue;

    // Find location name (if near any known zone)
    let locationName = null;
    for (const loc of (SYSTEM_SETTINGS.customLocations || [])) {
      const dist = calculateDistance(parseFloat(t.lat), parseFloat(t.lng), loc.lat, loc.lng);
      if (dist <= (loc.radius || 500)) {
        locationName = loc.name;
        break;
      }
    }

    const finalDist = safeZones.length > 0 ? Math.round(closestDist) : 0;

    await Decouchage.create({
      date: logicDateStr,
      snapshotTime: nowUTC,
      deviceId,
      truckName: t.name,
      locationAtMidnight: { lat: parseFloat(t.lat), lng: parseFloat(t.lng) },
      locationName: locationName || `Hors Site (${parseFloat(t.lat).toFixed(4)}, ${parseFloat(t.lng).toFixed(4)})`,
      distanceFromSite: finalDist,
      isClosed: true
    });

    console.log(`🌙 Découchage [${logicDateStr}]: ${t.name} → ${locationName || 'position inconnue'}`);
  }
}

// ============================================================
// 🔧 FIX #3: MAIN BOT — Corrected Refuel Detection Engine
// ============================================================
async function runFleetBot() {
  await loadSettings();

  let rawData = {};
  try {
    const response = await fetch(GPS_API_URL);
    const json = await response.json();
    rawData = json.data || json;
  } catch (e) {
    console.error("⚠️ Bot Fetch Error:", e.message);
    setTimeout(runFleetBot, 30000);
    return;
  }

  const now = Date.now();
  const truckArray = Array.isArray(rawData)
    ? rawData
    : Object.entries(rawData).map(([id, val]) => ({ ...val, id }));

  // Run night découchage logic
  await runDecouchageLogic(truckArray);

  for (const truck of truckArray) {
    const deviceId = String(truck.id || truck.imei);
    if (!truck.params || deviceId === "undefined") continue;

    const truckName = truck.name;
    const config = getTruckConfig(deviceId);
    const capacity = config.fuelTankCapacity || 600;

    // --- FUEL CALCULATION ---
    let rawVal = parseFloat(truck.params.io87 || truck.params.fuel || truck.params.io84 || 0);
    if (rawVal > 100) rawVal = 100;
    if (rawVal < 0) rawVal = 0;
    const currentLiters = Math.round((rawVal / 100) * capacity);

    // --- ENGINE STATE DETECTION ---
    // io1 = ignition key, acc = accessory power
    const ignRaw = truck.params?.io1 ?? truck.params?.acc ?? 0;
    const ignOn = parseInt(ignRaw) === 1;
    const speed = parseInt(truck.speed) || 0;
    const engineIsOn = ignOn || speed > 5; // Engine on = ignition OR moving

    const truckLat = parseFloat(truck.lat);
    const truckLng = parseFloat(truck.lng);

    let dbTruck = await Truck.findOne({ deviceId });

    if (!dbTruck) {
      // First time seeing this truck
      await Truck.findOneAndUpdate({ deviceId }, {
        truckName, lastUpdate: now,
        lastFuelLiters: currentLiters,
        lat: truckLat, lng: truckLng,
        speed, params: truck.params,
        engineState: {
          isOff: !engineIsOn,
          fuelAtOff: currentLiters,
          latAtOff: truckLat,
          lngAtOff: truckLng,
          offTime: now
        }
      }, { upsert: true });
      continue;
    }

    let needsUpdate = false;
    let engineState = dbTruck.engineState || {
      isOff: false,
      fuelAtOff: currentLiters,
      latAtOff: truckLat,
      lngAtOff: truckLng,
      offTime: now
    };

    let payload = {
      truckName, lastUpdate: now,
      lat: truckLat, lng: truckLng,
      speed, params: truck.params
    };

    // ============================================================
    // 🔧 ENGINE-OFF → ENGINE-ON REFUEL DETECTION (Simplified)
    // Logic:
    //   1. Engine turns OFF  → snapshot fuel level + GPS position
    //   2. While OFF          → track the LOWEST fuel (in case sensor dips)
    //   3. Engine turns ON   → compare current fuel with snapshot
    //   4. If diff ≥ 50L     → confirmed refill, save to DB
    // ============================================================

    if (!engineIsOn) {
      // ENGINE IS OFF
      if (!engineState.isOff) {
        // 🔴 Just turned OFF — take snapshot
        engineState.isOff = true;
        engineState.fuelAtOff = currentLiters;
        engineState.latAtOff = truckLat;
        engineState.lngAtOff = truckLng;
        engineState.offTime = now;
        needsUpdate = true;
        console.log(`🔴 ${truckName}: Engine OFF. Fuel snapshot: ${currentLiters}L`);
      } else {
        // Already off — update fuel snapshot if it DROPS (sensor noise protection)
        // Only lower the baseline if fuel decreases significantly (>15L natural drop = odd)
        if (currentLiters < engineState.fuelAtOff - 15) {
          engineState.fuelAtOff = currentLiters;
          needsUpdate = true;
        }
      }
      payload.lastFuelLiters = currentLiters;

    } else {
      // ENGINE IS ON
      if (engineState.isOff) {
        // 🟢 Just turned ON — compare fuel with snapshot
        const fuelDiff = currentLiters - engineState.fuelAtOff;

        console.log(`🟢 ${truckName}: Engine ON. Fuel now: ${currentLiters}L, was: ${engineState.fuelAtOff}L, diff: ${fuelDiff}L`);

        if (fuelDiff >= 50) {
          // ✅ REFILL CONFIRMED (≥50L added while engine was off)

          // 🔧 FIX: Anti-duplicate: check last 5 MINUTES only (was 30 min — too broad)
          const fiveMinsAgo = new Date(now - 5 * 60 * 1000);
          const recentRefill = await Refuel.findOne({
            deviceId,
            timestamp: { $gte: fiveMinsAgo }
          });

          if (!recentRefill) {
            // 🔧 FIX: Use STORED GPS position at engine-off time (was using wrong coords)
            const refillLat = engineState.latAtOff || truckLat;
            const refillLng = engineState.lngAtOff || truckLng;

            // Detect location from stored stop position
            let locName = "Station Externe";
            let isInternal = false;
            for (const loc of (SYSTEM_SETTINGS.customLocations || [])) {
              const d = calculateDistance(refillLat, refillLng, loc.lat, loc.lng);
              if (d <= (loc.radius || 500)) {
                locName = loc.name;
                isInternal = true;
                break;
              }
            }

            await Refuel.create({
              deviceId, truckName,
              addedLiters: Math.round(fuelDiff),
              oldLevel: engineState.fuelAtOff,
              newLevel: currentLiters,
              timestamp: new Date(),
              locationRaw: locName,
              lat: refillLat, lng: refillLng,
              isInternal
            });

            console.log(`⛽ REFILL: ${truckName} +${Math.round(fuelDiff)}L @ ${locName}`);
          } else {
            console.log(`⚠️ ${truckName}: Duplicate refill ignored (+${Math.round(fuelDiff)}L within 5min)`);
          }
        } else if (fuelDiff < -30) {
          // Fuel dropped significantly while engine was off → possible siphoning
          console.log(`⚠️ ${truckName}: Fuel DROP detected while engine was off! (${Math.round(fuelDiff)}L)`);
        }

        // Reset engine state to ON
        engineState.isOff = false;
        engineState.fuelAtOff = currentLiters;
        engineState.latAtOff = truckLat;
        engineState.lngAtOff = truckLng;
        needsUpdate = true;
      }

      payload.lastFuelLiters = currentLiters;
    }

    payload.engineState = engineState;

    // Run vidange/maintenance zone detection
    const freshDbTruck = needsUpdate ? { ...dbTruck.toObject(), ...payload } : dbTruck;
    await runVidangeDetection(truck, freshDbTruck, config);

    // Save to DB if changed or position moved significantly
    const distMoved = calculateDistance(truckLat, truckLng, dbTruck.lat || 0, dbTruck.lng || 0);
    if (needsUpdate || distMoved > 50 || (now - dbTruck.lastUpdate) > 60000) {
      await Truck.findOneAndUpdate({ deviceId }, payload, { upsert: true });
    }
  }

  setTimeout(runFleetBot, 30000);
}

async function closeMaintenanceSession(logId, truckName, exitTimeMs) {
  try {
    const doc = await Maintenance.findById(logId);
    if (doc && !doc.exitDate) {
      const dur = ((exitTimeMs - new Date(doc.date).getTime()) / 3600000).toFixed(1);
      await Maintenance.findByIdAndUpdate(logId, {
        exitDate: new Date(exitTimeMs),
        note: `Terminé (Durée: ${dur}h)`
      });
      console.log(`🏁 Closed Maintenance session for ${truckName}`);
    }
  } catch (e) { console.error("Close Session Error:", e.message); }
}

// --- MIDDLEWARE: THE GATEKEEPER ---
async function checkAccess(req, res, next) {
  const userCode = req.headers['x-access-code'];
  if (!userCode) return res.status(401).json({ error: "Access Denied: No Code" });
  try {
    const isValid = await AccessCode.findOne({ code: userCode });
    if (isValid) next();
    else return res.status(403).json({ error: "Access Denied: Invalid/Expired Code" });
  } catch (e) { res.status(500).json({ error: "Auth Error" }); }
}

// --- AUDIT REPORTS MODEL ---
const AuditSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  truckName: String, truckId: String,
  periodStart: String, periodEnd: String,
  stats: { uptime: String, downtime: String, sleep: String, score: String },
  incidents: Array,
  parkings: Array
});
const AuditReport = mongoose.model('AuditReport', AuditSchema);

// --- 6. API ROUTES ---
app.get('/health', (req, res) => res.send('System Operational'));

app.get('/api/admin/add-code/:code', async (req, res) => {
  const MASTER_SECRET = "Douroub_2025_Admin_Secure";
  if (req.query.secret !== MASTER_SECRET) return res.status(403).send("⛔ Accès Interdit.");
  try {
    await AccessCode.create({ code: req.params.code, note: "Admin" });
    res.send(`✅ Code ${req.params.code} added!`);
  } catch (e) { res.send("❌ Error: Duplicate or DB Error."); }
});

app.get('/api/trucks', checkAccess, async (req, res) => {
  try {
    const r = await fetch(GPS_API_URL);
    const j = await r.json();
    res.json(j);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/settings', checkAccess, (req, res) => res.json(SYSTEM_SETTINGS));
app.post('/api/settings', checkAccess, async (req, res) => {
  SYSTEM_SETTINGS = { ...SYSTEM_SETTINGS, ...req.body };
  await saveSettings();
  res.json({ success: true });
});

app.get('/api/maintenance', checkAccess, async (req, res) => {
  const data = await Maintenance.find().sort({ date: -1 }).limit(200);
  res.json(fmt(data));
});
app.post('/api/maintenance/add', checkAccess, async (req, res) => {
  await Maintenance.create(req.body);
  res.json({ success: true });
});
app.post('/api/maintenance/update', checkAccess, async (req, res) => {
  try {
    const { id, type, note, odometer, isAuto } = req.body;
    const doc = await Maintenance.findById(id);
    if (!doc) return res.status(404).json({ error: "Introuvable" });
    doc.type = type || doc.type;
    doc.note = note !== undefined ? note : doc.note;
    doc.odometer = odometer || doc.odometer;
    if (isAuto !== undefined) doc.isAuto = isAuto;
    await doc.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/maintenance/delete', checkAccess, async (req, res) => {
  await Maintenance.findByIdAndDelete(req.body.id);
  res.json({ success: true });
});

app.get('/api/refuels', checkAccess, async (req, res) => {
  const data = await Refuel.find().sort({ timestamp: -1 }).limit(200);
  res.json(fmt(data));
});

// 🔧 FIX: Découchage route returns clean data without status complexity
app.get('/api/decouchages', checkAccess, async (req, res) => {
  const data = await Decouchage.find().sort({ date: -1 }).limit(300);
  res.json(fmt(data));
});

app.get('/api/history', checkAccess, async (req, res) => {
  const { imei, start, end } = req.query;
  const safeStart = start.replace(' ', '%20');
  const safeEnd = end.replace(' ', '%20');
  const url = `https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_MESSAGES,${imei},${safeStart},${safeEnd}`;
  console.log("📡 FETCHING HISTORY:", url);
  try {
    const https = require('https');
    const agent = new https.Agent({ rejectUnauthorized: false });
    const r = await fetch(url, { agent });
    const text = await r.text();
    try {
      const json = JSON.parse(text);
      res.json(json);
    } catch (parseError) {
      res.status(502).json({ error: "Provider Error", details: text });
    }
  } catch (e) {
    res.status(500).json({ error: "Server Error", details: e.message });
  }
});

app.get('/api/backup/download', checkAccess, async (req, res) => {
  try {
    const dbData = {
      version: "2.2",
      date: new Date(),
      truck_states: await Truck.find(),
      settings: await Settings.find(),
      refuels: await Refuel.find(),
      maintenance: await Maintenance.find(),
      decouchages: await Decouchage.find()
    };
    res.json(dbData);
  } catch (e) { res.status(500).send(e.message); }
});

// AUDIT ROUTES
app.post('/api/audit/save', checkAccess, async (req, res) => {
  try {
    const report = new AuditReport(req.body);
    await report.save();
    res.json({ success: true, id: report._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/audit/list', checkAccess, async (req, res) => {
  try {
    const list = await AuditReport.find({}, 'date truckName periodStart periodEnd stats.score').sort({ date: -1 }).limit(50);
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/audit/:id', checkAccess, async (req, res) => {
  try {
    const report = await AuditReport.findById(req.params.id);
    res.json(report);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/audit/:id', checkAccess, async (req, res) => {
  try {
    await AuditReport.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN TOOLS
app.get('/api/admin/repair', checkAccess, async (req, res) => {
  try {
    const refuels = await Refuel.find({ $or: [{ deviceId: "undefined" }, { lat: null }] });
    let count = 0;
    for (const log of refuels) {
      const truck = await Truck.findOne({ truckName: log.truckName });
      if (truck) {
        log.deviceId = truck.deviceId;
        if (!log.lat && log.locationRaw && log.locationRaw.includes("GPS:")) {
          const coords = log.locationRaw.match(/-?\d+\.\d+/g);
          if (coords && coords.length >= 2) {
            log.lat = parseFloat(coords[0]);
            log.lng = parseFloat(coords[1]);
          }
        }
        await log.save();
        count++;
      }
    }
    res.json({ success: true, message: `Repaired ${count} refuel records.` });
  } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/admin/flush-all-history', checkAccess, async (req, res) => {
  await Refuel.deleteMany({});
  await Decouchage.deleteMany({});
  await Truck.updateMany({}, { $set: { lastFuelLiters: 0, engineState: null } });
  res.json({ success: true, message: "History cleared." });
});

// 🔧 NEW: Admin tool to reset engine states (use if refill detection seems stuck)
app.get('/api/admin/reset-engine-states', checkAccess, async (req, res) => {
  await Truck.updateMany({}, { $set: { engineState: null } });
  res.json({ success: true, message: "All engine states reset. Detection will restart fresh." });
});

// --- 8. INITIALIZATION ---
if (DB_URI) {
  mongoose.connect(DB_URI)
    .then(() => {
      console.log("✅ MongoDB Connected! Starting App...");
      app.listen(PORT, () => console.log(`🚀 Fleet Analytics Engine running on port ${PORT}`));
      runFleetBot();
    })
    .catch(err => { console.error("❌ Mongo Connection Failed:", err); });
} else {
  console.error("❌ FATAL: Missing DB_URI");
  app.listen(PORT, () => console.log(`🚀 Server running (No DB Mode) on port ${PORT}`));
}
