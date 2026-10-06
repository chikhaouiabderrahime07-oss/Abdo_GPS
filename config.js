/*
 * Fleet Tracker Configuration
 * Contains API keys, server settings, and vehicle parameters.
 */
const FLEETCONFIG = {

    // --- MAPBOX CONFIGURATION ---
    MAPBOX_TOKEN: 'pk.eyJ1IjoiZGVzdGVuaXoiLCJhIjoiY21qYWNsZ2RsMDJ1NjNmc2IwdW4xeXdlbCJ9.toA-GeOlzBEuEJHrXsZp-w',

    // --- OTHER KEYS ---
    GEOAPIFY_API_KEY: 'b6fb88dee9494c9bab15b4f8e6bfbd58',
    GEOAPIFY_API_KEYS: [],

    LANGUAGE: 'fr',
    AUTO_START: true,
    DEFAULT_POLL_INTERVAL: 180000,
    DEFAULT_SERVER_URL: '',

    // Location Types
    LOCATION_TYPES: [
        { id: 'client', label: 'Client / Livraison', color: '#1976d2', icon: 'fa-user-tie' },
        { id: 'maintenance', label: 'Maintenance / Garage', color: '#d32f2f', icon: 'fa-wrench' },
        { id: 'douroub', label: 'Site Douroub', color: '#166534', icon: 'fa-building' },
        { id: 'other', label: 'Autre', color: '#666666', icon: 'fa-map-marker-alt' }
    ],

    // Maintenance Trigger Rules
    MAINTENANCE_RULES: {
        minDurationMinutes: 60,
        vidangeKmTolerance: 3000
    },

    // =====================================================
    // REFUEL DETECTION RULES (Chinese GPS Tracker Edition)
    // =====================================================
    // These rules control how the server detects fuel refills.
    // Tuned for Chinese GPS trackers (io87 fuel sensor).
    //
    // KEY OPTIONS EXPLAINED:
    // -------------------------------------------------------
    // minRefuelLiters: 50
    //   → Minimum liters increase to count as a real refill.
    //   → Anything ≤50L is ignored (sensor noise, small top-ups).
    //   → Increase to 80 if you get too many false refills.
    //
    // minOffMinutes: 2
    //   → Engine must be OFF at least this long before a refill counts.
    //   → Chinese GPS sometimes reports erratic values when engine
    //     just turned off. 2 min gives the sensor time to stabilize.
    //   → Increase to 5 if you get ghost refills at traffic lights.
    //
    // postOnMaxMinutes: 10
    //   → After engine turns ON, wait up to this long to capture
    //     the max fuel level (sensor needs time to settle after restart).
    //   → If truck starts moving before this, we finalize immediately.
    //
    // postOnMinSeconds: 60
    //   → Minimum wait after engine ON before finalizing.
    //   → Prevents premature detection from sensor spikes.
    //
    // movingSpeedThreshold: 1
    //   → Speed (km/h) above which we consider the truck "moving".
    //   → When moving, we finalize the refill check immediately.
    //
    // dedupeMinutes: 5
    //   → Don't log another refill within this many minutes.
    //   → Prevents double-counting from sensor bouncing.
    //
    // baselineDropToleranceLiters: 15
    //   → Chinese GPS fuel sensors can DROP while engine is off
    //     (temperature, sloshing). We allow this much drop without
    //     inflating the refill amount.
    //   → Example: was 200L, drops to 190L while parked, then fills
    //     to 400L. Real refill = 400-200=200L, not 400-190=210L.
    //
    // sensorSmoothingWindow: 3
    //   → Number of readings to average for smoothing.
    //   → Chinese GPS sensors are NOISY. This reduces false spikes.
    //   → Set to 1 to disable smoothing (raw values).
    //
    // ignorePercentBelow: 1
    //   → Ignore fuel readings below this percentage.
    //   → Chinese GPS sometimes reports 0% briefly during startup.
    //
    // ignorePercentAbove: 100
    //   → Ignore fuel readings above this percentage.
    //   → Some sensors overshoot to 101-105% after a full fill.
    //
    // maxRealisticRefillLiters: 600
    //   → Maximum realistic refill in one stop.
    //   → If detected refill exceeds this, it's likely a sensor glitch.
    //   → Set to your tank capacity (or slightly above).
    //
    // requireEngineOff: true
    //   → If true, only detect refills when engine was confirmed OFF.
    //   → Chinese GPS io1 (ignition) isn't always reliable.
    //   → Set to false if your GPS doesn't have ignition detection.
    //
    // sensorType: 'io87'
    //   → Which parameter from the GPS contains fuel level.
    //   → Common Chinese GPS values: 'io87', 'io84', 'fuel'
    //
    // -------------------------------------------------------
    REFUEL_RULES: {
        minRefuelLiters: 60,
        stopSpeedThreshold: 4,
        minStopMinutes: 2,
        requireIgnOff: false,
        dedupeMinutes: 20,
        dedupeLitersTolerance: 12,
        stableAfterIncreaseMinutes: 4,
        // --- Advanced (Chinese GPS) ---
        minOffMinutes: 2,
        postOnMaxMinutes: 10,
        postOnMinSeconds: 60,
        movingSpeedThreshold: 1,
        baselineDropToleranceLiters: 25,
        sensorSmoothingWindow: 5,
        ignorePercentBelow: 1,
        ignorePercentAbove: 100,
        maxRealisticRefillLiters: 600,
        requireEngineOff: false,  // ★ Set true ONLY if your GPS has io1 ignition sensor. false = speed-based detection (works for ALL Chinese GPS)
        sensorType: 'io87'
    },

    // --- GLOBAL DEFAULT CONFIG ---
    DEFAULT_TRUCK_CONFIG: {
        fuelTankCapacity: 600,
        fuelConsumption: 32,
        fuelPricePerLiter: 29,
        fuelSecurityMargin: 100,
        fuelAlertThreshold: 15,
        criticalFuelLevel: 5,
        vidangeStartKm: 5000,
        vidangeRotationKm: 25000,
        vidangeAlertKm: 500,
        vidangeMilestones: '',
        calibration: [],
        fuelSensorKeys: ['io87'],
        fuelSensorCapacityMap: {}
    },

    // =====================================================
    // NAFTAL FUEL CARD MANAGEMENT SYSTEM
    // =====================================================
    NAFTAL_MANAGEMENT: {
        refillTolerancePercent: 5,        // ±5% error margin before flagging a refill as suspicious
        minDetectionRadiusKm: 5,          // Min GPS movement after refill to register new fuel level
        maxDetectionRadiusKm: 10,         // Max GPS movement window for stabilized reading
        stationProximityKm: 2,            // Proximity radius to known Naftal stations
        transportPassword: '',            // Password for transport declarations (set via Settings)
        gestionnairePassword: '',         // Password for gestionnaire approval (set via Settings)
        masterUnlockPassword: '',         // Admin override to unlock validated declarations
        autoEstimateEnabled: true,        // Auto-calculate fuel cost estimates for gestionnaire
        declarationLockEnabled: true,     // Lock validated declarations (require master password to reopen)
        roadDistanceFactor: 1.25,         // Haversine to road distance multiplier
        noRefillReminderHours: 24,        // Send reminder notification if no refill detected after X hours
        defaultNaftalPrice: 31            // Default Naftal station price (DA/L)
    },

    // --- RULE BASED SYSTEM ---
    FLEET_RULES: [],
    CUSTOM_LOCATIONS: [],

    UI: {
        enableGeocoding: true,
        geocodeDistanceThresholdKm: 2,
        pollInterval: 180000
    },

    API: {
        baseUrl: '',
        trucksEndpoint: '/api/trucks',
        settingsEndpoint: '/api/settings'
    }
};

// =====================================================
// COMPATIBILITY ALIAS
// Some files use FLEET_CONFIG, some use FLEETCONFIG.
// This alias ensures both work everywhere.
// =====================================================
const FLEET_CONFIG = FLEETCONFIG;


// =====================================================
// FUEL SENSOR HELPERS
// Supports:
//  - single IO: io87
//  - typed custom IO: io67
//  - multi-IO sum: io67+io82 (or comma/newline separated)
// Notes:
//  - If a raw sensor value is >100, it is treated as liters.
//  - With multiple 0-100 sensors, the system adds each tank's
//    contribution across the total configured capacity.
// =====================================================
function normalizeFuelSensorKeys(rawValue) {
    let tokens = [];
    if (Array.isArray(rawValue)) {
        tokens = rawValue;
    } else if (typeof rawValue === 'string') {
        tokens = rawValue.split(/[\n,+;|/\\]+|\s+/g);
    } else if (rawValue !== undefined && rawValue !== null) {
        tokens = [rawValue];
    }

    const cleaned = Array.from(new Set(
        tokens
            .map(v => String(v || '').trim().toLowerCase())
            .filter(Boolean)
    ));

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
    if (config && typeof config.sensorType === 'string' && config.sensorType.trim()) {
        return normalizeFuelSensorKeys(config.sensorType);
    }
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

    const parseStringChunk = (text) => {
        String(text || '').split(/[\n,;+|]+/).forEach((chunk) => {
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
            const fallbackKeys = ['io87', 'fuel', 'io84'];
            for (const key of fallbackKeys) {
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
    const MAX_SMOOTH_GAP_MS = 3 * 60 * 1000;
    const MAX_STEP_NOISE_LITERS = 35;

    return safe.map((point, idx) => {
        const neighbors = [point.liters];
        for (let b = 1; b <= radius; b += 1) {
            const prev = safe[idx - b];
            if (!prev || Math.abs(point.time - prev.time) > (b * MAX_SMOOTH_GAP_MS)) break;
            if (Math.abs(prev.liters - point.liters) > MAX_STEP_NOISE_LITERS) break;
            neighbors.push(prev.liters);
        }
        for (let f = 1; f <= radius; f += 1) {
            const nxt = safe[idx + f];
            if (!nxt || Math.abs(nxt.time - point.time) > (f * MAX_SMOOTH_GAP_MS)) break;
            if (Math.abs(nxt.liters - point.liters) > MAX_STEP_NOISE_LITERS) break;
            neighbors.push(nxt.liters);
        }
        return { ...point, litersSmooth: Math.round(medianForNumbers(neighbors) * 10) / 10 };
    });
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return 0;
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function mergeRefillEvents(events, dedupeMs = 30 * 60 * 1000, dedupeDistanceMeters = 400) {
    const sorted = (Array.isArray(events) ? events : [])
        .filter(Boolean)
        .sort((a, b) => (a.time || 0) - (b.time || 0));

    if (!sorted.length) return [];

    const effectiveDedupeMs = Math.max(10 * 60 * 1000, (parseFloat(dedupeMs) || 30 * 60 * 1000));
    const effectiveDedupeDist = (typeof dedupeDistanceMeters === 'number' && dedupeDistanceMeters > 0) ? dedupeDistanceMeters : 400;

    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
        const prev = merged[merged.length - 1];
        const cur = sorted[i];

        const prevStart = prev.startTimeMs || prev.time || 0;
        const prevEnd = prev.endTimeMs || prev.time || 0;
        const curStart = cur.startTimeMs || cur.time || 0;
        const curEnd = cur.endTimeMs || cur.time || 0;

        const timeDiff = Math.abs((cur.time || 0) - (prev.time || 0));
        const windowsOverlapOrClose = effectiveDedupeMs > 0 && (
            timeDiff <= effectiveDedupeMs ||
            curStart <= (prevEnd + effectiveDedupeMs) ||
            Math.abs(curStart - prevStart) <= effectiveDedupeMs
        );

        let closeInDistance = false;
        if (Number.isFinite(prev.lat) && Number.isFinite(prev.lng) && Number.isFinite(cur.lat) && Number.isFinite(cur.lng)) {
            const dist = haversineDistanceMeters(prev.lat, prev.lng, cur.lat, cur.lng);
            if (dist <= effectiveDedupeDist) {
                closeInDistance = true;
            }
        }

        if (windowsOverlapOrClose || (closeInDistance && timeDiff <= (effectiveDedupeMs * 2))) {
            const oldLevel = Math.min(prev.oldLevel ?? prev.litersSmooth ?? 0, cur.oldLevel ?? cur.litersSmooth ?? 0);
            const newLevel = Math.max(prev.newLevel ?? prev.litersSmooth ?? 0, cur.newLevel ?? cur.litersSmooth ?? 0);
            const addedLiters = Math.round(newLevel - oldLevel);
            const prevConf = parseFloat(prev.confidence) || 0.85;
            const curConf = parseFloat(cur.confidence) || 0.85;

            merged[merged.length - 1] = {
                ...prev,
                ...cur,
                startTimeMs: Math.min(prevStart, curStart),
                endTimeMs: Math.max(prevEnd, curEnd),
                time: Math.min(prev.time || 0, cur.time || 0),
                lat: Number.isFinite(cur.lat) ? cur.lat : prev.lat,
                lng: Number.isFinite(cur.lng) ? cur.lng : prev.lng,
                oldLevel: Math.round(oldLevel),
                newLevel: Math.round(newLevel),
                addedLiters: addedLiters,
                confidence: Math.round(Math.max(prevConf, curConf) * 100) / 100,
                durationMin: Math.max(1, Math.round((Math.max(prevEnd, curEnd) - Math.min(prevStart, curStart)) / 60000)),
                detectionMode: prev.detectionMode === cur.detectionMode ? prev.detectionMode : 'consolidated'
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
            const meters = haversineDistanceMeters(safe[i].lat, safe[i].lng, safe[j].lat, safe[j].lng);
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
    const dedupeMinutes = parseFloat(options.dedupeMinutes ?? 30) || 30;
    const dedupeMs = Math.max(10 * 60 * 1000, dedupeMinutes * 60 * 1000);
    const dedupeDistanceMeters = parseFloat(options.dedupeDistanceMeters ?? 400) || 400;
    const maxStationarySpreadMeters = Math.max(150, parseFloat(options.maxStationarySpreadMeters ?? 500) || 500);
    const sensorSmoothingWindow = Math.max(1, parseInt(options.sensorSmoothingWindow ?? 5, 10) || 5);
    const requireIgnOff = options.requireIgnOff === true || options.requireEngineOff === true;

    const prepared = smoothFuelSeriesPoints(points, sensorSmoothingWindow, maxRealisticRefillLiters);
    if (prepared.length < 2) return [];

    prepared.forEach((point) => {
        point.isStopLike = (point.speed <= stopSpeedThreshold) && (!requireIgnOff || point.ign !== 1);
    });

    const candidateEvents = [];

    const getSpatialDispersion = (pts) => {
        const valid = pts.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        if (valid.length < 2) return 0;
        let maxDist = 0;
        for (let a = 0; a < valid.length; a += 1) {
            for (let b = a + 1; b < valid.length; b += 1) {
                const d = haversineDistanceMeters(valid[a].lat, valid[a].lng, valid[b].lat, valid[b].lng);
                if (d > maxDist) maxDist = d;
            }
        }
        return maxDist;
    };

    const checkPersistence = (fromIdx, eventTime, minLevel) => {
        const horizonMs = 20 * 60 * 1000;
        const windowPoints = [];
        for (let k = fromIdx; k < prepared.length; k += 1) {
            if (prepared[k].time > (eventTime + horizonMs)) break;
            windowPoints.push(prepared[k]);
        }
        if (windowPoints.length === 0) return true;
        const valid = windowPoints.map((p) => p.litersSmooth);
        const med = medianForNumbers(valid);
        return med >= (minLevel - 15);
    };

    // 1. Stationary / Stop Analysis (vehicle halted at station)
    let s = 0;
    while (s < prepared.length) {
        if (!prepared[s].isStopLike) {
            s += 1;
            continue;
        }

        let e = s;
        while (e + 1 < prepared.length && prepared[e + 1].isStopLike) {
            e += 1;
        }

        const segment = prepared.slice(s, e + 1);
        if (segment.length >= 2) {
            const earlyPoints = segment.slice(0, Math.min(4, Math.max(1, Math.floor(segment.length / 3))));
            const earlyLiters = earlyPoints.map((p) => p.litersSmooth);
            const baseline = Math.min(...earlyLiters);
            const baseIdx = earlyPoints.reduce((best, p, idx) => (p.litersSmooth <= earlyLiters[best] ? idx : best), 0);

            let maxLiters = -1;
            let peakIdxInSeg = -1;
            for (let k = baseIdx; k < segment.length; k += 1) {
                if (segment[k].litersSmooth > maxLiters) {
                    maxLiters = segment[k].litersSmooth;
                    peakIdxInSeg = k;
                }
            }

            if (peakIdxInSeg >= 0) {
                const latePoints = segment.slice(peakIdxInSeg, Math.min(segment.length, peakIdxInSeg + 5));
                const plateau = medianForNumbers(latePoints.map((p) => p.litersSmooth));
                const netRise = plateau - baseline;

                if (netRise >= minRefuelLiters && netRise <= maxRealisticRefillLiters) {
                    const startPt = segment[baseIdx];
                    const endPt = segment[peakIdxInSeg];
                    const dispersion = getSpatialDispersion(segment.slice(baseIdx, peakIdxInSeg + 1));
                    const globalEndIdx = s + peakIdxInSeg;
                    const isPersistent = checkPersistence(globalEndIdx + 1, endPt.time, plateau - (netRise * 0.25));

                    if (dispersion <= maxStationarySpreadMeters && isPersistent) {
                        candidateEvents.push({
                            index: endPt.index,
                            time: endPt.time,
                            startTimeMs: startPt.time,
                            endTimeMs: endPt.time,
                            lat: endPt.lat,
                            lng: endPt.lng,
                            addedLiters: Math.round(netRise),
                            oldLevel: Math.round(baseline),
                            newLevel: Math.round(plateau),
                            speed: endPt.speed,
                            ign: endPt.ign,
                            confidence: 0.96,
                            durationMin: Math.max(1, Math.round((endPt.time - startPt.time) / 60000)),
                            detectionMode: 'stationary-stop'
                        });
                    }
                }
            }
        }
        s = e + 1;
    }

    // 2. Sleep Gap / Ignition-Off Step Refill (tracker wakes up after station stop)
    for (let i = 0; i < prepared.length - 1; i += 1) {
        const ptA = prepared[i];
        const ptB = prepared[i + 1];
        const deltaMs = ptB.time - ptA.time;
        const rise = ptB.litersSmooth - ptA.litersSmooth;

        if (rise >= minRefuelLiters && rise <= maxRealisticRefillLiters) {
            const dist = (Number.isFinite(ptA.lat) && Number.isFinite(ptB.lat))
                ? haversineDistanceMeters(ptA.lat, ptA.lng, ptB.lat, ptB.lng)
                : 0;
            const bothSlowOrGap = (ptA.speed <= (stopSpeedThreshold + 2) || ptB.speed <= (stopSpeedThreshold + 2) || deltaMs >= 120000);
            const isPersistent = checkPersistence(i + 1, ptB.time, ptB.litersSmooth - (rise * 0.25));

            if (dist <= maxStationarySpreadMeters && bothSlowOrGap && isPersistent) {
                candidateEvents.push({
                    index: ptB.index,
                    time: ptB.time,
                    startTimeMs: ptA.time,
                    endTimeMs: ptB.time,
                    lat: ptB.lat || ptA.lat,
                    lng: ptB.lng || ptA.lng,
                    addedLiters: Math.round(rise),
                    oldLevel: Math.round(ptA.litersSmooth),
                    newLevel: Math.round(ptB.litersSmooth),
                    speed: ptB.speed,
                    ign: ptB.ign,
                    confidence: 0.92,
                    durationMin: Math.max(1, Math.round(deltaMs / 60000)),
                    detectionMode: 'ignition-gap'
                });
            }
        }
    }

    // 3. Master Consolidation & Deduplication (30 min / 400m window)
    const consolidated = mergeRefillEvents(candidateEvents, dedupeMs, dedupeDistanceMeters);

    return consolidated.filter((evt) => {
        const added = parseFloat(evt.addedLiters);
        return Number.isFinite(added) && added >= minRefuelLiters && added <= maxRealisticRefillLiters;
    });
}

// ============================================================

// =====================================================
// AUTO-RESOLVE BACKEND URL
// =====================================================
(function resolveFleetBaseUrl() {
    function normalizeUrl(u) {
        if (!u) return null;
        u = String(u).trim();
        if (!u) return null;
        if (u.startsWith('//')) u = window.location.protocol + u;
        if (!/^https?:/i.test(u)) {
            if (u.startsWith('localhost') || u.startsWith('127.0.0.1'))
                u = 'http://' + u;
            else
                u = 'https://' + u;
        }
        u = u.replace(/\/+$/, '');
        return u;
    }
    try {
        const params = new URLSearchParams(window.location.search);
        const reset = params.get('reset') || params.get('resetServer');
        if (reset === '1' || reset === 'true') {
            try { localStorage.removeItem('fleetServerUrl'); } catch (e) {}
        }
        const qp = params.get('server') || params.get('backend') || params.get('api');
        const qpUrl = normalizeUrl(qp);
        if (qpUrl) {
            FLEETCONFIG.API.baseUrl = qpUrl;
            FLEETCONFIG.DEFAULT_SERVER_URL = qpUrl;
            try { localStorage.setItem('fleetServerUrl', qpUrl); } catch (e) {}
            console.log('Backend URL from query param', qpUrl);
            return;
        }
    } catch (e) {}

    try {
        const saved = normalizeUrl(localStorage.getItem('fleetServerUrl'));
        if (saved) {
            FLEETCONFIG.API.baseUrl = saved;
            FLEETCONFIG.DEFAULT_SERVER_URL = saved;
            console.log('Backend URL from localStorage', saved);
            return;
        }
    } catch (e) {}

    try {
        const origin = window.location.origin;
        const isFile = window.location.protocol === 'file:' || !origin || origin === 'null';
        if (!isFile) {
            const clean = normalizeUrl(origin);
            FLEETCONFIG.API.baseUrl = clean;
            FLEETCONFIG.DEFAULT_SERVER_URL = clean;
            console.log('Backend URL from same-origin', clean);
            return;
        }
    } catch (e) {}

    const fallback = 'http://localhost:3000';
    FLEETCONFIG.API.baseUrl = fallback;
    FLEETCONFIG.DEFAULT_SERVER_URL = fallback;
    console.warn('file:// detected, defaulting backend to', fallback);
    console.warn('Tip: start the server and open http://localhost:3000 (avoid file://)');
})();


// =====================================================
// GLOBAL HELPERS
// =====================================================
function getTruckConfig(deviceId) {
    const globalDefault = FLEETCONFIG.DEFAULT_TRUCK_CONFIG;
    let specificConfig;
    let ruleName = null;

    if (FLEETCONFIG.FLEET_RULES && Array.isArray(FLEETCONFIG.FLEET_RULES)) {
        const matchedRule = FLEETCONFIG.FLEET_RULES.find(rule =>
            rule.truckIds && rule.truckIds.includes(deviceId.toString())
        );
        if (matchedRule && matchedRule.config) {
            specificConfig = matchedRule.config;
            ruleName = matchedRule.name;
        }
    }
    return { ...globalDefault, ...specificConfig, ruleName: ruleName };
}

function calculateVidangeStatus(currentOdometer, config, lastVidangeKm = null) {
    const alertKm   = parseInt((config && config.vidangeAlertKm)   || 500);
    const startKm   = parseInt((config && config.vidangeStartKm)   || 5000);
    const rotKm     = parseInt((config && config.vidangeRotationKm) || 25000);

    // ── Rotation logic (primary) ─────────────────────────────────
    if (rotKm > 0) {
        const lastKm = parseInt(lastVidangeKm || 0);
        const odo    = parseInt(currentOdometer);
        let nextKm;
        if (lastKm > 0) {
            // Known last vidange → rotate from there
            nextKm = lastKm + rotKm;
        } else if (odo <= startKm) {
            // Truck hasn't reached first vidange yet
            nextKm = startKm;
        } else {
            // No history but truck is past startKm: compute virtual rotation
            const rotsPassed = Math.floor((odo - startKm) / rotKm);
            const prevKm = startKm + rotsPassed * rotKm;
            // If the truck is overdue for the PREVIOUS virtual rotation by less than half a rotation (e.g. < 12500 km),
            // we assume it missed it and flag it as URGENT (nextKm = prevKm).
            // Otherwise, we assume it was done and we target the next rotation.
            if ((odo - prevKm) <= (rotKm / 2)) {
                nextKm = prevKm;
            } else {
                nextKm = startKm + (rotsPassed + 1) * rotKm;
            }
        }
        const kmUntilNext = nextKm - odo;
        return { alert: kmUntilNext <= alertKm, nextKm, kmUntilNext, alertKm, lastKm: lastKm > 0 ? lastKm : null, isVirtual: lastKm === 0 };
    }

    // ── Legacy milestone fallback ─────────────────────────────────
    let milestones = [];
    if (config && config.vidangeMilestones) {
        if (typeof config.vidangeMilestones === 'string') {
            milestones = config.vidangeMilestones.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).sort((a, b) => a - b);
        } else if (Array.isArray(config.vidangeMilestones)) {
            milestones = config.vidangeMilestones.slice().sort((a,b)=>a-b);
        }
    }
    if (milestones.length === 0) return { alert: false, nextKm: 'NA', kmUntilNext: 999999, alertKm, lastKm: null };
    const base = parseInt(lastVidangeKm || 0);
    const active = milestones.filter(m => m > base && (parseInt(currentOdometer) - m) <= 10000);
    const next = active[0] || null;
    if (!next) return { alert: false, nextKm: 'NA', kmUntilNext: 999999, alertKm };
    const kmUntilNext = next - parseInt(currentOdometer);
    return { alert: kmUntilNext <= alertKm, nextKm: next, kmUntilNext, alertKm, lastKm: base > 0 ? base : null, isVirtual: false };
}

function calculateFuelNeeded(distanceKm, consumptionPer100) {
    return Math.round(distanceKm / 100 * consumptionPer100);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
}
