/*
 * Fleet Tracker Configuration
 * Contains API keys, server settings, and vehicle parameters.
 */
const FLEETCONFIG = {

    // --- MAPBOX CONFIGURATION ---
    MAPBOXTOKEN: 'pk.eyJ1IjoiZGVzdGVuaXoiLCJhIjoiY21qYWNsZ2RsMDJ1NjNmc2IwdW4xeXdlbCJ9.toA-GeOlzBEuEJHrXsZp-w',

    // --- OTHER KEYS ---
    GEOAPIFYAPIKEY: 'b6fb88dee9494c9bab15b4f8e6bfbd58',
    GEOAPIFYAPIKEYS: [],

    LANGUAGE: 'fr',
    AUTOSTART: true,
    DEFAULTPOLLINTERVAL: 120000,
    DEFAULTSERVERURL: '',

    // Location Types
    LOCATIONTYPES: [
        { id: 'client', label: 'Client / Livraison', color: '1976d2', icon: 'fa-user-tie' },
        { id: 'maintenance', label: 'Maintenance / Garage', color: 'd32f2f', icon: 'fa-wrench' },
        { id: 'douroub', label: 'Site Douroub', color: '166534', icon: 'fa-building' },
        { id: 'other', label: 'Autre', color: '666666', icon: 'fa-map-marker-alt' }
    ],

    // Maintenance Trigger Rules
    MAINTENANCERULES: {
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
    REFUELRULES: {
        minRefuelLiters: 30,
        minOffMinutes: 2,
        postOnMaxMinutes: 10,
        postOnMinSeconds: 60,
        movingSpeedThreshold: 1,
        dedupeMinutes: 5,
        baselineDropToleranceLiters: 15,
        sensorSmoothingWindow: 3,
        ignorePercentBelow: 1,
        ignorePercentAbove: 100,
        maxRealisticRefillLiters: 600,
        requireEngineOff: true,
        sensorType: 'io87'
    },

    // --- GLOBAL DEFAULT CONFIG ---
    DEFAULTTRUCKCONFIG: {
        fuelTankCapacity: 600,
        fuelConsumption: 32,
        fuelPricePerLiter: 29,
        fuelSecurityMargin: 100,
        fuelAlertThreshold: 15,
        criticalFuelLevel: 5,
        vidangeMilestones: '30000, 60000, 90000',
        vidangeAlertKm: 5000,
        calibration: []
    },

    // --- RULE BASED SYSTEM ---
    FLEETRULES: [],
    CUSTOMLOCATIONS: [],

    UI: {
        enableGeocoding: true,
        geocodeDistanceThresholdKm: 2,
        pollInterval: 120000
    },

    API: {
        baseUrl: '',
        trucksEndpoint: 'api/trucks',
        settingsEndpoint: 'api/settings'
    }
};

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
            FLEETCONFIG.DEFAULTSERVERURL = qpUrl;
            try { localStorage.setItem('fleetServerUrl', qpUrl); } catch (e) {}
            console.log('Backend URL from query param', qpUrl);
            return;
        }
    } catch (e) {}

    try {
        const saved = normalizeUrl(localStorage.getItem('fleetServerUrl'));
        if (saved) {
            FLEETCONFIG.API.baseUrl = saved;
            FLEETCONFIG.DEFAULTSERVERURL = saved;
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
            FLEETCONFIG.DEFAULTSERVERURL = clean;
            console.log('Backend URL from same-origin', clean);
            return;
        }
    } catch (e) {}

    const fallback = 'http://localhost:3000';
    FLEETCONFIG.API.baseUrl = fallback;
    FLEETCONFIG.DEFAULTSERVERURL = fallback;
    console.warn('file:// detected, defaulting backend to', fallback);
    console.warn('Tip: start the server and open http://localhost:3000 (avoid file://)');
})();


// =====================================================
// GLOBAL HELPERS
// =====================================================
function getTruckConfig(deviceId) {
    const globalDefault = FLEETCONFIG.DEFAULTTRUCKCONFIG;
    let specificConfig;
    let ruleName = null;

    if (FLEETCONFIG.FLEETRULES && Array.isArray(FLEETCONFIG.FLEETRULES)) {
        const matchedRule = FLEETCONFIG.FLEETRULES.find(rule =>
            rule.truckIds && rule.truckIds.includes(deviceId.toString())
        );
        if (matchedRule && matchedRule.config) {
            specificConfig = matchedRule.config;
            ruleName = matchedRule.name;
        }
    }
    return { ...globalDefault, ...specificConfig, ruleName: ruleName };
}

function calculateVidangeStatus(currentOdometer, config, skipUntilKm = null) {
    const alertKm = config && config.vidangeAlertKm ? config.vidangeAlertKm : 5000;
    if (!config || !config.vidangeMilestones) return { alert: false, nextKm: 'NA', kmUntilNext: 999999, alertKm };
    let milestones;
    if (typeof config.vidangeMilestones === 'string') {
        milestones = config.vidangeMilestones.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).sort((a, b) => a - b);
    } else if (Array.isArray(config.vidangeMilestones)) {
        milestones = config.vidangeMilestones;
    }
    const safeSkip = (skipUntilKm !== null && skipUntilKm !== undefined) ? parseInt(skipUntilKm, 10) : null;
    const base = (!isNaN(safeSkip) && safeSkip > 0) ? safeSkip : 0;
    const nextMilestone = milestones.find(m => m > base);
    if (!nextMilestone) return { alert: false, nextKm: 'NA', kmUntilNext: 999999, alertKm };
    const kmUntilNext = nextMilestone - currentOdometer;
    const isAlert = kmUntilNext <= alertKm;
    return { alert: isAlert, nextKm: nextMilestone, kmUntilNext: kmUntilNext, alertKm };
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
