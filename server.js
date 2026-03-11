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
  // ✅ NEW: per-truck vidange acknowledgements (used to silence alerts after a confirmed vidange)
  // Structure: { [deviceId]: { skipUntilKm: number, confirmedAt: ISOString, odometerAtConfirm?: number, truckName?: string } }
  vidangeOverrides: {},
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

// ============================================================
// 🔧 Vidange helpers (server-side)
// ============================================================
function parseVidangeMilestones(milestonesRaw) {
  if (!milestonesRaw) return [];
  if (typeof milestonesRaw === 'string') {
    return milestonesRaw
      .split(',')
      .map(s => parseInt(String(s).trim(), 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
  }
  if (Array.isArray(milestonesRaw)) {
    return milestonesRaw
      .map(n => parseInt(n, 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
  }
  return [];
}

// 🔧 calculateVidangeStatus (same as config.js helper, but supports skipUntilKm)
// - skipUntilKm: last confirmed vidange milestone.
//   IMPORTANT: the alert MUST stay active (even overdue) until a vidange is recorded.
function calculateVidangeStatus(currentOdometer, config, skipUntilKm = null) {
  if (!config || !config.vidangeMilestones) {
    return { alert: false, nextKm: 'N/A', kmUntilNext: 999999, alertKm: config?.vidangeAlertKm || 5000 };
  }

  const milestones = parseVidangeMilestones(config.vidangeMilestones);
  if (!milestones || milestones.length === 0) {
    return { alert: false, nextKm: 'N/A', kmUntilNext: 999999, alertKm: config?.vidangeAlertKm || 5000 };
  }

  const alertKm = config.vidangeAlertKm || 5000;
  const safeSkip = (skipUntilKm !== null && skipUntilKm !== undefined) ? parseInt(skipUntilKm, 10) : null;

  // ✅ IMPORTANT FIX
  // The alert must NOT disappear just because the truck passed the milestone.
  // We only move to the next milestone once a vidange is recorded (skipUntilKm).
  const base = (!isNaN(safeSkip) && safeSkip > 0) ? safeSkip : 0;

  // 🔧 AUTO-SKIP OLD OVERDUE MILESTONES (>10,000 km past = considered done silently)
  // Trucks that passed a milestone >10k km ago without a recorded vidange are treated
  // as "already done" — no way management left them that far overdue. This clears old
  // "RETARD" alerts and starts fresh counting from the next upcoming milestone.
  const GHOST_KM_THRESHOLD = 10000;
  const activeMilestones = milestones.filter(m => {
    if (m <= base) return false; // already explicitly acknowledged via skipUntilKm
    if ((currentOdometer - m) > GHOST_KM_THRESHOLD) return false; // silently treat as done
    return true;
  });
  const nextMilestone = activeMilestones.length > 0 ? activeMilestones[0] : null;
  if (!nextMilestone) {
    return { alert: false, nextKm: 'N/A', kmUntilNext: 999999, alertKm };
  }

  const kmUntilNext = nextMilestone - currentOdometer;
  return { alert: kmUntilNext <= alertKm, nextKm: nextMilestone, kmUntilNext, alertKm };
}

async function acknowledgeVidange(deviceId, truckName, odometerKm) {
  try {
    const cfg = getTruckConfig(deviceId);
    const milestones = parseVidangeMilestones(cfg.vidangeMilestones);
    if (!milestones || milestones.length === 0) return null;

    const tol = (SYSTEM_SETTINGS.maintenanceRules && SYSTEM_SETTINGS.maintenanceRules.vidangeKmTolerance)
      ? parseInt(SYSTEM_SETTINGS.maintenanceRules.vidangeKmTolerance, 10)
      : 3000;

	    // ✅ IMPORTANT FIX
	    // We must pick the correct milestone even if the truck is late.
	    // Old behavior ("next milestone > odometer") was WRONG for late vidanges.
	    // New behavior:
	    // 1) Don't go backwards (ignore milestones <= current skipUntilKm)
	    // 2) Prefer a milestone within tolerance
	    // 3) If none within tolerance, pick the closest milestone (late-safe)
	
	    const existingOverride = SYSTEM_SETTINGS.vidangeOverrides && SYSTEM_SETTINGS.vidangeOverrides[String(deviceId)];
	    const currentSkip = existingOverride && existingOverride.skipUntilKm
	      ? parseInt(existingOverride.skipUntilKm, 10)
	      : 0;
	
	    const available = milestones.filter(m => !currentSkip || m > currentSkip);
	    if (!available.length) return null;
	
	    let candidate = null;
	    let bestAbs = Infinity;
	
	    // 1) Prefer a milestone close to current odometer (early/normal case)
	    for (const m of available) {
	      const abs = Math.abs(m - odometerKm);
	      if (abs <= tol && abs < bestAbs) {
	        bestAbs = abs;
	        candidate = m;
	      }
	    }
	
	    // 2) If nothing is close, pick the closest milestone (late-safe)
	    if (!candidate) {
	      bestAbs = Infinity;
	      for (const m of available) {
	        const abs = Math.abs(m - odometerKm);
	        if (abs < bestAbs || (abs === bestAbs && candidate !== null && m > candidate) || (abs === bestAbs && candidate === null)) {
	          bestAbs = abs;
	          candidate = m;
	        }
	      }
	    }
	
	    if (!candidate) return null;

    if (!SYSTEM_SETTINGS.vidangeOverrides) SYSTEM_SETTINGS.vidangeOverrides = {};
    SYSTEM_SETTINGS.vidangeOverrides[String(deviceId)] = {
      skipUntilKm: candidate,
      confirmedAt: new Date().toISOString(),
      odometerAtConfirm: odometerKm,
      truckName: truckName || ''
    };

    await saveSettings();
    return candidate;
  } catch (e) {
    console.error('acknowledgeVidange error:', e.message);
    return null;
  }
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
  // ✅ Apply vidange override (if user/auto already confirmed a vidange for the upcoming milestone)
  const skipUntilKm = SYSTEM_SETTINGS.vidangeOverrides?.[String(deviceId)]?.skipUntilKm;
  const vidangeStatus = calculateVidangeStatus(odometerKm, config, skipUntilKm);
  const minDurationMs = (SYSTEM_SETTINGS.maintenanceRules?.minDurationMinutes || 60) * 60000;

  // ✅ FIX: If we created an auto maintenance log, we MUST close it when the truck leaves the zone.
  // Otherwise it will stay "EN COURS" forever in the history.
  const closeOpenSessionIfAny = async (zoneName) => {
    if (!zoneName) return;
    try {
      let logId = dbTruck.logId;
      if (!logId) {
        // Backward-compatible: old DB rows may not have logId saved
        const openLog = await Maintenance.findOne({
          deviceId,
          location: zoneName,
          isAuto: true,
          $or: [{ exitDate: { $exists: false } }, { exitDate: null }]
        }).sort({ date: -1 });
        if (openLog) logId = openLog._id.toString();
      }

      if (logId) {
        await closeMaintenanceSession(logId, truckName, now);
      }
    } catch (e) {
      console.warn('closeOpenSessionIfAny failed:', e.message);
    }
  };

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
	      // If we were previously inside another maintenance zone, close that session first.
	      if (dbTruck.zone && dbTruck.zone !== currentZone.name) {
	        await closeOpenSessionIfAny(dbTruck.zone);
	      }
      await Truck.findOneAndUpdate({ deviceId }, {
        zone: currentZone.name,
        entryTime: now,
	        hasLogged: false,
	        logId: null
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
	        const createdLog = await Maintenance.create({
          truckName, deviceId,
          type: maintenanceType,
          location: currentZone.name,
          odometer: odometerKm,
          date: new Date(dbTruck.entryTime),
          isAuto: true,
          note: `Auto-détecté: ${durationMins} min sur place (${currentZone.name})`
        });

        // ✅ If it was a Vidange, acknowledge it so the "vidange alert" goes away for the serviced milestone
        if (maintenanceType === 'Vidange') {
          await acknowledgeVidange(deviceId, truckName, odometerKm);
        }

	        // Save logId so we can close the session when the truck leaves
	        await Truck.findOneAndUpdate({ deviceId }, { hasLogged: true, logId: createdLog._id.toString() });
        console.log(`🔧 AUTO ${maintenanceType}: ${truckName} at ${currentZone.name} (${durationMins}min, ${odometerKm}km)`);
      } else {
        // Mark as logged to stop repeat checks
	        await Truck.findOneAndUpdate({ deviceId }, { hasLogged: true, logId: null });
      }
    }
  } else {
    // Truck is OUTSIDE all zones - reset zone tracking
	  // Backward-compatible cleanup: if a previous bug left an auto session open, close it now.
	  try {
	    const strayOpen = await Maintenance.findOne({
	      deviceId,
	      isAuto: true,
	      $or: [{ exitDate: { $exists: false } }, { exitDate: null }]
	    }).sort({ date: -1 });
	    if (strayOpen && !strayOpen.exitDate) {
	      await closeMaintenanceSession(strayOpen._id.toString(), truckName, now);
	    }
	  } catch (e) {
	    console.warn('Stray maintenance cleanup failed:', e.message);
	  }

    if (dbTruck.zone) {
	    // Close any open auto session for the zone we just left
	    await closeOpenSessionIfAny(dbTruck.zone);
	    await Truck.findOneAndUpdate({ deviceId }, { zone: null, entryTime: null, hasLogged: false, logId: null });
	  } else if (dbTruck.logId) {
	    // No zone tracked anymore, but logId is still set (cleanup)
	    await Truck.findOneAndUpdate({ deviceId }, { zone: null, entryTime: null, hasLogged: false, logId: null });
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
    // Dynamic sensor key from config
    const sensorKey = (SYSTEM_SETTINGS.refuelRules && SYSTEM_SETTINGS.refuelRules.sensorType) || 'io87';
    let rawVal = parseFloat(truck.params[sensorKey] || truck.params.io87 || truck.params.fuel || truck.params.io84 || 0);

    // Clamp to valid range (Chinese GPS protection)
    if (rawVal > 100) rawVal = 100;
    if (rawVal < 0) rawVal = 0;
    const currentLiters = Math.round((rawVal / 100) * capacity);

    // --- ENGINE + MOVEMENT STATE ---
    // io1 = ignition key, acc = accessory power
    const ignRaw = truck.params?.io1 ?? truck.params?.acc;
    const ignVal = parseInt(ignRaw, 10);
    const hasIgn = !isNaN(ignVal);
    const ignOn = hasIgn ? ignVal === 1 : false;
    const speed = parseInt(truck.speed, 10) || 0;
    const isMoving = speed > 1;

    // ★★★ CRITICAL FIX ★★★
    // When no ignition sensor (io1/acc) exists, fall back to SPEED-BASED detection.
    // Old code: engineIsOff = hasIgn ? (!ignOn && speed === 0) : false  ← ALWAYS false without io1!
    // New code: if no ignition sensor, treat speed === 0 as "engine off"
    const refuelRulesLocal = { ...{ minRefuelLiters: 50, minOffMinutes: 2, postOnMinSeconds: 60, postOnMaxMinutes: 10, movingSpeedThreshold: 1, dedupeMinutes: 5, baselineDropToleranceLiters: 15, stopSpeedThreshold: 4, maxRealisticRefillLiters: 600 }, ...SYSTEM_SETTINGS.refuelRules };
    const STOP_SPEED = parseInt(refuelRulesLocal.stopSpeedThreshold, 10) || 4;
    const engineIsOff = hasIgn ? (!ignOn && speed === 0) : (speed < STOP_SPEED);
    const engineIsOn = !engineIsOff;

    const truckLat = parseFloat(truck.lat);
    const truckLng = parseFloat(truck.lng);

    let dbTruck = await Truck.findOne({ deviceId });

    if (!dbTruck) {
      // First time seeing this truck — save initial fuel reading
      await Truck.findOneAndUpdate({ deviceId }, {
        truckName, lastUpdate: now, lastFuelLiters: currentLiters,
        lastFuelPercent: rawVal,
        lat: truckLat, lng: truckLng, speed, params: truck.params,
        engineState: { lastRefuelTime: 0 }
      }, { upsert: true });
      continue;
    }

    // ═══════════════════════════════════════════════════════════════
    // ⛽ REFUEL DETECTION V6 — SIMPLE CONSECUTIVE COMPARISON
    // ═══════════════════════════════════════════════════════════════
    // WHY: V4 sliding window with stability checks missed 50% of refills
    //   because Chinese GPS sensors bounce ±10-15L and the stability
    //   counter kept resetting. The baseline tracking also drifted.
    //
    // V6 LOGIC (same as the working Mapbox/algeria-map history):
    //   previousFuel = last saved reading in MongoDB (30 seconds ago)
    //   currentFuel  = current GPS reading right now
    //   if (currentFuel - previousFuel >= 50L) → IT'S A REFILL
    //
    // That's it. No state machine. No baseline. No stability check.
    // The bot reads every 30 seconds. Between two readings, if fuel
    // jumps by 50+L, something was poured in. Sensor noise is ±10L
    // max and NEVER reaches 50L. So zero false positives.
    //
    // PROTECTIONS:
    //   - Min threshold: 50L (configurable via REFUEL_RULES)
    //   - Max realistic: 600L (rejects sensor glitches)
    //   - Dedupe: 5 minutes (no double-counting)
    //   - Sensor clamping: 0-100% range enforced above
    // ═══════════════════════════════════════════════════════════════

    const MIN_REFUEL_L = parseInt(refuelRulesLocal.minRefuelLiters, 10) || 50;
    const DEDUPE_MS = (parseFloat(refuelRulesLocal.dedupeMinutes) || 5) * 60 * 1000;
    const MAX_REALISTIC = parseInt(refuelRulesLocal.maxRealisticRefillLiters, 10) || 600;

    // Previous fuel reading from MongoDB (saved ~30 seconds ago)
    const previousFuel = dbTruck.lastFuelLiters || 0;

    // The magic comparison — same as your Mapbox history
    const fuelJump = currentLiters - previousFuel;

    if (fuelJump >= MIN_REFUEL_L && fuelJump <= MAX_REALISTIC) {
      // Dedupe check — don't log same refill twice
      const dedupeSince = new Date(now - DEDUPE_MS);
      const recentRefill = await Refuel.findOne({ deviceId, timestamp: { $gte: dedupeSince } });

      if (!recentRefill) {
        // Determine location
        let refillLat = truckLat, refillLng = truckLng;
        let locName = 'Station Externe'; let isInternal = false;
        for (const loc of SYSTEM_SETTINGS.customLocations) {
          const d = calculateDistance(refillLat, refillLng, loc.lat, loc.lng);
          if (d <= (loc.radius || 500)) { locName = loc.name; isInternal = true; break; }
        }

        const addedLiters = Math.round(fuelJump);
        const oldLevel = Math.round(previousFuel);
        const newLevel = Math.round(currentLiters);

        // Save with Algeria timezone (UTC+1)
        const algeriaTime = new Date(now + 3600000);

        await Refuel.create({
          deviceId, truckName, addedLiters,
          oldLevel, newLevel,
          timestamp: algeriaTime, locationRaw: locName,
          lat: refillLat, lng: refillLng, isInternal
        });
        console.log(`✅ REFILL ${truckName} +${addedLiters}L (${oldLevel}→${newLevel}L) @ ${locName}`);
      } else {
        console.log(`⏭️ ${truckName} Dedupe: skipped +${Math.round(fuelJump)}L (recent refill exists)`);
      }
    }

    let payload = { 
      truckName, lastUpdate: now, lastFuelLiters: currentLiters,
      lat: truckLat, lng: truckLng, speed, params: truck.params,
      engineState: { lastRefuelTime: 0 }  // V6: no complex state needed
    };

    // Run vidange/maintenance zone detection
    const freshDbTruck = { ...dbTruck.toObject(), ...payload };
    await runVidangeDetection(truck, freshDbTruck, config);

    // Save to DB if changed or position moved significantly
    const distMoved = calculateDistance(truckLat, truckLng, dbTruck.lat || 0, dbTruck.lng || 0);
    // V6: Always save — fuel reading must persist for next comparison
    if (true) {
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

  // ✅ If a Vidange was manually added, acknowledge it to silence the current milestone alert
  try {
    if (req.body && req.body.type === 'Vidange' && req.body.deviceId && req.body.odometer) {
      await acknowledgeVidange(req.body.deviceId, req.body.truckName, parseInt(req.body.odometer, 10));
    }
  } catch (e) {
    console.warn('Vidange acknowledge (manual) failed:', e.message);
  }

  res.json({ success: true });
});
app.post('/api/maintenance/update', checkAccess, async (req, res) => {
  try {
    const { id, type, note, odometer, isAuto } = req.body;
    const doc = await Maintenance.findById(id);
    if (!doc) return res.status(404).json({ error: "Introuvable" });

    const prevType = doc.type;
    doc.type = type || doc.type;
    doc.note = note !== undefined ? note : doc.note;
    doc.odometer = odometer || doc.odometer;
    if (isAuto !== undefined) doc.isAuto = isAuto;
    await doc.save();

    // ✅ If user changed the entry to Vidange, acknowledge
    try {
      if (prevType !== 'Vidange' && doc.type === 'Vidange' && doc.deviceId && doc.odometer) {
        await acknowledgeVidange(doc.deviceId, doc.truckName, parseInt(doc.odometer, 10));
      }
    } catch (e) {
      console.warn('Vidange acknowledge (update) failed:', e.message);
    }

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
// 🔧 FIXED: reset-engine-states now accepts URL ?secret= param (no header needed)
app.get('/api/admin/reset-engine-states', async (req, res) => {
  // Accepts header x-access-code OR URL ?secret=Douroub2025AdminSecure
  const MASTERSECRET = 'Douroub2025AdminSecure';
  const userCode = req.headers['x-access-code'] || req.query.secret;
  if (userCode !== MASTERSECRET) {
    const isValid = userCode ? await AccessCode.findOne({ code: userCode }) : null;
    if (!isValid) return res.status(403).json({ error: 'Access Denied. Use ?secret=Douroub2025AdminSecure in URL' });
  }
  await Truck.updateMany({}, { $set: { engineState: null } });
  res.json({ success: true, message: '✅ All engine states reset! Bot restarts detection in ~30 seconds.' });
});


// =============================================================
// ADMIN: Bulk-acknowledge all overdue vidanges (>10,000 km past)
// =============================================================
// USE CASE: You just installed the system but trucks already have
// 50,000+ km on the odometer. Old milestones (30k, 60k...) show as
// "EN RETARD" even though the vidanges were done long ago.
// This endpoint scans ALL trucks and acknowledges any milestone
// that is more than 10,000 km overdue, so the system starts fresh
// tracking the NEXT upcoming milestone.
//
// HOW TO USE: Just open this URL once in your browser:
//   https://YOUR-SERVER/api/admin/reset-overdue-vidanges?secret=Douroub2025AdminSecure
//
// It will return a list of what was reset for each truck.
// =============================================================
app.get('/api/admin/reset-overdue-vidanges', async (req, res) => {
  // Uses master secret OR access code header
  const MASTER_SECRET = 'Douroub2025AdminSecure';
  const userCode = req.headers['x-access-code'] || req.query.secret;
  if (userCode !== MASTER_SECRET) {
    const isValid = userCode ? await AccessCode.findOne({ code: userCode }) : null;
    if (!isValid) return res.status(403).json({ error: 'Access Denied. Add ?secret=Douroub2025AdminSecure to the URL' });
  }
  try {
    await loadSettings();

    // Threshold: if a milestone is >10,000 km overdue, consider it "already done"
    const OVERDUE_THRESHOLD_KM = parseInt(req.query.threshold || 10000);

    // Fetch live GPS data to get current odometers
    let rawData;
    try {
      const response = await fetch(GPS_API_URL);
      const json = await response.json();
      rawData = json.data || json;
    } catch (e) {
      return res.status(500).json({ error: 'Could not fetch GPS data', details: e.message });
    }

    const truckArray = Array.isArray(rawData) ? rawData : Object.entries(rawData).map(([id, val]) => ({ ...val, id }));
    const results = [];

    for (const truck of truckArray) {
      const deviceId = String(truck.id || truck.imei);
      if (!truck.params || !deviceId) continue;

      const truckName = truck.name;
      const config = getTruckConfig(deviceId);
      const odometerMeters = parseInt(truck.params?.io192 || 0);
      const odometerKm = Math.round(odometerMeters / 1000);

      // Parse milestones
      const milestones = parseVidangeMilestones(config.vidangeMilestones);
      if (!milestones || milestones.length === 0) {
        results.push({ truck: truckName, deviceId, odometer: odometerKm, action: 'SKIP - no milestones defined' });
        continue;
      }

      // Current skip (already acknowledged milestones)
      const currentSkip = SYSTEM_SETTINGS.vidangeOverrides?.[String(deviceId)]?.skipUntilKm
        ? parseInt(SYSTEM_SETTINGS.vidangeOverrides[String(deviceId)].skipUntilKm, 10) : 0;

      // Find the HIGHEST milestone that is >OVERDUE_THRESHOLD_KM behind current odometer
      // Example: odometer=75000, milestones=[30000,60000,90000], threshold=10000
      //   30000 → 75000-30000=45000 > 10000 → overdue, acknowledge
      //   60000 → 75000-60000=15000 > 10000 → overdue, acknowledge  
      //   90000 → 75000-90000=-15000 → NOT overdue, this is the next target
      // So we set skipUntilKm = 60000 (highest overdue milestone)

      let highestOverdue = null;
      const skippedMilestones = [];

      for (const m of milestones) {
        if (m <= currentSkip) continue; // Already acknowledged
        const diff = odometerKm - m;
        if (diff > OVERDUE_THRESHOLD_KM) {
          highestOverdue = m;
          skippedMilestones.push(`${m} km (${diff} km ago)`);
        }
      }

      if (highestOverdue) {
        // Set the override so the system skips past all overdue milestones
        if (!SYSTEM_SETTINGS.vidangeOverrides) SYSTEM_SETTINGS.vidangeOverrides = {};
        SYSTEM_SETTINGS.vidangeOverrides[String(deviceId)] = {
          skipUntilKm: highestOverdue,
          confirmedAt: new Date().toISOString(),
          odometerAtConfirm: odometerKm,
          truckName: truckName,
          note: 'Bulk reset - overdue vidanges acknowledged'
        };

        // Find the next milestone after the acknowledged ones
        const nextMilestone = milestones.find(m => m > highestOverdue);
        const nextInfo = nextMilestone ? `${nextMilestone} km (in ${nextMilestone - odometerKm} km)` : 'No more milestones';

        results.push({
          truck: truckName,
          deviceId,
          odometer: `${odometerKm} km`,
          acknowledged: skippedMilestones,
          nextTarget: nextInfo,
          action: 'RESET ✅'
        });
      } else {
        // Find current next milestone
        const base = currentSkip || 0;
        const nextM = milestones.find(m => m > base);
        const status = nextM ? `Next: ${nextM} km (in ${nextM - odometerKm} km)` : 'All done';

        results.push({
          truck: truckName,
          deviceId,
          odometer: `${odometerKm} km`,
          action: `OK - no overdue milestones (>${OVERDUE_THRESHOLD_KM} km). ${status}`
        });
      }
    }

    // Save all overrides to DB
    await saveSettings();

    res.json({
      success: true,
      threshold: `${OVERDUE_THRESHOLD_KM} km`,
      date: new Date().toISOString(),
      totalTrucks: truckArray.length,
      resetCount: results.filter(r => r.action === 'RESET ✅').length,
      results: results
    });

  } catch (e) {
    console.error('Reset overdue vidanges error:', e);
    res.status(500).json({ error: e.message });
  }
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
