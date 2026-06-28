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
  // ✅ NEW: Per-truck identification fields
  chassisNumber: String,       // Numéro de châssis
  immatriculation: String,     // Plaque d'immatriculation
  carteNaftal: String,         // Carte Naftal (fuel card number)
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
  lat: Number, lng: Number,
  source: { type: String, default: 'live-bot' },
  meta: Object
});

const MaintenanceSchema = new mongoose.Schema({
  truckName: String, deviceId: String, type: String,
  location: String, odometer: Number,
  date: { type: Date, required: true, index: expireRule },
  exitDate: Date, note: String, isAuto: Boolean,
  // ✅ NEW: Enhanced maintenance tracking fields
  status: { type: String, default: 'en_cours' },   // en_cours, termine, annule
  priority: { type: String, default: 'normal' },    // urgent, normal, bas
  description: String,                               // Description détaillée du travail
  cost: Number,                                      // Coût total de la réparation
  technician: String,                                // Technicien responsable
  parts: [{ name: String, quantity: Number, cost: Number }],  // Pièces utilisées
  scheme: String,                                    // Type de véhicule (ex: 4x2, 6x4, remorque)
  tires: String,                                     // Pneus cochés
  forfaitName: String,                               // Nom du pack/forfait choisi
  chassisNumber: String,                             // Châssis du camion au moment de l'ordre
  immatriculation: String,                           // Immatriculation au moment de l'ordre
  // ✅ V4.0: GPS Geofence Confirmation
  gpsConfirmed: { type: Boolean, default: false },   // Confirmed via GPS proximity
  gpsConfirmedAt: Date,                              // When GPS confirmation happened
  gpsRejected: { type: Boolean, default: false },     // User rejected the confirmation
  gpsRejectedReason: String,                         // Why they rejected
  geofenceTriggered: { type: Boolean, default: false }, // Truck entered 500m zone
  geofenceTriggeredAt: Date,                         // When geofence was triggered
  geofenceExitAt: Date,                              // When truck left the zone
  maintenanceLocationLat: Number,                    // Maintenance site latitude
  maintenanceLocationLng: Number,                    // Maintenance site longitude
  geofenceRadiusMeters: { type: Number, default: 500 }, // Configurable geofence radius
  // ✅ V4.0: Verification
  verified: { type: Boolean, default: false },
  verifiedBy: String,
  verifiedAt: Date
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


// ✅ NEW: Speed Violation Schema (24/7 background tracking)
const SpeedViolationSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  truckName: String,
  timestamp: { type: Date, required: true },
  speed: Number,
  limit: Number,
  lat: Number,
  lng: Number,
  locationName: String,
  durationMinutes: { type: Number, default: 0 },
  isRescanned: { type: Boolean, default: false }
});
const SpeedViolation = mongoose.model('SpeedViolation', SpeedViolationSchema);

const Truck = mongoose.model('Truck', TruckSchema);
const Refuel = mongoose.model('Refuel', RefuelSchema);
const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);
const Decouchage = mongoose.model('Decouchage', DecouchageSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// ✅ NEW: Maintenance Articles Catalog (configurable repair templates)
const MaintenanceArticleSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  category: { type: String, default: 'general' },
  description: String,
  defaultPrice: { type: Number, default: 0 },
  components: [{ name: String, quantity: { type: Number, default: 1 }, unitCost: { type: Number, default: 0 } }],
  laborCost: { type: Number, default: 0 },
  estimatedDuration: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const MaintenanceArticle = mongoose.model('MaintenanceArticle', MaintenanceArticleSchema);

// ✅ NEW: Vehicle References / Documents (Vignette, Contrôle Technique, Assurance, etc.)
const VehicleReferenceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  truckName: String,
  refName: { type: String, required: true },       // e.g. "Vignette", "Contrôle Technique"
  refNumber: String,                                // reference/certificate number
  issueDate: { type: Date, default: Date.now },     // date obtained
  expiryDate: { type: Date, required: true },       // when it expires
  reminderDays: { type: Number, default: 30 },      // alert N days before expiry
  notes: String,
  createdAt: { type: Date, default: Date.now }
});
const VehicleReference = mongoose.model('VehicleReference', VehicleReferenceSchema);


const TransportReportEntrySchema = new mongoose.Schema({
  truckName: String,
  inputTruckName: String,
  deviceId: String,
  startAt: Date,
  endAt: Date,
  requestedStartAt: Date,
  requestedEndAt: Date,
  actualStartAt: Date,
  actualEndAt: Date,
  kmStart: Number,
  kmEnd: Number,
  kmTotal: Number,
  gpsDistanceKm: Number,
  distanceSource: String,
  fuelStart: Number,
  fuelEnd: Number,
  fuelAddedDuringTrip: Number,
  fuelConsumedRaw: Number,
  fuelConsumedTotal: Number,
  refillCount: Number,
  historyPoints: Number,
  startLocation: String,
  endLocation: String,
  note: String,
  warnings: [String],
  refills: Array,
  status: { type: String, default: 'ok' },
  issueReason: String,
  issueCategory: String,
  issueDetails: Object,
  sourceType: { type: String, default: 'manual' },
  sourceFileName: String,
  sourceRow: Number,
  importFingerprint: String,
  importIssueKey: String,
  lastRetryAt: Date,
  lastRetriedBy: String,
  resolvedAt: Date,
  editedAt: Date,
  createdAt: { type: Date, default: Date.now }
});
const TransportReportEntry = mongoose.model('TransportReportEntry', TransportReportEntrySchema);

// ✅ SELF-HEALING: Tracks GPS data collection gaps so server can auto-recover after downtime/quota events
const MissedWindowSchema = new mongoose.Schema({
  startMs: { type: Number, required: true, index: true },  // gap start timestamp
  endMs:   { type: Number, required: true },                // gap end timestamp
  reason:  { type: String, default: 'bot-failure' },        // 'bot-failure', 'bandwidth', 'quota', 'startup-gap'
  recoveredAt: { type: Date, default: null },               // null = not yet recovered
  truckCount: Number,                                        // how many trucks were processed in recovery
  createdAt: { type: Date, default: Date.now }
});
const MissedWindow = mongoose.model('MissedWindow', MissedWindowSchema);


// --- 3. SMART CACHE ---
let SYSTEM_SETTINGS = {
  customLocations: [],
  maintenanceRules: { minDurationMinutes: 60, vidangeKmTolerance: 3000 },
  defaultConfig: { fuelTankCapacity: 600, fuelConsumption: 35, fuelSensorKeys: ['io87'], fuelSensorCapacityMap: {} },
  fleetRules: [],
  // ✅ NEW: per-truck vidange acknowledgements (used to silence alerts after a confirmed vidange)
  // Structure: { [deviceId]: { skipUntilKm: number, confirmedAt: ISOString, odometerAtConfirm?: number, truckName?: string } }
  vidangeOverrides: {},
  lastDecouchageCheck: null
};

let REFUEL_RECONCILE_STATE = { running: false, lastRunYmd: null, lastSummary: null };
let BOT_LAST_SUCCESS_MS = 0; // tracks last successful GPS fetch for missed-window detection

function getResolvedRefuelRules(overrides = {}) {
  return {
    minRefuelLiters: 60,
    stopSpeedThreshold: 4,
    minStopMinutes: 2,
    minOffMinutes: 2,
    dedupeMinutes: 20,
    dedupeLitersTolerance: 12,
    stableAfterIncreaseMinutes: 4,
    settleToleranceLiters: 6,
    sensorSmoothingWindow: 5,
    baselineDropToleranceLiters: 25,
    baselineWindowMinutes: 20,
    plateauWindowMinutes: 15,
    maxRiseMinutes: 180,
    maxStationarySpreadMeters: 650,
    maxRealisticRefillLiters: 700,
    requireIgnOff: false,
    requireEngineOff: false,
    ...((SYSTEM_SETTINGS && SYSTEM_SETTINGS.refuelRules) || {}),
    ...overrides
  };
}

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


function normalizeFuelSensorKeys(rawValue) {
  let tokens = [];
  if (Array.isArray(rawValue)) {
    tokens = rawValue;
  } else if (typeof rawValue === 'string') {
    tokens = rawValue.split(/[\n,+;|/\\]+|\s+/g);
  } else if (rawValue !== undefined && rawValue !== null) {
    tokens = [rawValue];
  }
  const cleaned = Array.from(new Set(tokens.map(v => String(v || '').trim().toLowerCase()).filter(Boolean)));
  return cleaned.length ? cleaned : ['io87'];
}

function getConfiguredFuelSensorKeys(config) {
  if (config && Array.isArray(config.fuelSensorKeys) && config.fuelSensorKeys.length > 0) {
    return normalizeFuelSensorKeys(config.fuelSensorKeys);
  }
  if (config && typeof config.fuelSensorInput === 'string' && config.fuelSensorInput.trim()) {
    return normalizeFuelSensorKeys(config.fuelSensorInput);
  }
  if (config && typeof config.fuelSensorKey === 'string' && config.fuelSensorKey.trim()) {
    return normalizeFuelSensorKeys(config.fuelSensorKey);
  }
  if (config && typeof config.fuelSensorIo === 'string' && config.fuelSensorIo.trim()) {
    return normalizeFuelSensorKeys(config.fuelSensorIo);
  }
  const sensorType = SYSTEM_SETTINGS.refuelRules && SYSTEM_SETTINGS.refuelRules.sensorType;
  if (sensorType) return normalizeFuelSensorKeys(sensorType);
  return ['io87'];
}

function getConfiguredFuelSensorLabel(config) {
  return getConfiguredFuelSensorKeys(config).join(' + ');
}

function parseFuelSensorCapacityMap(rawValue) {
  const out = {};
  const assign = (key, value) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    const liters = parseFloat(value);
    if (!normalizedKey || !Number.isFinite(liters) || liters <= 0) return;
    out[normalizedKey] = liters;
  };

  const parseStringChunk = (textValue) => {
    String(textValue || '').split(/[\n,;+|]+/).forEach((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return;
      let match = trimmed.match(/^([a-z0-9_]+)\s*(?:=|:)\s*([0-9]+(?:\.[0-9]+)?)$/i);
      if (!match) match = trimmed.match(/^([a-z0-9_]+)\s+([0-9]+(?:\.[0-9]+)?)$/i);
      if (match) assign(match[1], match[2]);
    });
  };

  if (!rawValue) return out;

  if (Array.isArray(rawValue)) {
    rawValue.forEach((item) => {
      if (!item) return;
      if (typeof item === 'string') {
        parseStringChunk(item);
        return;
      }
      if (typeof item === 'object') {
        assign(item.key || item.io || item.sensor, item.capacity || item.cap || item.value || item.liters);
      }
    });
    return out;
  }

  if (typeof rawValue === 'object') {
    Object.entries(rawValue).forEach(([key, value]) => assign(key, value));
    return out;
  }

  if (typeof rawValue === 'string') {
    parseStringChunk(rawValue);
  }

  return out;
}

function getConfiguredFuelSensorCapacityMap(config) {
  if (!config) return {};

  const candidates = [
    config.fuelSensorCapacityMap,
    config.fuelSensorCapacities,
    config.fuelSensorCapacitiesInput,
    config.fuelSensorCapacityInput,
    config.fuelSensorTankCapacities
  ];

  for (const candidate of candidates) {
    const parsed = parseFuelSensorCapacityMap(candidate);
    if (Object.keys(parsed).length > 0) return parsed;
  }

  return {};
}

function buildFuelSensorCapacityPlan(config, sensorKeys = null) {
  const keys = normalizeFuelSensorKeys(sensorKeys && sensorKeys.length ? sensorKeys : getConfiguredFuelSensorKeys(config));
  const explicitMap = getConfiguredFuelSensorCapacityMap(config);
  const configuredTotal = parseFloat(config && config.fuelTankCapacity) || 0;

  let explicitTotal = 0;
  let explicitCount = 0;
  const missingKeys = [];

  keys.forEach((key) => {
    const explicit = parseFloat(explicitMap[key]);
    if (Number.isFinite(explicit) && explicit > 0) {
      explicitTotal += explicit;
      explicitCount += 1;
    } else {
      missingKeys.push(key);
    }
  });

  let fallbackEach = 0;
  if (missingKeys.length > 0) {
    if (configuredTotal > explicitTotal) {
      fallbackEach = (configuredTotal - explicitTotal) / missingKeys.length;
    } else if (explicitCount > 0) {
      fallbackEach = explicitTotal / explicitCount;
    } else if (configuredTotal > 0 && keys.length > 0) {
      fallbackEach = configuredTotal / keys.length;
    }
  }

  const list = keys.map((key) => {
    const explicit = parseFloat(explicitMap[key]);
    const capacity = (Number.isFinite(explicit) && explicit > 0) ? explicit : fallbackEach;
    return { key, capacity: capacity > 0 ? capacity : 0 };
  });

  let totalCapacity = list.reduce((sum, item) => sum + (item.capacity || 0), 0);
  if (totalCapacity <= 0 && configuredTotal > 0) totalCapacity = configuredTotal;

  const resolvedMap = {};
  list.forEach((item) => {
    if (item.capacity > 0) resolvedMap[item.key] = item.capacity;
  });

  return { keys, list, totalCapacity, explicitMap, resolvedMap, explicitTotal, configuredTotal };
}

function getConfiguredFuelSensorCapacitiesLabel(config) {
  const keys = getConfiguredFuelSensorKeys(config);
  const map = getConfiguredFuelSensorCapacityMap(config);
  const parts = keys.map((key) => {
    const liters = parseFloat(map[key]);
    if (!Number.isFinite(liters) || liters <= 0) return null;
    const rounded = Math.round(liters * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${key}=${text}L`;
  }).filter(Boolean);
  return parts.join(' + ');
}

function getConfiguredFuelEffectiveCapacity(config) {
  const plan = buildFuelSensorCapacityPlan(config);
  return plan.totalCapacity || (parseFloat(config && config.fuelTankCapacity) || 0);
}

function interpolateFuelCalibration(sensorValue, calibrationTable) {
  if (!Array.isArray(calibrationTable) || calibrationTable.length < 2) return 0;
  if (sensorValue <= calibrationTable[0].x) return calibrationTable[0].y;
  if (sensorValue >= calibrationTable[calibrationTable.length - 1].x) {
    return calibrationTable[calibrationTable.length - 1].y;
  }
  for (let i = 0; i < calibrationTable.length - 1; i++) {
    const p1 = calibrationTable[i];
    const p2 = calibrationTable[i + 1];
    if (sensorValue >= p1.x && sensorValue <= p2.x) {
      const slope = (p2.y - p1.y) / (p2.x - p1.x);
      return Math.round(p1.y + slope * (sensorValue - p1.x));
    }
  }
  return 0;
}

function readConfiguredFuelSensorValues(params, config) {
  const keys = getConfiguredFuelSensorKeys(config);
  const values = [];
  if (params && typeof params === 'object') {
    keys.forEach((key) => {
      const candidates = [key, key.toLowerCase(), key.toUpperCase()];
      for (const candidate of candidates) {
        if (params[candidate] === undefined || params[candidate] === null || params[candidate] === '') continue;
        const raw = parseFloat(params[candidate]);
        if (!isNaN(raw)) {
          values.push({ key, raw });
          break;
        }
      }
    });

    if (values.length === 0) {
      for (const key of ['io87', 'fuel', 'io84']) {
        if (params[key] === undefined || params[key] === null || params[key] === '') continue;
        const raw = parseFloat(params[key]);
        if (!isNaN(raw)) {
          values.push({ key, raw });
          break;
        }
      }
    }
  }
  return { keys, values };
}

function calculateFuelMetricsFromParams(params, config) {
    const defaultTotalCapacity = parseFloat(config && config.fuelTankCapacity) || 0;
    const calibration = Array.isArray(config && config.calibration) ? config.calibration : [];
    const { keys, values } = readConfiguredFuelSensorValues(params, config);
    const rawEntries = values
        .map(v => ({ key: String(v.key || '').trim().toLowerCase(), raw: parseFloat(v.raw) }))
        .filter(v => !isNaN(v.raw));
    const capacityPlan = buildFuelSensorCapacityPlan(config, rawEntries.map(v => v.key));
    let effectiveCapacity = capacityPlan.totalCapacity || defaultTotalCapacity || 0;

    if (rawEntries.length === 0) {
        return {
            liters: 0,
            percent: 0,
            usedCalibration: false,
            keys,
            rawValues: [],
            mode: 'missing',
            effectiveCapacity,
            tankCapacities: capacityPlan.list,
            capacityMap: capacityPlan.resolvedMap
        };
    }

    let liters = 0;
    let percent = 0;
    let usedCalibration = false;
    let mode = 'missing';

    if (calibration.length > 1 && rawEntries.length === 1) {
        liters = Math.max(0, interpolateFuelCalibration(rawEntries[0].raw, calibration));
        usedCalibration = true;
        mode = 'calibrated';
    } else {
        const capByKey = {};
        capacityPlan.list.forEach((item) => { capByKey[item.key] = item.capacity; });
        const fallbackEach = effectiveCapacity > 0 ? (effectiveCapacity / Math.max(rawEntries.length, 1)) : 0;

        liters = rawEntries.reduce((sum, entry) => {
            const raw = entry.raw;
            if (!Number.isFinite(raw)) return sum;
            if (raw > 100) return sum + Math.max(0, raw);
            const tankCapacity = capByKey[entry.key] > 0 ? capByKey[entry.key] : fallbackEach;
            const safePercent = Math.max(0, Math.min(100, raw));
            return sum + ((safePercent / 100) * tankCapacity);
        }, 0);

        const hasLitersInput = rawEntries.some(entry => entry.raw > 100);
        const hasPercentInput = rawEntries.some(entry => entry.raw <= 100);
        if (hasLitersInput && hasPercentInput) mode = 'mixed';
        else if (hasLitersInput) mode = rawEntries.length > 1 ? 'multi-liters' : 'single-liters';
        else mode = rawEntries.length > 1 ? 'multi-percent' : 'single-percent';
    }

    liters = Math.round(liters);

    if (!effectiveCapacity) {
        if (capacityPlan.totalCapacity > 0) effectiveCapacity = capacityPlan.totalCapacity;
        else if (defaultTotalCapacity > 0) effectiveCapacity = defaultTotalCapacity;
        else if (liters > 0 && rawEntries.every(entry => entry.raw > 100)) effectiveCapacity = liters;
    }

    if (usedCalibration) {
        percent = effectiveCapacity > 0
            ? Math.round((liters / effectiveCapacity) * 100)
            : Math.round(Math.max(0, rawEntries[0].raw));
    } else if (effectiveCapacity > 0) {
        percent = Math.round((liters / effectiveCapacity) * 100);
    } else if (rawEntries.length === 1 && rawEntries[0].raw <= 100) {
        percent = Math.round(Math.max(0, Math.min(100, rawEntries[0].raw)));
    } else {
        percent = 0;
    }

    if (!Number.isFinite(liters) || liters < 0) liters = 0;
    if (!Number.isFinite(percent) || percent < 0) percent = 0;
    if (effectiveCapacity > 0 && percent > 100) percent = 100;

    return {
        liters,
        percent,
        usedCalibration,
        keys,
        rawValues: rawEntries.map(v => v.raw),
        mode,
        effectiveCapacity,
        tankCapacities: capacityPlan.list,
        capacityMap: capacityPlan.resolvedMap
    };
}


function medianForNumbers(values) {
    const safe = (Array.isArray(values) ? values : [])
        .map(v => parseFloat(v))
        .filter(v => Number.isFinite(v))
        .sort((a, b) => a - b);
    if (!safe.length) return 0;
    const mid = Math.floor(safe.length / 2);
    return safe.length % 2 ? safe[mid] : (safe[mid - 1] + safe[mid]) / 2;
}

function smoothFuelSeriesPoints(points, windowSize = 3, maxFuelLevel = null) {
    const safe = (Array.isArray(points) ? points : [])
        .map((point, index) => {
            const litersRaw = parseFloat(point && point.liters);
            const timeRaw = point && point.time;
            const time = Number.isFinite(timeRaw) ? timeRaw : parseFloat(timeRaw);
            if (!Number.isFinite(time) || !Number.isFinite(litersRaw)) return null;
            const liters = Math.max(0, litersRaw);
            if (Number.isFinite(maxFuelLevel) && maxFuelLevel > 0 && liters > (maxFuelLevel * 1.35)) return null;
            const speed = parseFloat((point && point.speed) || 0) || 0;
            const ign = parseInt(point && (point.ign ?? 0), 10) || 0;
            const lat = Number.isFinite(parseFloat(point && point.lat)) ? parseFloat(point.lat) : null;
            const lng = Number.isFinite(parseFloat(point && point.lng)) ? parseFloat(point.lng) : null;
            return { index, time, liters, speed, ign, lat, lng };
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);

    if (!safe.length) return [];

    const size = Math.max(1, parseInt(windowSize, 10) || 1);
    const radius = Math.max(0, Math.floor(size / 2));

    return safe.map((point, idx) => {
        const start = Math.max(0, idx - radius);
        const end = Math.min(safe.length - 1, idx + radius);
        const neighbors = [];
        for (let i = start; i <= end; i += 1) neighbors.push(safe[i].liters);
        return { ...point, litersSmooth: medianForNumbers(neighbors) };
    });
}

// ✅ FIX: Stricter merge to prevent duplication
// Old code merged too aggressively (overlapping time windows + loose level tolerance)
// New code: requires BOTH time AND level proximity, and uses tighter overlap check
function mergeRefillEvents(events, dedupeMs = 0, levelTolerance = 10) {
    const sorted = (Array.isArray(events) ? events : [])
        .filter(Boolean)
        .sort((a, b) => (a.time || 0) - (b.time || 0));

    if (!sorted.length) return [];

    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
        const prev = merged[merged.length - 1];
        const cur = sorted[i];
        const timeDiff = Math.abs((cur.time || 0) - (prev.time || 0));

        // ✅ FIX: Only merge if STRICTLY close in time (direct time comparison, not window overlap)
        const closeInTime = dedupeMs > 0 && timeDiff <= dedupeMs;

        // ✅ FIX: Tighter level check — both old AND new levels must be similar
        const newLevelClose = Math.abs((cur.newLevel || 0) - (prev.newLevel || 0)) <= levelTolerance;
        const oldLevelClose = Math.abs((cur.oldLevel || 0) - (prev.oldLevel || 0)) <= levelTolerance;
        const crossLevelClose = Math.abs((cur.oldLevel || 0) - (prev.newLevel || 0)) <= (levelTolerance * 0.6);
        const closeInLevel = (newLevelClose && oldLevelClose) || crossLevelClose;

        if (closeInTime && closeInLevel) {
            // Merge: keep the one with higher confidence
            const prevConf = parseFloat(prev.confidence) || 0;
            const curConf = parseFloat(cur.confidence) || 0;
            const oldLevel = Math.min(prev.oldLevel || 0, cur.oldLevel || 0);
            const newLevel = Math.max(prev.newLevel || 0, cur.newLevel || 0);
            const winner = curConf > prevConf ? cur : prev;
            merged[merged.length - 1] = {
                ...winner,
                startTimeMs: Math.min(prev.startTimeMs || prev.time || 0, cur.startTimeMs || cur.time || 0),
                endTimeMs: Math.max(prev.endTimeMs || prev.time || 0, cur.endTimeMs || cur.time || 0),
                time: winner.time,
                oldLevel: Math.round(oldLevel),
                newLevel: Math.round(newLevel),
                addedLiters: Math.round(newLevel - oldLevel),
                confidence: Math.max(prevConf, curConf)
            };
        } else {
            merged.push(cur);
        }
    }
    return merged;
}

function calculateClusterSpreadMeters(points) {
    const safe = (Array.isArray(points) ? points : []).filter((point) => Number.isFinite(point && point.lat) && Number.isFinite(point && point.lng));
    if (safe.length < 2) return 0;
    let maxMeters = 0;
    for (let i = 0; i < safe.length; i += 1) {
        for (let j = i + 1; j < safe.length; j += 1) {
            const meters = calculateDistance(safe[i].lat, safe[i].lng, safe[j].lat, safe[j].lng);
            if (Number.isFinite(meters) && meters > maxMeters) maxMeters = meters;
        }
    }
    return maxMeters;
}

function detectRefillEventsFromSeries(points, options = {}) {
    const minRefuelLiters = parseFloat(options.minRefuelLiters ?? 60) || 60;
    const maxParsed = parseFloat(options.maxRealisticRefillLiters);
    const maxRealisticRefillLiters = Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : Number.POSITIVE_INFINITY;
    const stopSpeedThreshold = parseFloat(options.stopSpeedThreshold ?? 4) || 4;
    const minStopMs = Math.max(60 * 1000, (parseFloat(options.minStopMinutes ?? options.minOffMinutes ?? 2) || 2) * 60 * 1000);
    const stableAfterMs = Math.max(60 * 1000, (parseFloat(options.stableAfterIncreaseMinutes ?? 3) || 3) * 60 * 1000);
    const dedupeMs = Math.max(0, (parseFloat(options.dedupeMinutes ?? 20) || 0) * 60 * 1000);
    const dedupeLitersTolerance = parseFloat(options.dedupeLitersTolerance ?? 12) || 12;
    const settleToleranceLiters = parseFloat(options.settleToleranceLiters ?? dedupeLitersTolerance ?? 6) || 6;
    const sensorSmoothingWindow = Math.max(1, parseInt(options.sensorSmoothingWindow ?? 5, 10) || 5);
    const requireIgnOff = options.requireIgnOff === true || options.requireEngineOff === true;
    const baselineWindowMs = Math.max(2 * 60 * 1000, (parseFloat(options.baselineWindowMinutes ?? 20) || 20) * 60 * 1000);
    const plateauWindowMs = Math.max(stableAfterMs, (parseFloat(options.plateauWindowMinutes ?? 15) || 15) * 60 * 1000);
    const maxRiseMs = Math.max(5 * 60 * 1000, (parseFloat(options.maxRiseMinutes ?? 180) || 180) * 60 * 1000);
    const maxStationarySpreadMeters = Math.max(100, parseFloat(options.maxStationarySpreadMeters ?? 650) || 650);

    const prepared = smoothFuelSeriesPoints(points, sensorSmoothingWindow, maxRealisticRefillLiters);
    if (prepared.length < 3) return [];

    prepared.forEach((point) => {
        point.isStopLike = point.speed <= stopSpeedThreshold && (!requireIgnOff || point.ign !== 1);
    });

    const events = [];
    const softMinRefuelLiters = Math.max(20, Math.round(minRefuelLiters * 0.75));
    const stepTriggerLiters = Math.max(2, Math.min(8, minRefuelLiters * 0.08));
    const riseThresholdLiters = Math.max(stepTriggerLiters * 2, Math.min(12, Math.max(8, minRefuelLiters * 0.2)));
    const negativeNoiseTolerance = Math.max(2, Math.min(settleToleranceLiters, minRefuelLiters * 0.12));
    const plateauSpreadMax = Math.max(4, settleToleranceLiters * 1.25);

    let segStart = 0;
    while (segStart < prepared.length) {
        if (!prepared[segStart].isStopLike) {
            segStart += 1;
            continue;
        }

        let segEnd = segStart;
        while (segEnd + 1 < prepared.length && prepared[segEnd + 1].isStopLike) segEnd += 1;

        const segment = prepared.slice(segStart, segEnd + 1);
        const durationMs = (segment[segment.length - 1].time || 0) - (segment[0].time || 0);

        if (segment.length >= 3 && durationMs >= minStopMs) {
            let i = 1;
            while (i < segment.length) {
                const firstDelta = (segment[i].litersSmooth || 0) - (segment[i - 1].litersSmooth || 0);
                if (firstDelta < stepTriggerLiters) {
                    i += 1;
                    continue;
                }

                const startIdx = Math.max(0, i - 1);
                let j = i;
                let peakIdx = i;
                let positiveSteps = 0;
                let negativeSteps = 0;

                while (j < segment.length) {
                    const delta = (segment[j].litersSmooth || 0) - (segment[j - 1].litersSmooth || 0);
                    const elapsed = (segment[j].time || 0) - (segment[startIdx].time || 0);
                    if (elapsed > maxRiseMs) break;
                    if (delta < -negativeNoiseTolerance) break;
                    if (delta > 0.5) positiveSteps += 1;
                    if (delta < -0.5) negativeSteps += 1;
                    if ((segment[j].litersSmooth || 0) >= (segment[peakIdx].litersSmooth || 0)) peakIdx = j;
                    j += 1;
                }

                const peakPoint = segment[peakIdx];
                const baselineCandidates = segment.filter((point, idx) => idx <= startIdx && point.time >= ((segment[startIdx].time || 0) - baselineWindowMs));
                const baselinePoints = baselineCandidates.length ? baselineCandidates : segment.slice(Math.max(0, startIdx - 2), startIdx + 1);
                const baselineValues = baselinePoints.map((point) => point.litersSmooth).filter((value) => Number.isFinite(value));
                const baseline = baselineValues.length
                    ? Math.min(medianForNumbers(baselineValues), ...baselineValues)
                    : (segment[startIdx].litersSmooth || 0);

                const riseAtPeak = (peakPoint.litersSmooth || 0) - baseline;
                if (riseAtPeak < riseThresholdLiters) {
                    i = Math.max(i + 1, peakIdx + 1);
                    continue;
                }

                const plateauCandidates = segment.filter((point, idx) => idx >= peakIdx && point.time <= ((peakPoint.time || 0) + plateauWindowMs));
                const plateauPoints = plateauCandidates.length >= 2
                    ? plateauCandidates.slice(0, Math.min(4, plateauCandidates.length))
                    : segment.slice(peakIdx, Math.min(segment.length, peakIdx + 3));
                const plateauValues = plateauPoints.map((point) => point.litersSmooth).filter((value) => Number.isFinite(value));
                const plateau = plateauValues.length ? medianForNumbers(plateauValues) : (peakPoint.litersSmooth || 0);
                const plateauSpread = plateauValues.length ? (Math.max(...plateauValues) - Math.min(...plateauValues)) : 0;
                const rise = plateau - baseline;
                const riseDurationMs = Math.max(0, (peakPoint.time || 0) - (segment[startIdx].time || 0));
                const clusterPoints = segment.slice(startIdx, Math.min(segment.length, peakIdx + Math.max(plateauPoints.length, 2)));
                const locationSpreadMeters = calculateClusterSpreadMeters(clusterPoints);
                const maxSpeedDuringCluster = clusterPoints.reduce((max, point) => Math.max(max, point.speed || 0), 0);
                const plateauStable = plateauSpread <= plateauSpreadMax;

                const qualityChecks = [
                    rise >= minRefuelLiters && rise <= maxRealisticRefillLiters,
                    riseDurationMs >= 60 * 1000 && riseDurationMs <= maxRiseMs,
                    plateauStable,
                    locationSpreadMeters <= maxStationarySpreadMeters,
                    maxSpeedDuringCluster <= (stopSpeedThreshold + 3),
                    positiveSteps >= 2 && negativeSteps <= Math.max(2, positiveSteps)
                ];
                const confidence = qualityChecks.filter(Boolean).length / qualityChecks.length;

                if (qualityChecks[0] && qualityChecks[1] && plateauStable && (confidence >= 0.66 || rise >= (minRefuelLiters * 1.35))) {
                    events.push({
                        index: peakPoint.index,
                        time: peakPoint.time,
                        startTimeMs: segment[startIdx].time,
                        endTimeMs: plateauPoints.length ? plateauPoints[plateauPoints.length - 1].time : peakPoint.time,
                        lat: peakPoint.lat,
                        lng: peakPoint.lng,
                        addedLiters: Math.round(rise),
                        oldLevel: Math.round(baseline),
                        newLevel: Math.round(plateau),
                        speed: peakPoint.speed,
                        ign: peakPoint.ign,
                        confidence: Math.round(confidence * 100) / 100,
                        detectionMode: 'stopped-ramp'
                    });
                }

                i = Math.max(i + 1, peakIdx + 1);
            }
        }

        segStart = segEnd + 1;
    }

    for (let i = 1; i < prepared.length - 1; i += 1) {
        const prev = prepared[i - 1];
        const cur = prepared[i];
        const next = prepared[i + 1];
        const stopishCount = [prev, cur, next].filter((point) => point.isStopLike).length;
        const gapMs = (next.time || 0) - (prev.time || 0);
        const afterValues = [cur.litersSmooth, next.litersSmooth];
        if (prepared[i + 2]) afterValues.push(prepared[i + 2].litersSmooth);
        const postStable = medianForNumbers(afterValues);
        const plateauSpread = afterValues.length ? (Math.max(...afterValues) - Math.min(...afterValues)) : 0;
        const netRise = postStable - prev.litersSmooth;
        const locationSpreadMeters = calculateClusterSpreadMeters([prev, cur, next, prepared[i + 2]].filter(Boolean));
        const maxSpeedDuringCluster = Math.max(prev.speed || 0, cur.speed || 0, next.speed || 0, (prepared[i + 2] && prepared[i + 2].speed) || 0);

        if (
            stopishCount >= 1 &&
            gapMs >= 60 * 1000 &&
            gapMs <= maxRiseMs &&
            netRise >= minRefuelLiters &&
            netRise <= maxRealisticRefillLiters &&
            plateauSpread <= (plateauSpreadMax + 2) &&
            locationSpreadMeters <= (maxStationarySpreadMeters * 1.35) &&
            maxSpeedDuringCluster <= (stopSpeedThreshold + 8)
        ) {
            events.push({
                index: cur.index,
                time: cur.time,
                startTimeMs: prev.time,
                endTimeMs: next.time,
                lat: cur.lat,
                lng: cur.lng,
                addedLiters: Math.round(netRise),
                oldLevel: Math.round(prev.litersSmooth),
                newLevel: Math.round(postStable),
                speed: cur.speed,
                ign: cur.ign,
                confidence: stopishCount >= 2 ? 0.76 : 0.68,
                detectionMode: stopishCount >= 2 ? 'sparse-window' : 'sparse-jump'
            });
        }
    }

    for (let i = 1; i < prepared.length - 2; i += 1) {
        const beforeWindow = prepared.slice(Math.max(0, i - 2), i + 1);
        const afterWindow = prepared.slice(i + 1, Math.min(prepared.length, i + 5));
        if (afterWindow.length < 2) continue;
        const baselineValues = beforeWindow.map((point) => point.litersSmooth).filter((value) => Number.isFinite(value));
        const afterValues = afterWindow.map((point) => point.litersSmooth).filter((value) => Number.isFinite(value));
        if (!baselineValues.length || !afterValues.length) continue;

        const baseline = Math.min(medianForNumbers(baselineValues), ...baselineValues);
        const postStable = medianForNumbers(afterValues);
        const rise = postStable - baseline;
        const postSpread = Math.max(...afterValues) - Math.min(...afterValues);
        const clusterPoints = beforeWindow.concat(afterWindow);
        const stopishCount = clusterPoints.filter((point) => point.isStopLike).length;
        const speedMax = clusterPoints.reduce((max, point) => Math.max(max, point.speed || 0), 0);
        const locationSpreadMeters = calculateClusterSpreadMeters(clusterPoints);
        const durationMs = (afterWindow[afterWindow.length - 1].time || 0) - (beforeWindow[0].time || 0);
        const sustainedCount = afterWindow.filter((point) => Math.abs((point.litersSmooth || 0) - postStable) <= Math.max(plateauSpreadMax + 2, settleToleranceLiters + 2)).length;
        const candidatePoint = afterWindow.reduce((best, point) => ((point.litersSmooth || 0) > (best.litersSmooth || 0) ? point : best), afterWindow[0]);

        if (
            durationMs >= 60 * 1000 &&
            durationMs <= (maxRiseMs * 1.25) &&
            rise >= Math.max(minRefuelLiters, softMinRefuelLiters) &&
            rise <= maxRealisticRefillLiters &&
            postSpread <= (plateauSpreadMax + 3) &&
            sustainedCount >= 2 &&
            locationSpreadMeters <= (maxStationarySpreadMeters * 1.5) &&
            speedMax <= (stopSpeedThreshold + 10)
        ) {
            let confidence = 0.62;
            if (stopishCount >= 2) confidence += 0.1;
            if (postSpread <= plateauSpreadMax) confidence += 0.06;
            if (speedMax <= (stopSpeedThreshold + 2)) confidence += 0.06;
            events.push({
                index: candidatePoint.index,
                time: candidatePoint.time,
                startTimeMs: beforeWindow[0].time,
                endTimeMs: afterWindow[afterWindow.length - 1].time,
                lat: candidatePoint.lat,
                lng: candidatePoint.lng,
                addedLiters: Math.round(rise),
                oldLevel: Math.round(baseline),
                newLevel: Math.round(postStable),
                speed: candidatePoint.speed,
                ign: candidatePoint.ign,
                confidence: Math.round(Math.min(0.86, confidence) * 100) / 100,
                detectionMode: 'jump-hold'
            });
        }
    }

    return mergeRefillEvents(events, dedupeMs, dedupeLitersTolerance).filter((event) => {
        const added = parseFloat(event.addedLiters);
        const confidence = parseFloat(event.confidence);
        return Number.isFinite(added) &&
            added >= minRefuelLiters &&
            added <= maxRealisticRefillLiters &&
            (!Number.isFinite(confidence) || confidence >= 0.56 || added >= Math.round(minRefuelLiters * 1.15));
    });
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

function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildTransportFingerprint({ truckName = '', start = null, end = null } = {}) {
  const normalizeTruck = String(truckName || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
  const minuteKey = (value) => {
    const ms = parseGpsDateTimeFlexible(value);
    if (!Number.isFinite(ms)) return '';
    return new Date(Math.round(ms / 60000) * 60000).toISOString().slice(0, 16);
  };
  return `${normalizeTruck}|${minuteKey(start)}|${minuteKey(end)}`;
}

function buildTransportIssueKey({ sourceFileName = '', sourceRow = '', truckName = '', start = '', end = '' } = {}) {
  return [sourceFileName, sourceRow, truckName, start, end].map((item) => String(item || '').trim()).join('|');
}

async function createOrUpdateTransportIssue(payload = {}) {
  const importIssueKey = buildTransportIssueKey(payload);
  const importFingerprint = payload.importFingerprint || buildTransportFingerprint({
    truckName: payload.truckName || payload.inputTruckName || '',
    start: payload.requestedStartAt || payload.startAt,
    end: payload.requestedEndAt || payload.endAt
  });

  const requestedStartAt = toDateOrNull(payload.requestedStartAt || payload.startAt);
  const requestedEndAt = toDateOrNull(payload.requestedEndAt || payload.endAt);
  const baseDoc = {
    truckName: payload.truckName || payload.inputTruckName || '',
    inputTruckName: payload.inputTruckName || payload.truckName || '',
    deviceId: payload.deviceId || '',
    startAt: requestedStartAt,
    endAt: requestedEndAt,
    requestedStartAt,
    requestedEndAt,
    startLocation: payload.startLocation || '',
    endLocation: payload.endLocation || '',
    note: payload.note || '',
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    status: payload.status || 'issue',
    issueReason: payload.issueReason || 'Ligne non calculée',
    issueCategory: payload.issueCategory || 'import-error',
    issueDetails: payload.issueDetails || {},
    sourceType: payload.sourceType || 'import-exception',
    sourceFileName: payload.sourceFileName || '',
    sourceRow: Number(payload.sourceRow) || null,
    importFingerprint,
    importIssueKey,
    editedAt: new Date()
  };

  const selector = importIssueKey
    ? { importIssueKey }
    : (importFingerprint ? { importFingerprint, status: { $ne: 'ok' } } : null);

  if (!selector) return TransportReportEntry.create(baseDoc);
  return TransportReportEntry.findOneAndUpdate(
    selector,
    { $set: baseDoc, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, new: true }
  );
}

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


function parseGpsDateTimeFlexible(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const text = String(value || '').trim();
  if (!text) return NaN;
  if (/^\d{13}$/.test(text)) return parseInt(text, 10);
  if (/^\d{10}$/.test(text)) return parseInt(text, 10) * 1000;

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    ).getTime();
  }

  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    ).getTime();
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatGpsApiDateTime(value) {
  const ms = parseGpsDateTimeFlexible(value);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function encodeGpsHistoryBoundary(value) {
  return formatGpsApiDateTime(value).replace(/ /g, '%20');
}

function extractHistoryParams(message) {
  if (Array.isArray(message)) {
    if (message[6] && typeof message[6] === 'object') return message[6];
    if (message[7] && typeof message[7] === 'object') return message[7];
    if (message[8] && typeof message[8] === 'object') return message[8];
    return {};
  }
  return (message && message.params && typeof message.params === 'object') ? message.params : {};
}

function extractOdometerKmFromParams(params = {}) {
  if (params.io192 !== undefined && params.io192 !== null && params.io192 !== '') {
    const meters = parseFloat(params.io192);
    if (Number.isFinite(meters)) return Math.round((meters / 1000) * 100) / 100;
  }

  const keys = ['odometer_km', 'mileage_km', 'odometer', 'mileage', 'distance', 'io210'];
  for (const key of keys) {
    if (params[key] === undefined || params[key] === null || params[key] === '') continue;
    const raw = parseFloat(params[key]);
    if (!Number.isFinite(raw)) continue;
    return raw > 1000000 ? Math.round((raw / 1000) * 100) / 100 : Math.round(raw * 100) / 100;
  }

  return null;
}

function normalizeGpsHistoryMessages(rawMessages, deviceId, truckConfig) {
  const rawList = Array.isArray(rawMessages)
    ? rawMessages
    : ((rawMessages && Array.isArray(rawMessages.messages)) ? rawMessages.messages : []);

  return rawList.map((message) => {
    const params = extractHistoryParams(message);
    const timeRaw = Array.isArray(message)
      ? (message[0] ?? message.timestamp ?? message.time)
      : (message.timestamp ?? message.time ?? message.t);
    const time = parseGpsDateTimeFlexible(timeRaw);
    const lat = Array.isArray(message) ? parseFloat(message[1]) : parseFloat(message && message.lat);
    const lng = Array.isArray(message) ? parseFloat(message[2]) : parseFloat(message && message.lng);
    const speed = Array.isArray(message)
      ? (parseFloat((message[5] !== undefined ? message[5] : message[3] ?? params.io24 ?? params.io80) || params.io24 || params.io80 || 0) || 0)
      : (parseFloat((message && message.speed) ?? params.io24 ?? params.io80 ?? 0) || 0);
    const ign = Array.isArray(message)
      ? (parseInt(params.io1 ?? params.acc ?? params.io22 ?? params.io239 ?? params.io240 ?? message[4] ?? 0, 10) || 0)
      : (parseInt(params.io1 ?? params.acc ?? params.io22 ?? params.io239 ?? params.io240 ?? (message && message.ign) ?? 0, 10) || 0);
    const fuelData = calculateFuelMetricsFromParams(params || {}, truckConfig || getTruckConfig(deviceId));
    const odometerKm = extractOdometerKmFromParams(params);
    return {
      time,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      speed,
      ign,
      params,
      fuelLiters: Number.isFinite(fuelData.liters) ? fuelData.liters : 0,
      fuelPercent: Number.isFinite(fuelData.percent) ? fuelData.percent : 0,
      odometerKm,
      raw: message
    };
  }).filter((point) => Number.isFinite(point.time)).sort((a, b) => a.time - b.time);
}

async function fetchGpsHistoryWindow(deviceId, start, end) {
  const safeStart = encodeGpsHistoryBoundary(start);
  const safeEnd = encodeGpsHistoryBoundary(end);
  if (!safeStart || !safeEnd) throw new Error('Période invalide pour l\'historique GPS');

  const url = `https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_MESSAGES,${deviceId},${safeStart},${safeEnd}`;
  const https = require('https');
  const agent = new https.Agent({ rejectUnauthorized: false });
  const response = await fetch(url, { agent });
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    return json.messages || json.data || json;
  } catch (error) {
    throw new Error(`Provider Error: ${text}`);
  }
}

function calculatePolylineDistanceKm(points = []) {
  const safe = (Array.isArray(points) ? points : []).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  let totalKm = 0;
  for (let i = 1; i < safe.length; i += 1) {
    totalKm += calculateDistance(safe[i - 1].lat, safe[i - 1].lng, safe[i].lat, safe[i].lng) / 1000;
  }
  return Math.round(totalKm * 100) / 100;
}

function pickBoundaryHistoryPoint(points, targetMs, boundary = 'start') {
  const safe = Array.isArray(points) ? points : [];
  if (!safe.length || !Number.isFinite(targetMs)) return null;
  const before = safe.filter(point => point.time <= targetMs);
  const after = safe.filter(point => point.time >= targetMs);
  const beforePoint = before.length ? before[before.length - 1] : null;
  const afterPoint = after.length ? after[0] : null;

  let point = null;
  if (!beforePoint) point = afterPoint;
  else if (!afterPoint) point = beforePoint;
  else {
    const beforeGap = Math.abs(targetMs - beforePoint.time);
    const afterGap = Math.abs(afterPoint.time - targetMs);
    point = boundary === 'end'
      ? (beforeGap <= (afterGap + (5 * 60 * 1000)) ? beforePoint : afterPoint)
      : (afterGap <= (beforeGap + (5 * 60 * 1000)) ? afterPoint : beforePoint);
  }

  if (!point) return null;
  return {
    ...point,
    gapMinutes: Math.round((Math.abs((point.time || 0) - targetMs) / 60000) * 10) / 10
  };
}

function resolveLocationName(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Position inconnue';
  const locations = Array.isArray(SYSTEM_SETTINGS.customLocations) ? SYSTEM_SETTINGS.customLocations : [];
  for (const loc of locations) {
    if (!Number.isFinite(parseFloat(loc.lat)) || !Number.isFinite(parseFloat(loc.lng))) continue;
    const dist = calculateDistance(lat, lng, parseFloat(loc.lat), parseFloat(loc.lng));
    if (dist <= (parseFloat(loc.radius) || 500)) return loc.name;
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}


function getRefuelSourcePriority(source = '') {
  const normalized = String(source || '').trim().toLowerCase();
  const priorities = {
    'manual': 100,
    'manual-entry': 100,
    'gps-history-nightly': 80,
    'gps-history-reconciled': 80,
    'gps-history-rebuild': 70,
    'gps-history-verified': 65,
    'live-verified': 40,
    'live-replay': 30,
    'live-bot': 20,
    'legacy': 10
  };
  return priorities[normalized] || 10;
}

function isAutoRefuelSource(source = '') {
  const normalized = String(source || '').trim().toLowerCase();
  return !normalized || normalized === 'legacy' || normalized.startsWith('live-') || normalized.startsWith('gps-history-');
}

function getRefuelConfidenceValue(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

function roundLevel(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function areRefuelRecordsEquivalent(a, b, options = {}) {
  const timeA = parseGpsDateTimeFlexible(a && (a.time || a.timestamp));
  const timeB = parseGpsDateTimeFlexible(b && (b.time || b.timestamp));
  const timeToleranceMs = Math.max(5 * 60 * 1000, parseFloat(options.timeToleranceMs) || 0);
  if (Number.isFinite(timeA) && Number.isFinite(timeB) && Math.abs(timeA - timeB) > timeToleranceMs) return false;

  const levelTolerance = Math.max(6, parseFloat(options.levelTolerance) || 10);
  const addedTolerance = Math.max(10, parseFloat(options.addedTolerance) || 20);

  const oldA = roundLevel(a && a.oldLevel);
  const newA = roundLevel(a && a.newLevel);
  const oldB = roundLevel(b && b.oldLevel);
  const newB = roundLevel(b && b.newLevel);
  const addedA = roundLevel(a && a.addedLiters);
  const addedB = roundLevel(b && b.addedLiters);

  let signals = 0;
  if (oldA !== null && oldB !== null && Math.abs(oldA - oldB) <= levelTolerance) signals += 1;
  if (newA !== null && newB !== null && Math.abs(newA - newB) <= levelTolerance) signals += 1;
  if (addedA !== null && addedB !== null && Math.abs(addedA - addedB) <= addedTolerance) signals += 1;
  if (newA !== null && oldB !== null && Math.abs(newA - oldB) <= levelTolerance) signals += 0.5;
  if (newB !== null && oldA !== null && Math.abs(newB - oldA) <= levelTolerance) signals += 0.5;
  return signals >= 2;
}

function choosePreferredRefuelRecord(records = []) {
  return (Array.isArray(records) ? records : []).filter(Boolean).sort((a, b) => {
    const priorityDiff = getRefuelSourcePriority(b.source) - getRefuelSourcePriority(a.source);
    if (priorityDiff !== 0) return priorityDiff;
    const confidenceDiff = getRefuelConfidenceValue(b && b.meta && b.meta.confidence) - getRefuelConfidenceValue(a && a.meta && a.meta.confidence);
    if (confidenceDiff !== 0) return confidenceDiff;
    const addedDiff = (parseFloat(b && b.addedLiters) || 0) - (parseFloat(a && a.addedLiters) || 0);
    if (addedDiff !== 0) return addedDiff;
    const timeA = parseGpsDateTimeFlexible(a && (a.timestamp || a.time)) || 0;
    const timeB = parseGpsDateTimeFlexible(b && (b.timestamp || b.time)) || 0;
    return timeB - timeA;
  })[0] || null;
}

async function dedupeRefuelsForWindow({ deviceId, startMs, endMs, dryRun = false } = {}) {
  if (!deviceId || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { scanned: 0, duplicateGroups: 0, deletedCount: 0, keptCount: 0, keptIds: [], deletedIds: [] };
  }

  const rules = getResolvedRefuelRules();
  const timeToleranceMs = Math.max((parseFloat(rules.dedupeMinutes) || 12) * 60 * 1000, 20 * 60 * 1000);
  const levelTolerance = Math.max(8, parseFloat(rules.dedupeLitersTolerance) || 12);
  const rows = await Refuel.find({
    deviceId: String(deviceId),
    timestamp: { $gte: new Date(startMs - timeToleranceMs), $lte: new Date(endMs + timeToleranceMs) }
  }).sort({ timestamp: 1 });

  const groups = [];
  for (const row of rows) {
    const current = row.toObject ? row.toObject() : row;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && areRefuelRecordsEquivalent(lastGroup[lastGroup.length - 1], current, { timeToleranceMs, levelTolerance })) {
      lastGroup.push(current);
    } else {
      groups.push([current]);
    }
  }

  let duplicateGroups = 0;
  const deleteIds = [];
  const keepIds = [];
  for (const group of groups) {
    if (group.length <= 1) {
      if (group[0] && group[0]._id) keepIds.push(String(group[0]._id));
      continue;
    }
    duplicateGroups += 1;
    const winner = choosePreferredRefuelRecord(group);
    if (winner && winner._id) keepIds.push(String(winner._id));
    for (const item of group) {
      if (!winner || String(item._id) !== String(winner._id)) deleteIds.push(String(item._id));
    }
  }

  if (!dryRun && deleteIds.length) {
    await Refuel.deleteMany({ _id: { $in: deleteIds } });
  }

  return {
    scanned: rows.length,
    duplicateGroups,
    deletedCount: deleteIds.length,
    keptCount: keepIds.length,
    keptIds: keepIds,
    deletedIds: deleteIds
  };
}

async function deleteAutoRefuelsForWindow({ deviceId, startMs, endMs } = {}) {
  if (!deviceId || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  const cleanup = await Refuel.deleteMany({
    deviceId: String(deviceId),
    timestamp: { $gte: new Date(startMs), $lte: new Date(endMs) },
    source: { $in: ['live-bot', 'live-replay', 'live-verified', 'gps-history-rebuild', 'gps-history-verified', 'gps-history-reconciled', 'gps-history-nightly'] }
  });
  return cleanup.deletedCount || 0;
}

async function deleteLowVolumeAutoRefuelsForWindow({ deviceId, startMs, endMs, minLiters } = {}) {
  if (!deviceId || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  const cleanup = await Refuel.deleteMany({
    deviceId: String(deviceId),
    timestamp: { $gte: new Date(startMs), $lte: new Date(endMs) },
    addedLiters: { $lt: Math.max(60, parseFloat(minLiters) || 60) },
    source: { $in: ['live-bot', 'live-replay', 'live-verified', 'gps-history-rebuild', 'gps-history-verified', 'gps-history-reconciled', 'gps-history-nightly'] }
  });
  return cleanup.deletedCount || 0;
}

async function reconcileRefuelsForWindow({ deviceId, truckName, startMs, endMs, persist = true, purgeExistingAuto = true, source = 'gps-history-reconciled' } = {}) {
  if (!deviceId || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('Période invalide pour la réconciliation carburant');

  const rules = getResolvedRefuelRules();
  let deletedCount = 0;
  if (purgeExistingAuto) {
    deletedCount += await deleteAutoRefuelsForWindow({ deviceId, startMs, endMs });
  }
  deletedCount += await deleteLowVolumeAutoRefuelsForWindow({ deviceId, startMs, endMs, minLiters: rules.minRefuelLiters });

  const scan = await scanRefillsFromHistoryWindow({
    deviceId: String(deviceId),
    truckName: truckName || String(deviceId),
    start: startMs,
    end: endMs,
    persist,
    source
  });
  const dedupe = await dedupeRefuelsForWindow({ deviceId: String(deviceId), startMs, endMs, dryRun: !persist });
  return {
    ...scan,
    deletedCount,
    dedupe
  };
}

async function runNightlyRefuelReconciliation(force = false) {
  if (REFUEL_RECONCILE_STATE.running) return REFUEL_RECONCILE_STATE.lastSummary || { skipped: true, reason: 'running' };

  const localNow = new Date(Date.now() + 60 * 60 * 1000);
  const localHour = localNow.getUTCHours();
  // ⚡ BANDWIDTH FIX: Only reconcile yesterday + today (was 13 days!)
  // 13 days × all trucks × 36h of GPS history = massive bandwidth consumption
  const targetDates = [];
  for (let daysAgo = 0; daysAgo <= 1; daysAgo += 1) {
    const d = new Date(localNow);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    targetDates.push(d.toISOString().slice(0, 10));
  }
  const dailyKey = targetDates.join(',');

  if (!force && localHour < 23) {
    return { skipped: true, reason: 'too-early', hour: localHour, targetDates };
  }
  if (!force && REFUEL_RECONCILE_STATE.lastRunYmd === dailyKey) {
    return REFUEL_RECONCILE_STATE.lastSummary || { skipped: true, reason: 'already-ran', targetDates };
  }

  REFUEL_RECONCILE_STATE.running = true;
  try {
    const trucks = await Truck.find({}, 'deviceId truckName').sort({ truckName: 1 });
    const summary = { targetDates, truckCount: trucks.length, windows: [], totalDeleted: 0, totalCreated: 0, totalDuplicatesDeleted: 0, totalErrors: 0 };

    for (const ymd of targetDates) {
      const windowStartMs = parseGpsDateTimeFlexible(`${ymd} 00:00:00`);
      const windowEndMs = parseGpsDateTimeFlexible(`${ymd} 23:59:59`);
      const windowSummary = { ymd, trucks: 0, deleted: 0, created: 0, duplicatesDeleted: 0, errors: [] };

      for (const truck of trucks) {
        if (!truck || !truck.deviceId) continue;
        try {
          const result = await reconcileRefuelsForWindow({
            deviceId: String(truck.deviceId),
            truckName: truck.truckName || String(truck.deviceId),
            startMs: windowStartMs,
            endMs: windowEndMs,
            persist: true,
            purgeExistingAuto: true,
            source: 'gps-history-nightly'
          });
          windowSummary.trucks += 1;
          windowSummary.deleted += result.deletedCount || 0;
          windowSummary.created += result.createdCount || 0;
          windowSummary.duplicatesDeleted += (result.dedupe && result.dedupe.deletedCount) || 0;
        } catch (error) {
          windowSummary.errors.push({ deviceId: String(truck.deviceId), truckName: truck.truckName || String(truck.deviceId), error: error.message });
        }
      }

      summary.totalDeleted += windowSummary.deleted;
      summary.totalCreated += windowSummary.created;
      summary.totalDuplicatesDeleted += windowSummary.duplicatesDeleted;
      summary.totalErrors += windowSummary.errors.length;
      summary.windows.push(windowSummary);
    }

    REFUEL_RECONCILE_STATE.lastRunYmd = dailyKey;
    REFUEL_RECONCILE_STATE.lastSummary = { success: true, ...summary, finishedAt: new Date().toISOString() };
    console.log(`⛽ Nightly refuel reconcile done: +${summary.totalCreated} created, ${summary.totalDeleted} auto-rows reset, ${summary.totalDuplicatesDeleted} duplicates removed.`);
    return REFUEL_RECONCILE_STATE.lastSummary;
  } finally {
    REFUEL_RECONCILE_STATE.running = false;
  }
}


// ============================================================
// 🛡️ SELF-HEALING ENGINE — Auto-recovery from GPS data gaps
// ============================================================
let RECOVERY_STATE = { running: false, lastRecoveryAt: null, lastError: null, recoveredCount: 0 };

async function recordMissedWindow(startMs, endMs, reason = 'bot-failure') {
  try {
    if ((endMs - startMs) < 3 * 60 * 1000) return;
    const overlap = await MissedWindow.findOne({ startMs: { $lte: endMs }, endMs: { $gte: startMs }, recoveredAt: null });
    if (!overlap) {
      await MissedWindow.create({ startMs, endMs, reason });
      console.log(`\uD83D\uDD73\uFE0F Missed window recorded: ${new Date(startMs).toISOString()} \u2192 ${new Date(endMs).toISOString()} [${reason}]`);
    }
  } catch (e) { console.error('recordMissedWindow error:', e.message); }
}

async function recoverMissedWindows({ maxWindows = 3, delayBetweenMs = 8000 } = {}) {
  if (RECOVERY_STATE.running) return { skipped: true, reason: 'already-running' };
  RECOVERY_STATE.running = true;
  const results = [];
  try {
    const pending = await MissedWindow.find({ recoveredAt: null }).sort({ startMs: 1 }).limit(maxWindows).lean();
    if (!pending.length) return { recovered: 0, message: 'No missed windows pending' };

    console.log(`\uD83D\uDD04 Self-Healing: processing ${pending.length} missed window(s)...`);
    const trucks = await Truck.find({}, 'deviceId truckName').sort({ truckName: 1 }).lean();
    if (!trucks.length) return { recovered: 0, message: 'No trucks in DB' };

    for (const win of pending) {
      const winResult = { id: win._id, start: new Date(win.startMs).toISOString(), end: new Date(win.endMs).toISOString(), reason: win.reason, totalCreated: 0, totalSkipped: 0, errors: [] };
      for (const truck of trucks) {
        try {
          // \u2705 SAFE: purgeExistingAuto only removes GPS-auto-detected refuels.
          // source='manual' / source='manual-entry' refuels are NEVER touched.
          // Maintenance entries with isAuto=false are NEVER touched (different collection).
          const result = await reconcileRefuelsForWindow({
            deviceId: String(truck.deviceId),
            truckName: truck.truckName || String(truck.deviceId),
            startMs: win.startMs, endMs: win.endMs,
            persist: true, purgeExistingAuto: true, source: 'gps-history-recovery'
          });
          winResult.totalCreated += result.createdCount || 0;
          winResult.totalSkipped += result.skippedCount || 0;
        } catch (e) {
          winResult.errors.push({ truck: truck.truckName, error: e.message });
          console.error(`  \u26A0\uFE0F Recovery error ${truck.truckName}:`, e.message);
        }
      }
      await MissedWindow.findByIdAndUpdate(win._id, { recoveredAt: new Date(), truckCount: trucks.length });
      RECOVERY_STATE.recoveredCount++;
      RECOVERY_STATE.lastRecoveryAt = new Date().toISOString();
      console.log(`\u2705 Recovered window ${new Date(win.startMs).toISOString().slice(0,10)}: +${winResult.totalCreated} refuels`);
      results.push(winResult);
      if (pending.length > 1 && delayBetweenMs > 0) await new Promise(r => setTimeout(r, delayBetweenMs));
    }
    return { recovered: results.length, results };
  } catch (e) {
    RECOVERY_STATE.lastError = e.message;
    console.error('recoverMissedWindows fatal:', e.message);
    return { error: e.message };
  } finally {
    RECOVERY_STATE.running = false;
  }
}

async function runStartupBackfill(daysBack = 3) {
  try {
    console.log(`\uD83D\uDE80 Startup Backfill: scanning last ${daysBack} days for missing data...`);
    const now = Date.now();
    const startMs = now - (daysBack * 24 * 60 * 60 * 1000);
    const existing = await MissedWindow.findOne({ startMs: { $gte: startMs - 60 * 60 * 1000 }, reason: 'startup-gap', recoveredAt: null });
    if (!existing) {
      await MissedWindow.create({ startMs, endMs: now, reason: 'startup-gap' });
      console.log(`\uD83D\uDCCB Startup backfill window queued (last ${daysBack} days)`);
    }
    // Process with 15s delay between trucks to be bandwidth-friendly
    const result = await recoverMissedWindows({ maxWindows: 2, delayBetweenMs: 15000 });
    console.log(`\u2705 Startup Backfill done:`, JSON.stringify({ recovered: result.recovered, error: result.error }));
    return result;
  } catch (e) {
    console.error('runStartupBackfill error:', e.message);
    return { error: e.message };
  }
}

async function persistDetectedRefills(deviceId, truckName, refillEvents = [], persist = true, options = {}) {
  const created = [];
  const skipped = [];
  const updated = [];
  const rules = getResolvedRefuelRules();
  const dedupeMs = Math.max(0, (parseFloat(rules.dedupeMinutes) || 8) * 60 * 1000);
  const levelTolerance = parseFloat(rules.dedupeLitersTolerance ?? 10) || 10;
  const source = options.source || 'gps-history-verified';

  for (const event of (Array.isArray(refillEvents) ? refillEvents : [])) {
    const timeMs = parseGpsDateTimeFlexible(event.time);
    if (!Number.isFinite(timeMs)) continue;

    const lat = Number.isFinite(parseFloat(event.lat)) ? parseFloat(event.lat) : null;
    const lng = Number.isFinite(parseFloat(event.lng)) ? parseFloat(event.lng) : null;
    const locationRaw = resolveLocationName(lat, lng);
    const isInternal = (Array.isArray(SYSTEM_SETTINGS.customLocations) ? SYSTEM_SETTINGS.customLocations : []).some((loc) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      if (!Number.isFinite(parseFloat(loc.lat)) || !Number.isFinite(parseFloat(loc.lng))) return false;
      return calculateDistance(lat, lng, parseFloat(loc.lat), parseFloat(loc.lng)) <= (parseFloat(loc.radius) || 500);
    });

    if (Math.round(event.addedLiters || 0) < Math.max(60, parseFloat(rules.minRefuelLiters) || 60)) {
      continue;
    }

    const candidate = {
      deviceId,
      truckName,
      addedLiters: Math.round(event.addedLiters || 0),
      oldLevel: Math.round(event.oldLevel || 0),
      newLevel: Math.round(event.newLevel || 0),
      timestamp: new Date(timeMs),
      locationRaw,
      isInternal,
      lat,
      lng,
      source,
      meta: {
        detectionMode: event.detectionMode || 'history',
        confidence: parseFloat(event.confidence) || null,
        version: 3,
        reconciledAt: new Date().toISOString()
      }
    };

    const nearby = await Refuel.find({
      deviceId,
      timestamp: {
        $gte: new Date(timeMs - Math.max(dedupeMs, 20 * 60 * 1000)),
        $lte: new Date(timeMs + Math.max(dedupeMs, 20 * 60 * 1000))
      }
    }).sort({ timestamp: -1 });

    const duplicate = nearby.find((row) => areRefuelRecordsEquivalent(row, candidate, {
      timeToleranceMs: Math.max(dedupeMs, 20 * 60 * 1000),
      levelTolerance,
      addedTolerance: Math.max(15, levelTolerance * 1.5)
    }));

    if (duplicate) {
      const existingPriority = getRefuelSourcePriority(duplicate.source);
      const incomingPriority = getRefuelSourcePriority(candidate.source);
      const existingConfidence = getRefuelConfidenceValue(duplicate.meta && duplicate.meta.confidence);
      const incomingConfidence = getRefuelConfidenceValue(candidate.meta && candidate.meta.confidence);
      const shouldUpgrade = incomingPriority > existingPriority || (incomingPriority === existingPriority && incomingConfidence > existingConfidence);

      if (!persist) {
        skipped.push(duplicate.toObject ? duplicate.toObject() : duplicate);
        continue;
      }

      if (shouldUpgrade) {
        await Refuel.findByIdAndUpdate(duplicate._id, { $set: candidate });
        updated.push({ ...(duplicate.toObject ? duplicate.toObject() : duplicate), ...candidate, _id: duplicate._id });
      } else {
        skipped.push(duplicate.toObject ? duplicate.toObject() : duplicate);
      }
      continue;
    }

    if (!persist) {
      created.push(candidate);
      continue;
    }

    const doc = await Refuel.create(candidate);
    created.push(doc.toObject ? doc.toObject() : doc);
  }

  return { created, skipped, updated };
}

async function scanRefillsFromHistoryWindow({ deviceId, truckName, start, end, persist = true, source = 'gps-history-verified' }) {
  const config = getTruckConfig(deviceId);
  const requestedStartMs = parseGpsDateTimeFlexible(start);
  const requestedEndMs = parseGpsDateTimeFlexible(end);
  // ⚡ BANDWIDTH FIX: Reduced buffer from ±6h to ±1h
  // Old: 6h buffer on each side = 36h of data fetched per day-window per truck
  // New: 1h buffer = 26h fetched — covers overlap without wasting 10h extra per truck
  const scanBufferMs = 1 * 60 * 60 * 1000;
  const rawMessages = await fetchGpsHistoryWindow(deviceId, requestedStartMs - scanBufferMs, requestedEndMs + scanBufferMs);
  const points = normalizeGpsHistoryMessages(rawMessages, deviceId, config);
  const effectiveCapacity = getConfiguredFuelEffectiveCapacity(config) || config.fuelTankCapacity || 600;
  const baseRules = getResolvedRefuelRules();
  const rules = getResolvedRefuelRules({
    minRefuelLiters: Math.max(60, parseFloat(baseRules.minRefuelLiters) || 60),
    maxRealisticRefillLiters: Math.max(Math.round((effectiveCapacity || 600) + 50), parseFloat(baseRules.maxRealisticRefillLiters) || 0)
  });
  const refillEvents = detectRefillEventsFromSeries(points.map((point) => ({
    time: point.time,
    liters: point.fuelLiters,
    speed: point.speed,
    ign: point.ign,
    lat: point.lat,
    lng: point.lng
  })), rules).filter((event) => event.time >= requestedStartMs && event.time <= requestedEndMs);

  const persisted = await persistDetectedRefills(deviceId, truckName, refillEvents, persist, { source });

  return {
    points,
    refills: refillEvents,
    createdCount: persisted.created.length,
    skippedCount: persisted.skipped.length,
    updatedCount: persisted.updated.length,
    created: persisted.created
  };
}

async function calculateTransportWindowStats({ deviceId, truckName, start, end, persist = false, note = '' }) {
  const requestedStartMs = parseGpsDateTimeFlexible(start);
  const requestedEndMs = parseGpsDateTimeFlexible(end);
  if (!Number.isFinite(requestedStartMs) || !Number.isFinite(requestedEndMs) || requestedEndMs <= requestedStartMs) {
    throw new Error('Période invalide');
  }

  const bufferMs = 60 * 60 * 1000;
  const config = getTruckConfig(deviceId);
  const rawMessages = await fetchGpsHistoryWindow(deviceId, requestedStartMs - bufferMs, requestedEndMs + bufferMs);
  const points = normalizeGpsHistoryMessages(rawMessages, deviceId, config);
  if (points.length < 2) throw new Error('Historique insuffisant pour cette période');

  const startPoint = pickBoundaryHistoryPoint(points, requestedStartMs, 'start');
  const endPoint = pickBoundaryHistoryPoint(points, requestedEndMs, 'end');
  if (!startPoint || !endPoint) throw new Error('Impossible de déterminer les points A et B');
  if ((endPoint.time || 0) <= (startPoint.time || 0)) throw new Error('Les points GPS trouvés sont incohérents');

  const windowPoints = points.filter(point => point.time >= (startPoint.time || requestedStartMs) && point.time <= (endPoint.time || requestedEndMs));
  const effectiveCapacity = getConfiguredFuelEffectiveCapacity(config) || config.fuelTankCapacity || 600;
  const baseRules = getResolvedRefuelRules();
  const rules = getResolvedRefuelRules({
    minRefuelLiters: Math.max(60, parseFloat(baseRules.minRefuelLiters) || 60),
    maxRealisticRefillLiters: Math.max(Math.round((effectiveCapacity || 600) + 50), parseFloat(baseRules.maxRealisticRefillLiters) || 0)
  });
  const refillEventsAll = detectRefillEventsFromSeries(windowPoints.map((point) => ({
    time: point.time,
    liters: point.fuelLiters,
    speed: point.speed,
    ign: point.ign,
    lat: point.lat,
    lng: point.lng
  })), rules);
  const refillEvents = refillEventsAll.filter((event) => event.time >= requestedStartMs && event.time <= requestedEndMs);

  const fuelAddedDuringTrip = Math.round(refillEvents.reduce((sum, event) => sum + (parseFloat(event.addedLiters) || 0), 0) * 100) / 100;
  const fuelStart = Math.round((parseFloat(startPoint.fuelLiters) || 0) * 100) / 100;
  const fuelEnd = Math.round((parseFloat(endPoint.fuelLiters) || 0) * 100) / 100;
  const fuelConsumedRaw = Math.max(0, Math.round((fuelStart - fuelEnd) * 100) / 100);
  const fuelConsumedTotal = Math.max(0, Math.round((fuelStart + fuelAddedDuringTrip - fuelEnd) * 100) / 100);

  const gpsDistanceKm = calculatePolylineDistanceKm(windowPoints);
  const startOdo = Number.isFinite(parseFloat(startPoint.odometerKm)) ? parseFloat(startPoint.odometerKm) : null;
  const endOdo = Number.isFinite(parseFloat(endPoint.odometerKm)) ? parseFloat(endPoint.odometerKm) : null;
  let kmTotal = gpsDistanceKm;
  let distanceSource = 'gps-distance';
  if (Number.isFinite(startOdo) && Number.isFinite(endOdo) && endOdo >= startOdo && (endOdo - startOdo) <= 5000) {
    kmTotal = Math.round((endOdo - startOdo) * 100) / 100;
    distanceSource = 'odometer';
  }

  const warnings = [];
  if ((startPoint.gapMinutes || 0) > 20) warnings.push(`Point A éloigné de ${startPoint.gapMinutes} min`);
  if ((endPoint.gapMinutes || 0) > 20) warnings.push(`Point B éloigné de ${endPoint.gapMinutes} min`);
  if (distanceSource !== 'odometer') warnings.push('Kilométrage calculé par trace GPS (odomètre indisponible)');
  if (!fuelStart && !fuelEnd) warnings.push('Capteur carburant absent ou non lu sur cette période');
  const lowConfidenceRefills = refillEvents.filter((event) => Number.isFinite(parseFloat(event.confidence)) && parseFloat(event.confidence) < 0.8);
  if (lowConfidenceRefills.length) warnings.push(`${lowConfidenceRefills.length} plein(s) détecté(s) sur signal bruité: vérifiez la carte`);
  if (refillEvents.some((event) => (event.detectionMode || '').includes('sparse'))) warnings.push("Historique GPS clairsemé autour d'au moins un plein");

  const summary = {
    truckName,
    deviceId,
    startAt: new Date(startPoint.time),
    endAt: new Date(endPoint.time),
    requestedStartAt: new Date(requestedStartMs),
    requestedEndAt: new Date(requestedEndMs),
    actualStartAt: new Date(startPoint.time),
    actualEndAt: new Date(endPoint.time),
    kmStart: startOdo,
    kmEnd: endOdo,
    kmTotal,
    gpsDistanceKm,
    distanceSource,
    fuelStart,
    fuelEnd,
    fuelAddedDuringTrip,
    fuelConsumedRaw,
    fuelConsumedTotal,
    refillCount: refillEvents.length,
    historyPoints: windowPoints.length,
    startLocation: resolveLocationName(startPoint.lat, startPoint.lng),
    endLocation: resolveLocationName(endPoint.lat, endPoint.lng),
    note,
    warnings,
    refills: refillEvents.map((event) => ({
      time: new Date(event.time),
      addedLiters: Math.round(event.addedLiters || 0),
      oldLevel: Math.round(event.oldLevel || 0),
      newLevel: Math.round(event.newLevel || 0),
      lat: event.lat,
      lng: event.lng,
      detectionMode: event.detectionMode || 'history',
      confidence: Number.isFinite(parseFloat(event.confidence)) ? Math.round(parseFloat(event.confidence) * 100) / 100 : null,
      locationRaw: resolveLocationName(event.lat, event.lng)
    }))
  };

  if (persist && refillEvents.length) {
    await persistDetectedRefills(deviceId, truckName, refillEvents, true);
  }

  return summary;
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
  const botStartMs = Date.now();
  try {
    const response = await fetch(GPS_API_URL);
    const json = await response.json();
    rawData = json.data || json;
    BOT_LAST_SUCCESS_MS = botStartMs; // ✅ Track successful fetch time
  } catch (e) {
    console.error("⚠️ Bot Fetch Error:", e.message);
    // 🛡️ Record missed window so self-healing can recover later
    if (BOT_LAST_SUCCESS_MS > 0) {
      recordMissedWindow(BOT_LAST_SUCCESS_MS, botStartMs, 'bot-fetch-failure').catch(() => {});
    }
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

    // --- FUEL CALCULATION ---
    const fuelData = calculateFuelMetricsFromParams(truck.params || {}, config);
    const currentLiters = fuelData.liters || 0;
    const effectiveFuelCapacity = fuelData.effectiveCapacity || getConfiguredFuelEffectiveCapacity(config) || config.fuelTankCapacity || 600;

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
    const refuelRulesLocal = getResolvedRefuelRules({
      maxRealisticRefillLiters: Math.max(
        parseFloat((SYSTEM_SETTINGS.refuelRules || {}).maxRealisticRefillLiters) || 0,
        Math.round((effectiveFuelCapacity || 600) + 50)
      )
    });
    const STOP_SPEED = parseInt(refuelRulesLocal.stopSpeedThreshold, 10) || 4;
    const engineIsOff = hasIgn ? (!ignOn && speed === 0) : (speed < STOP_SPEED);
    const engineIsOn = !engineIsOff;

    const truckLat = parseFloat(truck.lat);
    const truckLng = parseFloat(truck.lng);

    let dbTruck = await Truck.findOne({ deviceId });

    if (!dbTruck) {
      const initialEngineState = {
        refuelAnchorLiters: currentLiters,
        lastAcceptedRefuelTime: 0,
        lastAcceptedRefuelLevel: currentLiters,
        fuelSamples: [{ time: now, liters: currentLiters, speed, ign: hasIgn ? ignVal : (speed < STOP_SPEED ? 0 : 1), lat: truckLat, lng: truckLng }]
      };

      await Truck.findOneAndUpdate({ deviceId }, {
        truckName, lastUpdate: now, lastFuelLiters: currentLiters,
        lastFuelPercent: fuelData.percent || 0,
        lat: truckLat, lng: truckLng, speed, params: truck.params,
        engineState: initialEngineState
      }, { upsert: true });
      continue;
    }

    const MIN_REFUEL_L = Math.max(60, parseFloat(refuelRulesLocal.minRefuelLiters) || 60);
    const DEDUPE_MS = (parseFloat(refuelRulesLocal.dedupeMinutes) || 8) * 60 * 1000;
    const DEDUPE_LEVEL_TOL = parseFloat(refuelRulesLocal.dedupeLitersTolerance ?? 10) || 10;
    const BASELINE_DROP_TOL = parseFloat(refuelRulesLocal.baselineDropToleranceLiters ?? 15) || 15;

    const engineStatePrev = (dbTruck.engineState && typeof dbTruck.engineState === 'object') ? dbTruck.engineState : {};
    let refuelAnchorLiters = Number.isFinite(parseFloat(engineStatePrev.refuelAnchorLiters))
      ? parseFloat(engineStatePrev.refuelAnchorLiters)
      : (Number.isFinite(parseFloat(dbTruck.lastFuelLiters)) ? parseFloat(dbTruck.lastFuelLiters) : currentLiters);
    let lastAcceptedRefuelTime = Number.isFinite(parseFloat(engineStatePrev.lastAcceptedRefuelTime))
      ? parseFloat(engineStatePrev.lastAcceptedRefuelTime)
      : 0;
    let lastAcceptedRefuelLevel = Number.isFinite(parseFloat(engineStatePrev.lastAcceptedRefuelLevel))
      ? parseFloat(engineStatePrev.lastAcceptedRefuelLevel)
      : refuelAnchorLiters;
    let fuelSamples = Array.isArray(engineStatePrev.fuelSamples) ? engineStatePrev.fuelSamples : [];

    if (!Number.isFinite(refuelAnchorLiters) || refuelAnchorLiters <= 0) refuelAnchorLiters = currentLiters;
    if (!Number.isFinite(lastAcceptedRefuelLevel) || lastAcceptedRefuelLevel <= 0) lastAcceptedRefuelLevel = refuelAnchorLiters;

    const normalizedSamples = fuelSamples
      .map((sample) => {
        const sampleTime = parseGpsDateTimeFlexible(sample && sample.time);
        const liters = parseFloat(sample && sample.liters);
        if (!Number.isFinite(sampleTime) || !Number.isFinite(liters)) return null;
        return {
          time: sampleTime,
          liters,
          speed: parseFloat(sample && sample.speed) || 0,
          ign: parseInt(sample && (sample.ign ?? 0), 10) || 0,
          lat: Number.isFinite(parseFloat(sample && sample.lat)) ? parseFloat(sample.lat) : truckLat,
          lng: Number.isFinite(parseFloat(sample && sample.lng)) ? parseFloat(sample.lng) : truckLng
        };
      })
      .filter(Boolean)
      .filter((sample) => (now - sample.time) <= (6 * 60 * 60 * 1000))
      .slice(-240);

    const liveIgnValue = hasIgn ? ignVal : (engineIsOff ? 0 : 1);
    const currentSample = { time: now, liters: currentLiters, speed, ign: liveIgnValue, lat: truckLat, lng: truckLng };
    const lastSample = normalizedSamples[normalizedSamples.length - 1];
    if (
      !lastSample ||
      (now - lastSample.time) >= 15000 ||
      Math.abs((lastSample.liters || 0) - currentLiters) >= 4 ||
      Math.abs((lastSample.speed || 0) - speed) >= 2
    ) {
      normalizedSamples.push(currentSample);
    } else {
      normalizedSamples[normalizedSamples.length - 1] = currentSample;
    }

    fuelSamples = normalizedSamples.slice(-120);

    const liveRefillEvents = detectRefillEventsFromSeries(fuelSamples, {
      ...refuelRulesLocal,
      minRefuelLiters: MIN_REFUEL_L,
      requireStopped: true,
      requireIgnOff: refuelRulesLocal.requireIgnOff === true || refuelRulesLocal.requireEngineOff === true,
      maxRealisticRefillLiters: Math.max(
        parseFloat(refuelRulesLocal.maxRealisticRefillLiters) || 0,
        Math.round((effectiveFuelCapacity || 600) + 50),
        MIN_REFUEL_L
      )
    });

    const latestLiveRefill = liveRefillEvents.length ? liveRefillEvents[liveRefillEvents.length - 1] : null;
    if (latestLiveRefill && latestLiveRefill.time > (lastAcceptedRefuelTime + 30000)) {
      const recentRefill = await Refuel.findOne({
        deviceId,
        timestamp: { $gte: new Date(latestLiveRefill.time - DEDUPE_MS) }
      }).sort({ timestamp: -1 });
      const sameLevelDuplicate = !!(
        recentRefill &&
        Number.isFinite(parseFloat(recentRefill.newLevel)) &&
        Math.abs((parseFloat(recentRefill.newLevel) || 0) - (parseFloat(latestLiveRefill.newLevel) || 0)) <= DEDUPE_LEVEL_TOL
      );

      if (!sameLevelDuplicate) {
        const refillLat = Number.isFinite(parseFloat(latestLiveRefill.lat)) ? parseFloat(latestLiveRefill.lat) : truckLat;
        const refillLng = Number.isFinite(parseFloat(latestLiveRefill.lng)) ? parseFloat(latestLiveRefill.lng) : truckLng;
        let locName = 'Station Externe';
        let isInternal = false;
        for (const loc of SYSTEM_SETTINGS.customLocations) {
          const d = calculateDistance(refillLat, refillLng, loc.lat, loc.lng);
          if (d <= (loc.radius || 500)) {
            locName = loc.name;
            isInternal = true;
            break;
          }
        }

        const addedLiters = Math.round(latestLiveRefill.addedLiters || 0);
        const oldLevel = Math.round(latestLiveRefill.oldLevel || refuelAnchorLiters || currentLiters);
        const newLevel = Math.round(latestLiveRefill.newLevel || currentLiters);

const persistedLive = await persistDetectedRefills(deviceId, truckName, [{
  ...latestLiveRefill,
  time: latestLiveRefill.time,
  lat: refillLat,
  lng: refillLng,
  addedLiters,
  oldLevel,
  newLevel,
  detectionMode: latestLiveRefill.detectionMode || 'rolling-buffer',
  confidence: parseFloat(latestLiveRefill.confidence) || null
}], true, { source: 'live-verified' });

refuelAnchorLiters = newLevel;
lastAcceptedRefuelTime = latestLiveRefill.time;
lastAcceptedRefuelLevel = newLevel;

const verb = persistedLive.created.length ? 'REFILL' : (persistedLive.updated.length ? 'REFILL-UPGRADE' : 'REFILL-SKIP');
console.log(`✅ ${verb} ${truckName} +${addedLiters}L (${oldLevel}→${newLevel}L) @ ${locName} [${latestLiveRefill.detectionMode || 'rolling-buffer'}]`);
      } else {
        console.log(`⏭️ ${truckName} Dedupe: skipped near-duplicate live refill @ ${Math.round(latestLiveRefill.newLevel || currentLiters)}L`);
      }
    }

    if (currentLiters < refuelAnchorLiters) {
      const drop = refuelAnchorLiters - currentLiters;
      if (isMoving || drop > BASELINE_DROP_TOL) {
        refuelAnchorLiters = currentLiters;
      }
    }

    
    // ✅ BACKGROUND SPEED TRACKING LOGIC
    const speedLimit = parseFloat(SYSTEM_SETTINGS.speedLimit) || parseFloat(config.speedLimit) || 80;
    if (speed > speedLimit) {
      // Check if we are already tracking an active speed violation
      const activeViolation = (dbTruck.engineState && dbTruck.engineState.activeSpeedViolation) ? dbTruck.engineState.activeSpeedViolation : null;
      if (!activeViolation) {
         // Start a new violation
         dbTruck.engineState = dbTruck.engineState || {};
         dbTruck.engineState.activeSpeedViolation = {
            startMs: now,
            maxSpeed: speed,
            limit: speedLimit,
            lat: truckLat,
            lng: truckLng
         };
      } else {
         // Update max speed
         if (speed > activeViolation.maxSpeed) activeViolation.maxSpeed = speed;
         const durMins = Math.round((now - activeViolation.startMs) / 60000);
         if (durMins >= 5) {
            SpeedViolation.create({
              deviceId,
              truckName,
              timestamp: new Date(activeViolation.startMs),
              speed: activeViolation.maxSpeed,
              limit: activeViolation.limit,
              lat: activeViolation.lat,
              lng: activeViolation.lng,
              locationName: 'Inconnue',
              durationMinutes: durMins
            }).catch(e => console.error("Error saving SpeedViolation:", e.message));
            activeViolation.startMs = now;
            activeViolation.maxSpeed = speed;
         }
      }
    } else {
      // Speed is under limit. If we were tracking a violation, close it and save to DB
      if (dbTruck.engineState && dbTruck.engineState.activeSpeedViolation) {
         const v = dbTruck.engineState.activeSpeedViolation;
         const durMins = Math.round((now - v.startMs) / 60000);
         // Only log if it lasted at least 1 minute or was extremely high speed (10+ over limit)
         if (durMins >= 1 || v.maxSpeed >= (v.limit + 10)) {
            let locName = 'Inconnue';
            // Optional: resolve location name quickly if needed
            SpeedViolation.create({
              deviceId,
              truckName,
              timestamp: new Date(v.startMs),
              speed: v.maxSpeed,
              limit: v.limit,
              lat: v.lat,
              lng: v.lng,
              locationName: locName,
              durationMinutes: durMins
            }).catch(e => console.error("Error saving SpeedViolation:", e.message));
         }
         dbTruck.engineState.activeSpeedViolation = null; // reset
      }
    }

    const nextEngineState = {
      ...(dbTruck.engineState || {}),
      refuelAnchorLiters,
      lastAcceptedRefuelTime,
      lastAcceptedRefuelLevel,
      fuelSamples
    };

    let payload = { 
      truckName, lastUpdate: now, lastFuelLiters: currentLiters,
      lastFuelPercent: fuelData.percent || 0,
      lat: truckLat, lng: truckLng, speed, params: truck.params,
      engineState: nextEngineState
    };

    // Run vidange/maintenance zone detection
    const freshDbTruck = { ...dbTruck.toObject(), ...payload };
    await runVidangeDetection(truck, freshDbTruck, config);

    // V6: Always save — fuel reading must persist for next comparison
    try {
      await Truck.findOneAndUpdate({ deviceId }, payload, { upsert: true });
      DB_STATS.lastWriteAt = new Date().toISOString();
      DB_STATS.totalWrites++;
    } catch (saveErr) {
      DB_STATS.lastWriteError = saveErr.message;
      DB_STATS.totalErrors++;
      console.error(`❌ Bot save error for ${truckName}:`, saveErr.message);
    }
  }

  try {
    await runNightlyRefuelReconciliation(false);
  } catch (nightlyError) {
    console.error('Nightly refuel reconcile error:', nightlyError.message);
  }

  // 🛡️ Self-healing: process one pending missed window per bot cycle (bandwidth-safe)
  try {
    const pendingCount = await MissedWindow.countDocuments({ recoveredAt: null });
    if (pendingCount > 0) {
      console.log(`🔄 ${pendingCount} missed window(s) pending — running recovery (1 window)...`);
      await recoverMissedWindows({ maxWindows: 1, delayBetweenMs: 0 });
    }
  } catch (healErr) {
    console.error('Self-healing error:', healErr.message);
  }

  // ⚡ BANDWIDTH FIX: 2 minute interval
  setTimeout(runFleetBot, 120000);
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

// ✅ ENHANCED HEALTH / DIAGNOSTIC ENDPOINT
let DB_STATS = { connected: false, lastWriteAt: null, lastWriteError: null, totalWrites: 0, totalErrors: 0 };

app.get('/health', (req, res) => res.send('System Operational'));

app.get('/api/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  let dbPing = false;
  let dbPingMs = null;
  let dbCounts = {};
  let dbError = null;
  try {
    const pingStart = Date.now();
    await mongoose.connection.db.admin().ping();
    dbPing = true;
    dbPingMs = Date.now() - pingStart;
    dbCounts.trucks = await Truck.countDocuments();
    dbCounts.maintenance = await Maintenance.countDocuments();
    dbCounts.refuels = await Refuel.countDocuments();
    dbCounts.decouchage = await Decouchage.countDocuments();
    dbCounts.speedViolations = await SpeedViolation.countDocuments();
  } catch(e) {
    dbError = e.message;
  }
  res.json({
    status: dbPing ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.round(process.uptime()),
    db: {
      state: dbStateMap[dbState] || 'unknown',
      ping: dbPing,
      pingMs: dbPingMs,
      error: dbError,
      counts: dbCounts,
      lastWriteAt: DB_STATS.lastWriteAt,
      lastWriteError: DB_STATS.lastWriteError,
      totalWritesSession: DB_STATS.totalWrites,
      totalErrorsSession: DB_STATS.totalErrors
    },
    env: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      port: PORT,
      mongoConfigured: !!process.env.MONGO_URI
    },
    bot: {
      lastReconcileRun: REFUEL_RECONCILE_STATE.lastRunYmd || 'not yet',
      reconcileRunning: REFUEL_RECONCILE_STATE.running,
      intervalSeconds: 120,
      reconcileDaysWindow: 2,
      scanBufferHours: 1,
      note: 'Bandwidth optimized: 30s->120s interval, 13->2 days reconcile, 6h->1h scan buffer'
    }
  });
});



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


// ✅ GET Timeline Alerts
app.delete('/api/alerts/timeline', checkAccess, async (req, res) => {
    try {
      await SpeedViolation.deleteMany({});
      res.json({ success: true, message: 'Timeline effacée' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/alerts/timeline', checkAccess, async (req, res) => {
  try {
    const violations = await SpeedViolation.find().sort({ timestamp: -1 }).limit(100);
    // You could also fetch Refuels, Maintenances here and merge them
    res.json({ success: true, timeline: violations.map(v => ({
      id: v._id,
      type: 'speeding',
      title: '🚨 Excès de Vitesse',
      message: `${v.truckName} a roulé à ${v.speed} km/h (Limite: ${v.limit}) pendant ${v.durationMinutes} min.`,
      timestamp: v.timestamp,
      severity: (v.speed >= v.limit + 20) ? 'critical' : 'warning',
      data: v
    }))});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ POST Rescan Speeding — fetches GPS history and finds all speed violations in a period
app.post('/api/speeding/rescan', checkAccess, async (req, res) => {
  try {
    const { deviceIds, truckNames, start, end } = req.body;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
    
    const startMs = parseGpsDateTimeFlexible(start);
    const endMs = parseGpsDateTimeFlexible(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // If specific deviceIds provided, use those; otherwise scan all trucks
    let trucksToScan = [];
    if (deviceIds && deviceIds.length > 0) {
      for (let i = 0; i < deviceIds.length; i++) {
        const dbTruck = await Truck.findOne({ deviceId: String(deviceIds[i]) });
        if (dbTruck) trucksToScan.push({ deviceId: String(deviceIds[i]), truckName: dbTruck.truckName || truckNames?.[i] || deviceIds[i] });
      }
    } else {
      const allTrucks = await Truck.find({}, 'deviceId truckName');
      trucksToScan = allTrucks.map(t => ({ deviceId: t.deviceId, truckName: t.truckName }));
    }

    let totalViolations = 0;
    const results = [];

    for (const t of trucksToScan) {
      try {
        const config = getTruckConfig(t.deviceId);
        const speedLimit = parseFloat(SYSTEM_SETTINGS.speedLimit) || parseFloat(config.speedLimit) || 80;
        const rawMessages = await fetchGpsHistoryWindow(t.deviceId, startMs, endMs);
        const points = normalizeGpsHistoryMessages(rawMessages, t.deviceId, config);
        
        // Find consecutive speeding segments
        let inViolation = false;
        let violationStart = null;
        let maxSpeed = 0;
        let violationLat = 0, violationLng = 0;

        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const speed = parseFloat(p.speed) || 0;
          
          if (speed > speedLimit) {
            if (!inViolation) {
              inViolation = true;
              violationStart = p.time;
              maxSpeed = speed;
              violationLat = p.lat;
              violationLng = p.lng;
            } else {
              if (speed > maxSpeed) maxSpeed = speed;
            }
          } else {
            if (inViolation) {
              // Close the violation
              const durMins = Math.round((p.time - violationStart) / 60000);
              if (durMins >= 1 || maxSpeed >= speedLimit + 10) {
                // Check for duplicate
                const existing = await SpeedViolation.findOne({
                  deviceId: t.deviceId,
                  timestamp: { $gte: new Date(violationStart - 60000), $lte: new Date(violationStart + 60000) }
                });
                if (!existing) {
                  await SpeedViolation.create({
                    deviceId: t.deviceId,
                    truckName: t.truckName,
                    timestamp: new Date(violationStart),
                    speed: maxSpeed,
                    limit: speedLimit,
                    lat: violationLat,
                    lng: violationLng,
                    locationName: resolveLocationName(violationLat, violationLng) || 'Inconnue',
                    durationMinutes: durMins,
                    isRescanned: true
                  });
                  totalViolations++;
                }
              }
              inViolation = false;
              maxSpeed = 0;
            }
          }
        }

        // Close any trailing violation
        if (inViolation && points.length > 0) {
          const lastP = points[points.length - 1];
          const durMins = Math.round((lastP.time - violationStart) / 60000);
          if (durMins >= 1 || maxSpeed >= speedLimit + 10) {
            const existing = await SpeedViolation.findOne({
              deviceId: t.deviceId,
              timestamp: { $gte: new Date(violationStart - 60000), $lte: new Date(violationStart + 60000) }
            });
            if (!existing) {
              await SpeedViolation.create({
                deviceId: t.deviceId,
                truckName: t.truckName,
                timestamp: new Date(violationStart),
                speed: maxSpeed,
                limit: speedLimit,
                lat: violationLat,
                lng: violationLng,
                locationName: resolveLocationName(violationLat, violationLng) || 'Inconnue',
                durationMinutes: durMins,
                isRescanned: true
              });
              totalViolations++;
            }
          }
        }

        results.push({ truckName: t.truckName, pointsScanned: points.length, status: 'ok' });
      } catch (truckErr) {
        results.push({ truckName: t.truckName, pointsScanned: 0, status: 'error', error: truckErr.message });
      }
    }

    res.json({ 
      success: true, 
      message: 'Rescan terminé: ' + totalViolations + ' infractions trouvées sur ' + trucksToScan.length + ' camions.',
      totalViolations,
      trucksScanned: trucksToScan.length,
      results
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ GET Speeding History for a specific truck
app.get('/api/speeding/history', checkAccess, async (req, res) => {
  try {
    const filter = {};
    if (req.query.deviceId) filter.deviceId = req.query.deviceId;
    if (req.query.start && req.query.end) {
      filter.timestamp = { $gte: new Date(req.query.start), $lte: new Date(req.query.end) };
    }
    const violations = await SpeedViolation.find(filter).sort({ timestamp: -1 }).limit(500);
    res.json({ success: true, violations });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  try {
    const newDoc = await Maintenance.create(req.body);
    DB_STATS.lastWriteAt = new Date().toISOString();
    DB_STATS.totalWrites++;

    // ✅ If a Vidange was manually added, acknowledge it to silence the current milestone alert
    try {
      if (req.body && req.body.type === 'Vidange' && req.body.deviceId && req.body.odometer) {
        await acknowledgeVidange(req.body.deviceId, req.body.truckName, parseInt(req.body.odometer, 10));
      }
    } catch (e) {
      console.warn('Vidange acknowledge (manual) failed:', e.message);
    }

    res.json({ success: true, id: newDoc._id });
  } catch (e) {
    DB_STATS.lastWriteError = e.message;
    DB_STATS.totalErrors++;
    console.error('❌ /api/maintenance/add error:', e.message);
    res.status(500).json({ error: e.message, detail: 'La base de données est peut-être inaccessible. Vérifiez /api/health.' });
  }
});
app.post('/api/maintenance/update', checkAccess, async (req, res) => {
  try {
    const { id, type, note, odometer, isAuto, location, priority, description, technician, cost, parts, scheme, tires, forfaitName, chassisNumber, immatriculation } = req.body;
    const doc = await Maintenance.findById(id);
    if (!doc) return res.status(404).json({ error: "Introuvable" });

    const prevType = doc.type;
    doc.type = type || doc.type;
    doc.note = note !== undefined ? note : doc.note;
    doc.odometer = odometer || doc.odometer;
    if (isAuto !== undefined) doc.isAuto = isAuto;
    // ✅ FIX: Save all enhanced fields
    if (location !== undefined) doc.location = location;
    if (priority !== undefined) doc.priority = priority;
    if (description !== undefined) doc.description = description;
    if (technician !== undefined) doc.technician = technician;
    if (cost !== undefined) doc.cost = cost;
    if (Array.isArray(parts)) doc.parts = parts;
    if (scheme !== undefined) doc.scheme = scheme;
    if (tires !== undefined) doc.tires = tires;
    if (forfaitName !== undefined) doc.forfaitName = forfaitName;
    if (chassisNumber !== undefined) doc.chassisNumber = chassisNumber;
    if (immatriculation !== undefined) doc.immatriculation = immatriculation;
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
  try {
    await Maintenance.findByIdAndDelete(req.body.id);
    DB_STATS.lastWriteAt = new Date().toISOString();
    DB_STATS.totalWrites++;
    res.json({ success: true });
  } catch (e) {
    DB_STATS.lastWriteError = e.message;
    DB_STATS.totalErrors++;
    console.error('❌ /api/maintenance/delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ✅ NEW: Get all trucks from DB with their metadata (chassis, imm, carte naftal)
app.get('/api/trucks/db', checkAccess, async (req, res) => {
  try {
    const trucks = await Truck.find({}, 'deviceId truckName chassisNumber immatriculation carteNaftal lastFuelLiters lastFuelPercent lat lng speed lastUpdate').sort({ truckName: 1 });
    res.json(fmt(trucks));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ FIX: Update truck metadata — now uses upsert so it works even if truck isn't in DB yet
app.post('/api/trucks/update-info', checkAccess, async (req, res) => {
  try {
    const { deviceId, truckName, chassisNumber, immatriculation, carteNaftal } = req.body;
    if (!deviceId && !truckName) return res.status(400).json({ error: 'deviceId ou truckName requis' });
    const filter = deviceId ? { deviceId: String(deviceId) } : { truckName: String(truckName) };
    const update = {};
    if (chassisNumber !== undefined) update.chassisNumber = chassisNumber;
    if (immatriculation !== undefined) update.immatriculation = immatriculation;
    if (carteNaftal !== undefined) update.carteNaftal = carteNaftal;
    if (truckName) update.truckName = truckName;
    if (deviceId) update.deviceId = String(deviceId);
    const truck = await Truck.findOneAndUpdate(filter, { $set: update }, { new: true, upsert: true });
    res.json({ success: true, truck: fmt([truck])[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ NEW: Add a manual (non-GPS) truck that persists for future maintenance orders
app.post('/api/trucks/manual', checkAccess, async (req, res) => {
  try {
    const { truckName, chassisNumber, immatriculation, carteNaftal } = req.body;
    if (!truckName) return res.status(400).json({ error: 'truckName requis' });
    const deviceId = 'manual_' + truckName.replace(/\s+/g, '_').toLowerCase();
    const truck = await Truck.findOneAndUpdate(
      { $or: [{ deviceId }, { truckName }] },
      { $set: { deviceId, truckName, chassisNumber, immatriculation, carteNaftal } },
      { new: true, upsert: true }
    );
    res.json({ success: true, truck: fmt([truck])[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ NEW: Get active (in-progress) maintenance orders only
app.get('/api/maintenance/active', checkAccess, async (req, res) => {
  try {
    const data = await Maintenance.find({
      $or: [
        { status: 'en_cours' },
        { exitDate: { $exists: false } },
        { exitDate: null }
      ]
    }).sort({ date: -1 });
    res.json(fmt(data));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ NEW: Close/complete a maintenance order
app.post('/api/maintenance/close', checkAccess, async (req, res) => {
  try {
    const { id, note, cost, technician, parts } = req.body;
    if (!id) return res.status(400).json({ error: 'id requis' });
    const doc = await Maintenance.findById(id);
    if (!doc) return res.status(404).json({ error: 'Ordre introuvable' });
    doc.exitDate = new Date();
    doc.status = 'termine';
    if (note !== undefined) doc.note = note;
    if (cost !== undefined) doc.cost = cost;
    if (technician !== undefined) doc.technician = technician;
    if (Array.isArray(parts)) doc.parts = parts;
    await doc.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ V4.0: GPS Geofence Confirmation — Confirm or reject a maintenance via GPS proximity
app.post('/api/maintenance/gps-confirm', checkAccess, async (req, res) => {
  try {
    const { id, confirmed, rejectedReason } = req.body;
    if (!id) return res.status(400).json({ error: 'id requis' });
    const doc = await Maintenance.findById(id);
    if (!doc) return res.status(404).json({ error: 'Ordre introuvable' });
    
    if (confirmed) {
      doc.gpsConfirmed = true;
      doc.gpsConfirmedAt = new Date();
      doc.status = 'termine';
      doc.exitDate = new Date();
    } else {
      doc.gpsRejected = true;
      doc.gpsRejectedReason = rejectedReason || 'Non confirmé par utilisateur';
    }
    await doc.save();
    res.json({ success: true, order: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ V4.0: Get maintenance orders pending GPS confirmation
app.get('/api/maintenance/pending-gps', checkAccess, async (req, res) => {
  try {
    const orders = await Maintenance.find({
      status: 'en_cours',
      gpsConfirmed: { $ne: true },
      gpsRejected: { $ne: true }
    }).sort({ date: -1 });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ V4.0: Get ALL maintenance history entries (for predictive engine)
app.get('/api/maintenance-entries', checkAccess, async (req, res) => {
  try {
    const entries = await Maintenance.find({}).sort({ date: -1 }).limit(10000);
    res.json(entries);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ V4.0: Geofence check — check if any truck with active maintenance is near a maintenance site
app.post('/api/maintenance/geofence-check', checkAccess, async (req, res) => {
  try {
    // Get active maintenance orders
    const activeOrders = await Maintenance.find({ 
      status: 'en_cours', 
      gpsConfirmed: { $ne: true },
      maintenanceLocationLat: { $exists: true, $ne: null },
      maintenanceLocationLng: { $exists: true, $ne: null }
    });
    
    if (activeOrders.length === 0) return res.json({ triggered: [] });
    
    // Get current truck positions from cache
    const trucks = await Truck.find({});
    const triggered = [];
    
    for (const order of activeOrders) {
      const truck = trucks.find(t => t.truckName === order.truckName || t.deviceId === order.deviceId);
      if (!truck || !truck.lat || !truck.lng) continue;
      
      const distance = calculateDistance(
        truck.lat, truck.lng,
        order.maintenanceLocationLat, order.maintenanceLocationLng
      );
      
      const radius = order.geofenceRadiusMeters || 500;
      
      // Check if truck was in zone and now left (>500m)
      if (distance > radius && order.geofenceTriggered && !order.geofenceExitAt) {
        order.geofenceExitAt = new Date();
        await order.save();
        triggered.push({
          orderId: order._id,
          truckName: order.truckName,
          type: order.type,
          distance: Math.round(distance),
          status: 'exited_zone',
          message: `${order.truckName} a quitté la zone de maintenance (${Math.round(distance)}m)`
        });
      }
      // Check if truck entered zone (<500m)
      else if (distance <= radius && !order.geofenceTriggered) {
        order.geofenceTriggered = true;
        order.geofenceTriggeredAt = new Date();
        await order.save();
        triggered.push({
          orderId: order._id,
          truckName: order.truckName,
          type: order.type,
          distance: Math.round(distance),
          status: 'entered_zone',
          message: `${order.truckName} est dans la zone de maintenance (${Math.round(distance)}m)`
        });
      }
    }
    
    res.json({ triggered });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/refuels', checkAccess, async (req, res) => {
  try {
    const { start, end, deviceId, truckName, limit } = req.query || {};
    const query = {};
    const startMs = start ? parseGpsDateTimeFlexible(String(start)) : NaN;
    const endMs = end ? parseGpsDateTimeFlexible(String(end)) : NaN;
    if (Number.isFinite(startMs) || Number.isFinite(endMs)) {
      query.timestamp = {};
      if (Number.isFinite(startMs)) query.timestamp.$gte = new Date(startMs);
      if (Number.isFinite(endMs)) query.timestamp.$lte = new Date(endMs);
    }
    if (deviceId) query.deviceId = String(deviceId);
    if (truckName) query.truckName = new RegExp(String(truckName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || (query.timestamp ? 20000 : 1000), 50000));
    const data = await Refuel.find(query).sort({ timestamp: -1 }).limit(parsedLimit);
    res.json(fmt(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
      decouchages: await Decouchage.find(),
      transportReports: await TransportReportEntry.find()
    };
    res.json(dbData);
  } catch (e) { res.status(500).send(e.message); }
});


async function resolveTruckForTransportRow({ deviceId, truckName } = {}) {
  if (deviceId) {
    const direct = await Truck.findOne({ deviceId: String(deviceId) }).lean();
    if (direct) return { id: String(direct.deviceId), name: direct.truckName || String(direct.deviceId) };
  }
  const wanted = String(truckName || '').trim();
  if (!wanted) return null;
  const rows = await Truck.find({}, 'deviceId truckName').lean();
  const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
  const target = normalize(wanted);
  const match = rows.find((row) => normalize(row.truckName) === target)
    || rows.find((row) => normalize(row.truckName).startsWith(target))
    || rows.find((row) => normalize(row.truckName).includes(target));
  return match ? { id: String(match.deviceId), name: match.truckName || String(match.deviceId) } : null;
}

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


// ✅ V4.0: Refuel Verification — Confirm or reject a detected refuel
app.post('/api/refuels/verify', checkAccess, async (req, res) => {
  try {
    const { id, verified, rejectedReason } = req.body;
    if (!id) return res.status(400).json({ error: 'id requis' });
    const doc = await Refuel.findById(id);
    if (!doc) return res.status(404).json({ error: 'Remplissage introuvable' });
    
    doc.set('verified', !!verified);
    doc.set('verifiedAt', new Date());
    if (!verified && rejectedReason) doc.set('rejectedReason', rejectedReason);
    
    await doc.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/refuels/rebuild', checkAccess, async (req, res) => {
  try {
    const { deviceId, truckName, start, end, persist, purgeExistingAuto } = req.body || {};
    if (!deviceId || !start || !end) return res.status(400).json({ error: 'deviceId, start et end sont requis' });

    const startMs = parseGpsDateTimeFlexible(start);
    const endMs = parseGpsDateTimeFlexible(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return res.status(400).json({ error: 'Période invalide' });

    const result = await reconcileRefuelsForWindow({
      deviceId: String(deviceId),
      truckName: truckName || String(deviceId),
      startMs,
      endMs,
      persist: persist !== false,
      purgeExistingAuto: purgeExistingAuto === true,
      source: 'gps-history-reconciled'
    });
    res.json({
      success: true,
      deletedCount: result.deletedCount || 0,
      duplicateDeletedCount: (result.dedupe && result.dedupe.deletedCount) || 0,
      duplicateGroups: (result.dedupe && result.dedupe.duplicateGroups) || 0,
      detected: result.refills.length,
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      updatedCount: result.updatedCount || 0,
      refills: result.refills.map((event) => ({
        ...event,
        confidence: Number.isFinite(parseFloat(event.confidence)) ? Math.round(parseFloat(event.confidence) * 100) / 100 : null,
        locationRaw: resolveLocationName(event.lat, event.lng),
        timestamp: new Date(event.time)
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/refuels/rebuild-bulk', checkAccess, async (req, res) => {
  try {
    const { start, end, deviceIds, purgeExistingAuto, persist } = req.body || {};
    if (!start || !end) return res.status(400).json({ error: 'start et end sont requis' });
    const startMs = parseGpsDateTimeFlexible(start);
    const endMs = parseGpsDateTimeFlexible(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return res.status(400).json({ error: 'Période invalide' });

    let trucks = [];
    if (Array.isArray(deviceIds) && deviceIds.length) {
      trucks = await Truck.find({ deviceId: { $in: deviceIds.map((id) => String(id)) } }, 'deviceId truckName').sort({ truckName: 1 }).lean();
    } else {
      trucks = await Truck.find({}, 'deviceId truckName').sort({ truckName: 1 }).lean();
    }
    if (!trucks.length) return res.status(404).json({ error: 'Aucun camion trouvé pour ce re-scan' });

    const summary = {
      targetCount: trucks.length,
      successCount: 0,
      deletedCount: 0,
      duplicateDeletedCount: 0,
      detected: 0,
      createdCount: 0,
      skippedCount: 0,
      updatedCount: 0,
      failed: []
    };

    for (const truck of trucks) {
      try {
        const result = await reconcileRefuelsForWindow({
          deviceId: String(truck.deviceId),
          truckName: truck.truckName || String(truck.deviceId),
          startMs,
          endMs,
          persist: persist !== false,
          purgeExistingAuto: purgeExistingAuto === true,
          source: 'gps-history-reconciled'
        });
        summary.successCount += 1;
        summary.deletedCount += result.deletedCount || 0;
        summary.duplicateDeletedCount += (result.dedupe && result.dedupe.deletedCount) || 0;
        summary.detected += Array.isArray(result.refills) ? result.refills.length : 0;
        summary.createdCount += result.createdCount || 0;
        summary.skippedCount += result.skippedCount || 0;
        summary.updatedCount += result.updatedCount || 0;
      } catch (error) {
        summary.failed.push({ deviceId: String(truck.deviceId), truckName: truck.truckName || String(truck.deviceId), error: error.message });
      }
    }

    res.json({ success: true, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/refuels/nightly-reconcile', checkAccess, async (req, res) => {
  try {
    const summary = await runNightlyRefuelReconciliation(true);
    res.json({ success: true, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ✅ SELF-HEALING: Manually backfill the last N days of refuel data
// SAFE: Only rebuilds GPS-auto-detected refuels. Manual maintenance & manual refuels are NEVER touched.
// GET version: open in browser → https://dedgps.site/api/refuels/backfill-recovery?days=100&code=YOUR_CODE&force=true
app.get('/api/refuels/backfill-recovery', async (req, res) => {
  const code = req.query.code || req.headers['x-access-code'];
  if (!code) return res.status(401).send('❌ Missing code. Add ?code=YOUR_ACCESS_CODE to the URL.');
  const isValid = await AccessCode.findOne({ code }).catch(() => null);
  if (!isValid) return res.status(403).send('❌ Invalid access code.');
  req.body = { daysBack: parseInt(req.query.days || req.query.daysBack || 3, 10), force: req.query.force === 'true' };
  // Fall through to POST handler logic (same code below)
  return handleBackfillRecovery(req, res);
});

app.post('/api/refuels/backfill-recovery', checkAccess, (req, res) => handleBackfillRecovery(req, res));

async function handleBackfillRecovery(req, res) {
  try {
    const { daysBack = 3, force = false } = req.body || {};
    // ✅ No arbitrary cap — supports 1 to 365 days
    const days = Math.max(1, Math.min(365, parseInt(daysBack, 10) || 3));
    const now = Date.now();

    // For large periods: split into individual day windows so they are processed
    // gradually (1 per bot cycle = 1 per 2 min) — avoids bandwidth spikes
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    let windowsQueued = 0;

    for (let d = 0; d < days; d++) {
      const windowEnd = now - (d * MS_PER_DAY);
      const windowStart = windowEnd - MS_PER_DAY;

      if (force) {
        await MissedWindow.deleteMany({
          startMs: { $gte: windowStart - 3600000, $lte: windowStart + 3600000 },
          reason: { $in: ['startup-gap', 'manual-backfill'] }
        });
      }

      const existing = await MissedWindow.findOne({
        startMs: { $gte: windowStart - 3600000 },
        endMs:   { $lte: windowEnd + 3600000 },
        recoveredAt: null
      });

      if (!existing) {
        await MissedWindow.create({ startMs: windowStart, endMs: windowEnd, reason: 'manual-backfill' });
        windowsQueued++;
      }
    }

    // Process the first 3 windows immediately — rest will be handled by bot cycles
    const immediateResult = await recoverMissedWindows({ maxWindows: 3, delayBetweenMs: 5000 });

    const stillPending = await MissedWindow.countDocuments({ recoveredAt: null });

    res.json({
      success: true,
      daysBack: days,
      windowsQueued,
      immediatelyProcessed: immediateResult.recovered || 0,
      stillPending,
      message: `${days} day(s) queued. ${immediateResult.recovered || 0} processed now, ${stillPending} remain and will auto-process every 2 minutes.`,
      result: immediateResult
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}


// ✅ SELF-HEALING: Get recovery status and pending missed windows
app.get('/api/recovery/status', checkAccess, async (req, res) => {
  try {
    const pending = await MissedWindow.find({ recoveredAt: null }).sort({ startMs: 1 }).lean();
    const recovered = await MissedWindow.find({ recoveredAt: { $ne: null } }).sort({ recoveredAt: -1 }).limit(10).lean();
    res.json({
      success: true,
      recovery: { running: RECOVERY_STATE.running, lastRecoveryAt: RECOVERY_STATE.lastRecoveryAt, lastError: RECOVERY_STATE.lastError, totalRecoveredThisSession: RECOVERY_STATE.recoveredCount },
      pending: pending.map(w => ({ id: w._id, start: new Date(w.startMs).toISOString(), end: new Date(w.endMs).toISOString(), reason: w.reason, ageHours: Math.round((Date.now() - w.startMs) / 3600000) })),
      recentlyRecovered: recovered.map(w => ({ id: w._id, start: new Date(w.startMs).toISOString(), end: new Date(w.endMs).toISOString(), reason: w.reason, recoveredAt: w.recoveredAt, truckCount: w.truckCount }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ SELF-HEALING: Trigger immediate recovery run
app.post('/api/recovery/run', checkAccess, async (req, res) => {
  try {
    const { maxWindows = 2 } = req.body || {};
    const result = await recoverMissedWindows({ maxWindows: Math.min(5, parseInt(maxWindows, 10) || 2), delayBetweenMs: 5000 });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/transport-report/rows', checkAccess, async (req, res) => {
  try {
    const limitRaw = Number(req.query && req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(20000, Math.max(100, Math.round(limitRaw))) : 20000;
    const rows = await TransportReportEntry.find().sort({ requestedStartAt: -1, startAt: -1, createdAt: -1 }).limit(limit);
    res.json(fmt(rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/transport-report/calculate', checkAccess, async (req, res) => {
  try {
    const { deviceId, truckName, start, end, persist, note, existingRowId, sourceFileName, sourceRow, sourceType } = req.body || {};
    if (!deviceId || !start || !end) return res.status(400).json({ error: 'deviceId, start et end sont requis' });

    const resolvedTruckName = truckName || String(deviceId);
    const summary = await calculateTransportWindowStats({
      deviceId: String(deviceId),
      truckName: resolvedTruckName,
      start,
      end,
      persist: persist === true,
      note: note || ''
    });

    let savedRow = null;
    if (persist) {
      const importFingerprint = buildTransportFingerprint({ truckName: resolvedTruckName, start, end });
      const selector = existingRowId
        ? { _id: existingRowId }
        : { importFingerprint, status: { $ne: 'deleted' } };
      const payload = {
        ...summary,
        status: 'ok',
        issueReason: '',
        issueCategory: '',
        issueDetails: {},
        sourceType: sourceType || 'import',
        sourceFileName: sourceFileName || '',
        sourceRow: Number(sourceRow) || null,
        importFingerprint,
        resolvedAt: new Date(),
        editedAt: new Date()
      };
      savedRow = await TransportReportEntry.findOneAndUpdate(
        selector,
        { $set: payload, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true }
      );
    }

    res.json({
      success: true,
      summary,
      savedRow: savedRow ? (savedRow.toObject ? savedRow.toObject() : savedRow) : null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.post('/api/transport-report/import-issue', checkAccess, async (req, res) => {
  try {
    const row = await createOrUpdateTransportIssue(req.body || {});
    res.json({ success: true, row: fmt([row])[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/transport-report/retry-issues', checkAccess, async (req, res) => {
  try {
    const { ids, onlyStatus } = req.body || {};
    const query = {};
    if (Array.isArray(ids) && ids.length) query._id = { $in: ids };
    if (onlyStatus) query.status = onlyStatus;
    else query.status = { $ne: 'ok' };
    const rows = await TransportReportEntry.find(query).sort({ sourceRow: 1, createdAt: 1 }).limit(10000);
    const summary = { targetCount: rows.length, successCount: 0, failedCount: 0, failed: [] };
    for (const row of rows) {
      try {
        const resolvedTruck = await resolveTruckForTransportRow({ deviceId: row.deviceId, truckName: row.inputTruckName || row.truckName });
        if (!resolvedTruck) throw new Error('Camion introuvable');
        const start = row.requestedStartAt || row.startAt;
        const end = row.requestedEndAt || row.endAt;
        if (!start || !end) throw new Error('Dates manquantes');
        const summaryRow = await calculateTransportWindowStats({
          deviceId: resolvedTruck.id,
          truckName: resolvedTruck.name,
          start,
          end,
          persist: true,
          note: row.note || ''
        });
        await TransportReportEntry.findByIdAndUpdate(row._id, {
          $set: {
            ...summaryRow,
            inputTruckName: row.inputTruckName || row.truckName,
            status: 'ok',
            issueReason: '',
            issueCategory: '',
            issueDetails: {},
            deviceId: resolvedTruck.id,
            truckName: resolvedTruck.name,
            resolvedAt: new Date(),
            lastRetryAt: new Date(),
            editedAt: new Date()
          }
        });
        summary.successCount += 1;
      } catch (error) {
        summary.failedCount += 1;
        summary.failed.push({ id: String(row._id), truckName: row.inputTruckName || row.truckName || '', error: error.message });
        await TransportReportEntry.findByIdAndUpdate(row._id, {
          $set: {
            status: 'issue',
            issueReason: error.message,
            lastRetryAt: new Date(),
            editedAt: new Date()
          }
        });
      }
    }
    res.json({ success: true, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/transport-report/update', checkAccess, async (req, res) => {
  try {
    const { id, action } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id requis' });
    const row = await TransportReportEntry.findById(id);
    if (!row) return res.status(404).json({ error: 'Ligne introuvable' });

    if (action === 'recalculate') {
      const resolvedTruck = await resolveTruckForTransportRow({ deviceId: req.body.deviceId || row.deviceId, truckName: req.body.truckName || row.inputTruckName || row.truckName });
      if (!resolvedTruck) return res.status(400).json({ error: 'Camion introuvable' });
      const start = req.body.start || row.requestedStartAt || row.startAt;
      const end = req.body.end || row.requestedEndAt || row.endAt;
      const summary = await calculateTransportWindowStats({
        deviceId: resolvedTruck.id,
        truckName: resolvedTruck.name,
        start,
        end,
        persist: true,
        note: req.body.note ?? row.note ?? ''
      });
      const updated = await TransportReportEntry.findByIdAndUpdate(id, {
        $set: {
          ...summary,
          inputTruckName: req.body.inputTruckName || row.inputTruckName || row.truckName,
          deviceId: resolvedTruck.id,
          truckName: resolvedTruck.name,
          status: 'ok',
          issueReason: '',
          issueCategory: '',
          issueDetails: {},
          resolvedAt: new Date(),
          editedAt: new Date()
        }
      }, { new: true });
      return res.json({ success: true, row: fmt([updated])[0] });
    }

    const allowed = ['truckName','inputTruckName','deviceId','startLocation','endLocation','note','distanceSource','status','issueReason'];
    const numericFields = ['kmTotal','gpsDistanceKm','fuelStart','fuelEnd','fuelAddedDuringTrip','fuelConsumedRaw','fuelConsumedTotal','refillCount','historyPoints','kmStart','kmEnd'];
    const dateFields = ['startAt','endAt','requestedStartAt','requestedEndAt','actualStartAt','actualEndAt'];
    const update = { editedAt: new Date() };
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
    }
    for (const key of numericFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = Number(req.body[key]) || 0;
    }
    for (const key of dateFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = toDateOrNull(req.body[key]);
    }
    if (Array.isArray(req.body.warnings)) update.warnings = req.body.warnings;
    if (Array.isArray(req.body.refills)) update.refills = req.body.refills;
    const updated = await TransportReportEntry.findByIdAndUpdate(id, { $set: update }, { new: true });
    res.json({ success: true, row: fmt([updated])[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/transport-report/delete', checkAccess, async (req, res) => {
  try {
    const { id, ids } = req.body || {};
    const targetIds = Array.isArray(ids) && ids.length ? ids.filter(Boolean).map(String) : (id ? [String(id)] : []);
    if (!targetIds.length) return res.status(400).json({ error: 'id ou ids requis' });
    const result = await TransportReportEntry.deleteMany({ _id: { $in: targetIds } });
    res.json({ success: true, deletedCount: Number(result.deletedCount || 0) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// --- 8. ITINERARY TRACKING API ---

// Schema: one document per unique route key, accumulates truck observations per month
const ItinerarySegmentSchema = new mongoose.Schema({
  key: { type: String, unique: true, index: true },   // e.g. "36.74,3.05|34.85,5.72"
  waypoints: [{ lat: Number, lng: Number, count: Number }],
  nameStart: String,    // resolved place name for first waypoint
  nameEnd: String,      // resolved place name for last waypoint
  // monthly: { "2026-05": { trucks: ["id:name", ...], count: N } }
  monthly: { type: Map, of: { trucks: [String], count: Number } },
  totalObservations: { type: Number, default: 0 },
  allTrucks: [String],  // all unique "id:name" ever seen
  firstSeen: Date,
  lastSeen: Date
}, { strict: false });

const ItinerarySegment = mongoose.model('ItinerarySegment', ItinerarySegmentSchema);

// POST /api/itinerary/upsert-batch — called by UI after analyzing GPS history
// Body: { segments: [ { key, waypoints, truckId, truckName, monthKey } ] }
const itinRoute = require('express').Router();

itinRoute.post('/upsert-batch', async (req, res) => {
  try {
    const { segments } = req.body;
    if (!Array.isArray(segments) || segments.length === 0) return res.json({ ok: true, updated: 0 });

    let updated = 0;
    for (const seg of segments) {
      const { key, waypoints, truckId, truckName, monthKey } = seg;
      if (!key || !monthKey) continue;
      const truckTag = `${truckId}:${truckName}`;
      const monthPath = `monthly.${monthKey}`;

      const existing = await ItinerarySegment.findOne({ key });
      if (!existing) {
        const monthMap = new Map();
        monthMap.set(monthKey, { trucks: [truckTag], count: 1 });
        await ItinerarySegment.create({
          key, waypoints: waypoints || [],
          monthly: monthMap,
          totalObservations: 1,
          allTrucks: [truckTag],
          firstSeen: new Date(),
          lastSeen: new Date()
        });
      } else {
        // Update monthly entry
        const monthData = existing.monthly.get(monthKey) || { trucks: [], count: 0 };
        if (!monthData.trucks.includes(truckTag)) {
          monthData.trucks.push(truckTag);
          monthData.count = monthData.trucks.length;
        }
        existing.monthly.set(monthKey, monthData);
        if (!existing.allTrucks.includes(truckTag)) existing.allTrucks.push(truckTag);
        existing.totalObservations = (existing.totalObservations || 0) + 1;
        existing.lastSeen = new Date();
        if (!existing.firstSeen) existing.firstSeen = new Date();
        await existing.save();
      }
      updated++;
    }
    res.json({ ok: true, updated });
  } catch (e) {
    console.error('Itinerary upsert error:', e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/itinerary/set-names — update resolved place names
itinRoute.patch('/set-names', async (req, res) => {
  try {
    const { key, nameStart, nameEnd } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    await ItinerarySegment.updateOne({ key }, { $set: { nameStart, nameEnd } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/itinerary/all — return all stored itinerary segments
itinRoute.get('/all', async (req, res) => {
  try {
    const docs = await ItinerarySegment.find({}).lean();
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/itinerary/delete-one — remove a single route
itinRoute.delete('/delete-one', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    await ItinerarySegment.deleteOne({ key });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/itinerary/clear — wipe all (admin)
itinRoute.delete('/clear', async (req, res) => {
  try {
    await ItinerarySegment.deleteMany({});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api/itinerary', itinRoute);

// ============================================================
// ✅ MAINTENANCE ARTICLES CATALOG API
// ============================================================

// GET all articles
app.get('/api/maintenance-articles', checkAccess, async (req, res) => {
  try {
    const articles = await MaintenanceArticle.find({ isActive: true }).sort({ category: 1, name: 1 });
    res.json(fmt(articles));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create/update article
app.post('/api/maintenance-articles', checkAccess, async (req, res) => {
  try {
    const { code, name, category, description, defaultPrice, components, laborCost, estimatedDuration } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code et name requis' });
    const article = await MaintenanceArticle.findOneAndUpdate(
      { code },
      { $set: { code, name, category: category || 'general', description, defaultPrice: defaultPrice || 0, components: components || [], laborCost: laborCost || 0, estimatedDuration, updatedAt: new Date() } },
      { new: true, upsert: true }
    );
    res.json({ success: true, article: fmt([article])[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE article (soft delete)
app.delete('/api/maintenance-articles/:id', checkAccess, async (req, res) => {
  try {
    await MaintenanceArticle.findByIdAndUpdate(req.params.id, { $set: { isActive: false } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH cancel maintenance order
app.patch('/api/maintenance/:id/cancel', checkAccess, async (req, res) => {
  try {
    const doc = await Maintenance.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Ordre introuvable' });
    doc.status = 'annule';
    doc.note = (doc.note || '') + '\n[ANNULÉ le ' + new Date().toLocaleString('fr-FR') + ']';
    doc.exitDate = new Date();
    await doc.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH complete maintenance order
app.patch('/api/maintenance/:id/complete', checkAccess, async (req, res) => {
  try {
    const doc = await Maintenance.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Ordre introuvable' });
    const { cost, technician, note, parts } = req.body;
    doc.status = 'termine';
    doc.exitDate = new Date();
    if (cost !== undefined) doc.cost = cost;
    if (technician !== undefined) doc.technician = technician;
    if (note !== undefined) doc.note = note;
    if (Array.isArray(parts)) doc.parts = parts;
    await doc.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST seed default maintenance articles (one-time setup)
app.post('/api/maintenance-articles/seed-defaults', checkAccess, async (req, res) => {
  try {
    const defaults = [
      { code: 'VID-001', name: 'Vidange Moteur', category: 'Entretien Préventif', description: 'Vidange huile moteur complète avec remplacement filtre', defaultPrice: 20000, laborCost: 3000, estimatedDuration: '2h', components: [{ name: 'Huile Moteur 15W40 (10L)', quantity: 1, unitCost: 8000 }, { name: 'Filtre à Huile', quantity: 1, unitCost: 2500 }, { name: 'Joint de Bouchon', quantity: 1, unitCost: 500 }, { name: 'Filtre à Gasoil', quantity: 1, unitCost: 3000 }] },
      { code: 'FRN-001', name: 'Remplacement Plaquettes de Frein', category: 'Freinage', description: 'Remplacement plaquettes de frein avant et arrière', defaultPrice: 35000, laborCost: 5000, estimatedDuration: '3h', components: [{ name: 'Plaquettes Avant (jeu)', quantity: 1, unitCost: 12000 }, { name: 'Plaquettes Arrière (jeu)', quantity: 1, unitCost: 10000 }] },
      { code: 'PNU-001', name: 'Remplacement Pneumatiques', category: 'Pneumatiques', description: 'Changement de pneus usés', defaultPrice: 45000, laborCost: 4000, estimatedDuration: '2h', components: [{ name: 'Pneu 315/80 R22.5', quantity: 2, unitCost: 18000 }] },
      { code: 'FLT-001', name: 'Remplacement Filtres', category: 'Entretien Préventif', description: 'Remplacement de tous les filtres', defaultPrice: 15000, laborCost: 2000, estimatedDuration: '1h30', components: [{ name: 'Filtre à Air', quantity: 1, unitCost: 4000 }, { name: 'Filtre à Huile', quantity: 1, unitCost: 2500 }, { name: 'Filtre à Gasoil', quantity: 1, unitCost: 3000 }, { name: 'Filtre Séparateur Eau', quantity: 1, unitCost: 2500 }] },
      { code: 'BAT-001', name: 'Remplacement Batterie', category: 'Électrique', description: 'Remplacement batterie véhicule', defaultPrice: 25000, laborCost: 1000, estimatedDuration: '30min', components: [{ name: 'Batterie 12V 180Ah', quantity: 2, unitCost: 11000 }] },
      { code: 'EMB-001', name: 'Remplacement Embrayage', category: 'Transmission', description: 'Remplacement kit embrayage complet', defaultPrice: 85000, laborCost: 15000, estimatedDuration: '8h', components: [{ name: 'Kit Embrayage Complet', quantity: 1, unitCost: 55000 }, { name: 'Butée Embrayage', quantity: 1, unitCost: 8000 }] },
      { code: 'CRG-001', name: 'Réparation Climatisation', category: 'Confort', description: 'Recharge et réparation système climatisation', defaultPrice: 18000, laborCost: 5000, estimatedDuration: '3h', components: [{ name: 'Gaz Réfrigérant R134a', quantity: 1, unitCost: 6000 }, { name: 'Filtre Déshydrateur', quantity: 1, unitCost: 4000 }] },
      { code: 'SUS-001', name: 'Réparation Suspension', category: 'Suspension', description: 'Remplacement amortisseurs et ressorts', defaultPrice: 55000, laborCost: 8000, estimatedDuration: '5h', components: [{ name: 'Amortisseur Avant', quantity: 2, unitCost: 9000 }, { name: 'Amortisseur Arrière', quantity: 2, unitCost: 8000 }] },
      { code: 'DIV-001', name: 'Réparation Diverse', category: 'Divers', description: 'Travaux de maintenance non catégorisés', defaultPrice: 0, laborCost: 0, estimatedDuration: 'Variable', components: [] }
    ];
    for (const art of defaults) {
      await MaintenanceArticle.findOneAndUpdate({ code: art.code }, { $set: { ...art, updatedAt: new Date() } }, { upsert: true });
    }
    res.json({ success: true, count: defaults.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// --- VEHICLE REFERENCES API ---

// GET all references
app.get('/api/vehicle-references', checkAccess, async (req, res) => {
  try {
    const refs = await VehicleReference.find().sort({ expiryDate: 1 });
    res.json(refs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET references for a specific truck
app.get('/api/vehicle-references/:deviceId', checkAccess, async (req, res) => {
  try {
    const refs = await VehicleReference.find({ deviceId: req.params.deviceId }).sort({ expiryDate: 1 });
    res.json(refs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET references expiring within N days (default 30)
app.get('/api/vehicle-references-expiring', checkAccess, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const refs = await VehicleReference.find({ expiryDate: { $lte: cutoff } }).sort({ expiryDate: 1 });
    res.json(refs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST add a reference
app.post('/api/vehicle-references', checkAccess, async (req, res) => {
  try {
    const { deviceId, truckName, refName, refNumber, issueDate, expiryDate, reminderDays, notes } = req.body;
    if (!deviceId || !refName || !expiryDate) return res.status(400).json({ error: 'deviceId, refName et expiryDate sont requis' });
    const ref = new VehicleReference({ deviceId, truckName, refName, refNumber, issueDate: issueDate || new Date(), expiryDate, reminderDays: reminderDays || 30, notes });
    await ref.save();
    res.json({ success: true, ref });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update a reference
app.put('/api/vehicle-references/:id', checkAccess, async (req, res) => {
  try {
    const updates = req.body;
    const ref = await VehicleReference.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!ref) return res.status(404).json({ error: 'Référence introuvable' });
    res.json({ success: true, ref });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE a reference
app.delete('/api/vehicle-references/:id', checkAccess, async (req, res) => {
  try {
    await VehicleReference.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 9. INITIALIZATION ---

// ✅ Mongoose reconnection handlers for resilience
mongoose.connection.on('connected', () => {
  DB_STATS.connected = true;
  console.log('✅ MongoDB connection established');
});
mongoose.connection.on('disconnected', () => {
  DB_STATS.connected = false;
  DB_STATS.lastWriteError = 'MongoDB disconnected at ' + new Date().toISOString();
  console.warn('⚠️ MongoDB disconnected. Will auto-reconnect...');
});
mongoose.connection.on('error', (err) => {
  DB_STATS.lastWriteError = err.message;
  DB_STATS.totalErrors++;
  console.error('❌ MongoDB error:', err.message);
});

if (DB_URI) {
  mongoose.connect(DB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 5
  })
    .then(() => {
      DB_STATS.connected = true;
      console.log("✅ MongoDB Connected! Starting App...");
      app.listen(PORT, () => console.log(`🚀 Fleet Analytics Engine running on port ${PORT}`));
      runFleetBot();
      // ud83dudee1ufe0f Self-healing: on every server start, scan last 3 days and recover any missed refuel data
      // Runs 30s after startup to let the first bot cycle complete first
      setTimeout(() => runStartupBackfill(3).catch(e => console.error('Startup backfill error:', e.message)), 30000);
    })
    .catch(err => {
      console.error("❌ Mongo Connection Failed:", err.message);
      // Still start the server so health endpoint is reachable
      app.listen(PORT, () => console.log(`🚀 Server running (DB FAILED) on port ${PORT}`));
    });
} else {
  console.error("❌ FATAL: Missing DB_URI");
  app.listen(PORT, () => console.log(`🚀 Server running (No DB Mode) on port ${PORT}`));
}




