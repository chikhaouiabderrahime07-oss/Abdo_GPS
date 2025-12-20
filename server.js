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

// --- 1. MONGODB CONNECTION ---
const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("✅ MongoDB Connected! (Gatekeeper Active 🔒)"))
        .catch(err => console.error("❌ Mongo Error:", err));
} else {
    console.error("❌ FATAL: Missing MONGO_URI");
}

// --- 2. DATA MODELS & AUTO-DELETE RULES (TTL) ---

// --- ACCESS CONTROL MODEL (THE KEY) ---
const AccessCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, index: true },
    note: String // e.g. "My Phone Number"
});
const AccessCode = mongoose.model('AccessCode', AccessCodeSchema);

// A. Truck State (Persistent Latest Position - The Source of Truth)
const TruckSchema = new mongoose.Schema({
    deviceId: { type: String, unique: true },
    truckName: String,
    lastUpdate: Number,
    lastFuelLiters: Number,
    lastFuelPercent: Number,
    lat: Number, lng: Number, speed: Number,
    zone: String, entryTime: Number,
    hasLogged: Boolean, logId: String,
    params: Object 
}, { strict: false });

// B. Events (These grow, so we Auto-Delete after 90 Days to keep DB lean)
const expireRule = { expires: '90d' }; 

const RefuelSchema = new mongoose.Schema({
    deviceId: String, truckName: String,
    addedLiters: Number, oldLevel: Number, newLevel: Number,
    timestamp: { type: Date, required: true, index: expireRule }, 
    locationRaw: String, isInternal: Boolean,
    lat: Number, 
    lng: Number  
});

const MaintenanceSchema = new mongoose.Schema({
    truckName: String, deviceId: String, type: String,
    location: String, odometer: Number,
    date: { type: Date, required: true, index: expireRule },
    exitDate: Date, note: String, isAuto: Boolean
});

const DecouchageSchema = new mongoose.Schema({
    date: String, 
    snapshotTime: { type: Date, required: true, index: expireRule },
    deviceId: String, truckName: String,
    locationAtMidnight: {
        lat: Number,
        lng: Number
    }, 
    distanceFromSite: Number,
    status: String, entryTime: Date, lastUpdate: Date, isClosed: Boolean
});

const SettingsSchema = new mongoose.Schema({
    id: { type: String, unique: true }, // 'global'
    customLocations: Array,
    maintenanceRules: Object,
    defaultConfig: Object,
    fleetRules: Array,
    lastDecouchageCheck: String
}, { strict: false });

// Compile Models
const Truck = mongoose.model('Truck', TruckSchema);
const Refuel = mongoose.model('Refuel', RefuelSchema);
const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);
const Decouchage = mongoose.model('Decouchage', DecouchageSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// --- 3. SMART CACHE & CONFIG ---
let SYSTEM_SETTINGS = {
    customLocations: [],
    maintenanceRules: { minDurationMinutes: 60 },
    defaultConfig: { fuelTankCapacity: 600, fuelConsumption: 35 }, 
    fleetRules: [], 
    lastDecouchageCheck: null 
};

const GPS_API_URL = 'https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_LOCATIONS,*';

// --- 4. HELPERS ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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

// Convert MongoDB _id to id and Force Coordinates to Number for the frontend geocoder
const fmt = (list) => list.map(d => { 
    const o = d.toObject(); 
    o.id = o._id.toString(); 
    if(o.lat) o.lat = parseFloat(o.lat);
    if(o.lng) o.lng = parseFloat(o.lng);
    if(o.locationAtMidnight) {
        o.locationAtMidnight.lat = parseFloat(o.locationAtMidnight.lat);
        o.locationAtMidnight.lng = parseFloat(o.locationAtMidnight.lng);
    }
    delete o._id; return o; 
});

// --- 5. LOGIC ENGINE ---

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

async function runFleetBot() {
    await loadSettings();

    let rawData = {};
    try {
        const response = await fetch(GPS_API_URL);
        const json = await response.json();
        rawData = json.data || json; 
    } catch (e) {
        console.log("Bot fetch error:", e.message);
        setTimeout(runFleetBot, 120000); return; 
    }
    
    const now = Date.now();
    const minDuration = SYSTEM_SETTINGS.maintenanceRules.minDurationMinutes || 60;

    const truckArray = Array.isArray(rawData) ? rawData : Object.entries(rawData).map(([id, val]) => ({ ...val, id }));

    // Global Daily Logic
    await runDecouchageLogic(truckArray);

    for (const truck of truckArray) {
        const deviceId = String(truck.id || truck.imei);
        if (!truck.params || truck.loc_valid === '0' || deviceId === "undefined") continue;

        const lat = parseFloat(truck.lat);
        const lng = parseFloat(truck.lng);
        const truckName = truck.name;
        const config = getTruckConfig(deviceId);
        const rawSensor = parseFloat(truck.params.io87) || 0; 
        const capacity = config.fuelTankCapacity || 600;
        const currentLiters = Math.round((rawSensor / 100) * capacity);
        
        // 🔎 SOURCE OF TRUTH: Fetch previous state from MongoDB (NOT local RAM)
        const lastState = await Truck.findOne({ deviceId });
        
        if (!lastState) {
            // Register first time and skip logic
            await Truck.findOneAndUpdate({ deviceId }, { truckName, lastUpdate: now, lastFuelLiters: currentLiters, lat, lng, params: truck.params }, { upsert: true });
            continue;
        }

        let needsUpdate = false;
        let updatePayload = {
            truckName, lastUpdate: now,
            lastFuelLiters: currentLiters, lastFuelPercent: rawSensor,
            lat, lng, speed: parseInt(truck.speed) || 0,
            params: truck.params
        };

        // --- A. REFUEL DETECTION (STRICT DB COMPARISON) ---
        if (lastState.lastFuelLiters > 0) {
            const diff = currentLiters - lastState.lastFuelLiters;
            if (diff >= 50 && (parseInt(truck.speed) || 0) < 5) {
                console.log(`⛽ REAL REFUEL DETECTED: ${truckName} (+${diff}L)`);
                let locName = `GPS: ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
                let isInternal = false;
                for (const loc of SYSTEM_SETTINGS.customLocations) {
                    if (calculateDistance(lat, lng, loc.lat, loc.lng) <= (loc.radius || 500)) {
                        locName = loc.name; isInternal = true; break;
                    }
                }
                await Refuel.create({
                    deviceId, truckName, addedLiters: diff,
                    oldLevel: lastState.lastFuelLiters, newLevel: currentLiters,
                    timestamp: new Date(), locationRaw: locName, isInternal, lat, lng
                });
                needsUpdate = true;
            }
        }

        // --- B. MAINTENANCE LOGIC (PERSISTENT SESSIONS) ---
        let inZone = false, zoneName = '';
        for (const loc of SYSTEM_SETTINGS.customLocations) {
            if (loc.type === 'maintenance' && calculateDistance(lat, lng, loc.lat, loc.lng) <= (loc.radius || 500)) {
                inZone = true; zoneName = loc.name; break;
            }
        }

        if (inZone) {
            if (!lastState.zone) {
                updatePayload.zone = zoneName; updatePayload.entryTime = now; 
                updatePayload.hasLogged = false; updatePayload.logId = null;
                needsUpdate = true;
            } else {
                const duration = (now - (lastState.entryTime || now)) / 60000;
                if (duration >= minDuration && !lastState.hasLogged) {
                    const dup = await Maintenance.findOne({ deviceId, exitDate: null });
                    if(!dup) {
                        const log = await Maintenance.create({
                            truckName, deviceId, type: 'Plaquettes', location: zoneName,
                            odometer: parseInt(truck.params.io192||0)/1000,
                            date: new Date(lastState.entryTime || now), exitDate: null, 
                            note: 'Session Automatique', isAuto: true
                        });
                        updatePayload.hasLogged = true; updatePayload.logId = log._id.toString();
                    }
                    needsUpdate = true;
                }
            }
        } else if (lastState.zone) {
            if (lastState.logId) await closeMaintenanceSession(lastState.logId, truckName, now);
            updatePayload.zone = null; updatePayload.entryTime = null;
            updatePayload.hasLogged = false; updatePayload.logId = null;
            needsUpdate = true;
        }

        // --- C. PERSISTENCE ---
        const distMoved = calculateDistance(lat, lng, lastState.lat, lastState.lng);
        if (needsUpdate || distMoved > 50 || Math.abs(currentLiters - lastState.lastFuelLiters) > 2 || (now - lastState.lastUpdate) > 600000) {
            await Truck.findOneAndUpdate({ deviceId }, updatePayload, { upsert: true });
        }
    }
    setTimeout(runFleetBot, 120000); 
}

async function runDecouchageLogic(trucks) {
    const today = new Date().toISOString().split('T')[0];
    const site = SYSTEM_SETTINGS.customLocations.find(l => l.name.toLowerCase().includes('douroub'));
    if (!site) return;

    if (SYSTEM_SETTINGS.lastDecouchageCheck !== today) {
        console.log("🌙 Performing Midnight Découchage Scan...");
        for (const t of trucks) {
            if (!t.params) continue;
            const dist = calculateDistance(parseFloat(t.lat), parseFloat(t.lng), site.lat, site.lng);
            if (dist > (site.radius || 500)) {
                await Decouchage.create({
                    date: today, snapshotTime: new Date(), deviceId: String(t.id||t.imei),
                    truckName: t.name, locationAtMidnight: { lat: parseFloat(t.lat), lng: parseFloat(t.lng) },
                    distanceFromSite: Math.round(dist), status: 'Confirmé',
                    isClosed: false, lastUpdate: new Date()
                });
            }
        }
        SYSTEM_SETTINGS.lastDecouchageCheck = today;
        await Settings.findOneAndUpdate({ id: 'global' }, { lastDecouchageCheck: today });
    }

    const open = await Decouchage.find({ isClosed: false });
    for (const doc of open) {
        const t = trucks.find(tr => String(tr.id||tr.imei) === doc.deviceId);
        if (t && calculateDistance(parseFloat(t.lat), parseFloat(t.lng), site.lat, site.lng) <= (site.radius || 500)) {
            const hour = new Date().getHours();
            await Decouchage.findByIdAndUpdate(doc._id, { status: hour < 5 ? 'Non Confirmé' : 'Confirmé', entryTime: new Date(), isClosed: true });
        }
    }
}

async function closeMaintenanceSession(logId, truckName, exitTimeMs) {
    try {
        const doc = await Maintenance.findById(logId);
        if(doc && !doc.exitDate) {
            const dur = ((exitTimeMs - new Date(doc.date).getTime()) / 3600000).toFixed(1);
            await Maintenance.findByIdAndUpdate(logId, { exitDate: new Date(exitTimeMs), note: `Terminé (Durée: ${dur}h)` });
            console.log(`🏁 Closed Maintenance session for ${truckName}`);
        }
    } catch(e) { console.error("Close Session Error:", e.message); }
}

runFleetBot();

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

// --- 6. API ROUTES ---

// ✅ PUBLIC (Keeps Render Awake & Browser Happy)
app.get('/health', (req, res) => res.send('System Operational'));

// 🔐 SECURE SETUP ROUTE
// Usage: /api/admin/add-code/NEW_CODE?secret=YOUR_MASTER_PASSWORD
app.get('/api/admin/add-code/:code', async (req, res) => {
    const MASTER_SECRET = "Douroub_2025_Admin_Secure"; // <--- CHANGE THIS to something only you know!

    // 1. Check if the URL contains the secret password
    if (req.query.secret !== MASTER_SECRET) {
        return res.status(403).send("⛔ DÉGAGE ! Accès Interdit (Mauvais Secret).");
    }

    // 2. If secret is correct, add the code
    try {
        await AccessCode.create({ code: req.params.code, note: "Admin" });
        res.send(`✅ SUCCESS: Code ${req.params.code} added to Database!`);
    } catch(e) { 
        res.send("❌ Error: Code already exists or DB error."); 
    }
});

// 🔒 LOCKED ROUTES (Requires Code)
app.get('/api/trucks', checkAccess, async (req, res) => {
    try {
        const r = await fetch(GPS_API_URL);
        const j = await r.json();
        res.json(j);
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/settings', checkAccess, (req, res) => res.json(SYSTEM_SETTINGS));
app.post('/api/settings', checkAccess, async (req, res) => {
    SYSTEM_SETTINGS = { ...SYSTEM_SETTINGS, ...req.body };
    await saveSettings();
    res.json({success:true});
});

app.get('/api/maintenance', checkAccess, async (req, res) => {
    const data = await Maintenance.find().sort({date:-1}).limit(100);
    res.json(fmt(data));
});
app.post('/api/maintenance/add', checkAccess, async (req, res) => {
    await Maintenance.create(req.body); res.json({success:true});
});

app.post('/api/maintenance/update', checkAccess, async (req, res) => {
    try {
        const { id, type, note, odometer, isAuto } = req.body;
        const doc = await Maintenance.findById(id);
        if (!doc) return res.status(404).json({ error: "Introuvable" });

        doc.type = type || doc.type;
        doc.note = note || doc.note;
        doc.odometer = odometer || doc.odometer;
        if (isAuto !== undefined) {
            doc.isAuto = isAuto;
        }
        await doc.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/maintenance/delete', checkAccess, async (req, res) => {
    await Maintenance.findByIdAndDelete(req.body.id); res.json({success:true});
});

app.get('/api/refuels', checkAccess, async (req, res) => {
    const data = await Refuel.find().sort({timestamp:-1}).limit(100);
    res.json(fmt(data));
});

app.get('/api/decouchages', checkAccess, async (req, res) => {
    const data = await Decouchage.find().sort({date:-1}).limit(300);
    res.json(fmt(data));
});

app.get('/api/history', checkAccess, async (req, res) => {
    const { imei, start, end } = req.query;
    const url = `https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_MESSAGES,${imei},${start},${end}`;
    try {
        const r = await fetch(url);
        const t = await r.text();
        res.json(JSON.parse(t));
    } catch(e) { res.status(500).json({error:"Proxy Error"}); }
});

app.get('/api/backup/download', checkAccess, async (req, res) => {
    try {
        const dbData = {
            version: "2.1",
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

// --- 7. ADMIN TOOLS (Protected) ---
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
    await Truck.updateMany({}, { $set: { lastFuelLiters: 0 } });
    res.json({ success: true, message: "Burned migration data cleared." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Fleet Analytics Engine running on port ${PORT}`));