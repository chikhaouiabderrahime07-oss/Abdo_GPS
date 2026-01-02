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

// --- 1. CONFIGURATION (Hybrid: Env Var or Hardcoded Backup) ---
const PORT = process.env.PORT || 3000;
const GPS_API_URL = 'https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_LOCATIONS,*';

// ⚠️ DUAL-LAYER CONNECTION STRING (Safe for Render)
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
    refuelSession: Object // Stores temporary refill data
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

const DecouchageSchema = new mongoose.Schema({
    date: String, 
    snapshotTime: { type: Date, required: true, index: expireRule },
    deviceId: String, truckName: String,
    locationAtMidnight: { lat: Number, lng: Number }, 
    distanceFromSite: Number,
    status: String, entryTime: Date, lastUpdate: Date, isClosed: Boolean
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
    maintenanceRules: { minDurationMinutes: 60 },
    defaultConfig: { fuelTankCapacity: 600, fuelConsumption: 35 }, 
    fleetRules: [], 
    lastDecouchageCheck: null 
};

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
    const truckArray = Array.isArray(rawData) ? rawData : Object.entries(rawData).map(([id, val]) => ({ ...val, id }));

    // --- EXECUTE STRICT DECOUCHAGE LOGIC ---
    await runDecouchageLogic(truckArray);

    for (const truck of truckArray) {
        const deviceId = String(truck.id || truck.imei);
        // GPS SAFEGUARD: If location invalid, skip entirely
        if (!truck.params || truck.loc_valid === '0' || deviceId === "undefined") continue;

        const lat = parseFloat(truck.lat);
        const lng = parseFloat(truck.lng);
        const truckName = truck.name;
        const config = getTruckConfig(deviceId);
        const rawSensor = parseFloat(truck.params.io87) || 0; 
        const capacity = config.fuelTankCapacity || 600;
        const currentLiters = Math.round((rawSensor / 100) * capacity);
        const speed = parseInt(truck.speed) || 0;
        
        let dbTruck = await Truck.findOne({ deviceId });
        
        if (!dbTruck) {
            await Truck.findOneAndUpdate({ deviceId }, { 
                truckName, lastUpdate: now, lastFuelLiters: currentLiters, 
                lat, lng, params: truck.params 
            }, { upsert: true });
            continue;
        }

        let needsUpdate = false;
        let updatePayload = {
            truckName, lastUpdate: now,
            lat, lng, speed,
            params: truck.params,
            refuelSession: dbTruck.refuelSession || null 
        };

        // =========================================================
        // ⛽ FINAL "SMART" FUEL LOGIC (SPEED < 10 = STOPPED)
        // =========================================================
        
        // 1. DETERMINE IF TRUCK IS "STOPPED" (Covers Idling & GPS Drift)
        // We use 10 km/h to avoid false alarms from GPS jitter
        const isStopped = speed < 10; 

        // 2. IS A REFILL SESSION ALREADY ACTIVE?
        if (updatePayload.refuelSession && updatePayload.refuelSession.isActive) {
            const session = updatePayload.refuelSession;

            if (isStopped) {
                // --- CASE A: TRUCK IS STILL STOPPED (Refilling or Idling) ---
                // We keep the session open and just watch the fuel go up.
                // We update 'maxLiters' to the highest value seen during this stop.
                // This handles long refills (30min+) perfectly.
                if (currentLiters > session.maxLiters) {
                    session.maxLiters = currentLiters;
                }
                // Keep the session alive in DB
                updatePayload.refuelSession = session; 
                
            } else {
                // --- CASE B: TRUCK STARTED MOVING (Refill Finished!) ---
                console.log(`🏁 TRUCK MOVING (${speed} km/h): Finalizing Refill for ${truckName}...`);
                
                const finalLevel = session.maxLiters; // The highest level reached
                const startLevel = session.startLiters;
                const added = finalLevel - startLevel;

                // CRITICAL: Update the truck's baseline to the new full level
                // This ensures we don't detect the same fuel again later.
                updatePayload.lastFuelLiters = finalLevel;

                // FIREWALL: Only save if > 50 Liters (Filters out noise)
                if (added >= 40) {
                    console.log(`✅ VALID REFILL SAVED: +${added}L`);
                    
                    // Resolve Location Name
                    let locName = session.startLocName || "Unknown";
                    let isInternal = false;
                    if (SYSTEM_SETTINGS.customLocations) {
                        for (const loc of SYSTEM_SETTINGS.customLocations) {
                            if (calculateDistance(session.startLat, session.startLng, loc.lat, loc.lng) <= (loc.radius || 500)) {
                                locName = loc.name; isInternal = true; break;
                            }
                        }
                    }

                    await Refuel.create({
                        deviceId, truckName,
                        addedLiters: added,
                        oldLevel: startLevel,
                        newLevel: finalLevel,
                        timestamp: new Date(session.startTime),
                        locationRaw: locName,
                        lat: session.startLat, lng: session.startLng,
                        isInternal
                    });

                } else {
                    console.log(`❌ IGNORED: +${added}L (Below 40L Limit) - Baseline Updated.`);
                }

                // KILL THE SESSION (It's done)
                updatePayload.refuelSession = null;
                needsUpdate = true;
            }

        } else {
            // 3. NO ACTIVE SESSION - SHOULD WE START ONE?
            // Condition: Truck MUST be stopped (Speed < 10) AND Fuel must rise > 15L
            
            if (isStopped) {
                // Smart Baseline: If fuel dropped a little (sloshing), don't panic.
                // Only assume a refill if it goes UP from the last known stable level.
                let baseline = dbTruck.lastFuelLiters;
                
                // If current level is MUCH lower (consumption), update baseline down
                if (currentLiters < baseline) {
                    const drop = baseline - currentLiters;
                    // If drop is reasonable (consumption), update baseline
                    // If drop is HUGE (sensor error), keep old baseline
                    if (drop < 150) baseline = currentLiters; 
                }

                const diff = currentLiters - baseline;

                // START TRIGGER
                if (diff > 15) {
                    console.log(`⛽ REFILL DETECTED: ${truckName} (+${diff}L). Monitoring...`);
                    
                    updatePayload.refuelSession = {
                        isActive: true,
                        startTime: now,
                        startLiters: baseline,   // Lock the "Empty" level
                        maxLiters: currentLiters,// Initial "Full" level
                        startLat: lat, startLng: lng,
                        startLocName: `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
                    };
                    needsUpdate = true;
                } else {
                    // Just updating normal consumption while stopped/idling
                    updatePayload.lastFuelLiters = baseline;
                }
            } else {
                // Truck is moving, just track the fuel level as the new baseline
                updatePayload.lastFuelLiters = currentLiters;
            }
        }
        // =========================================================

        // --- MAINTENANCE & SAVE (Standard) ---
        const distMoved = calculateDistance(lat, lng, dbTruck.lat, dbTruck.lng);
        if (needsUpdate || distMoved > 50 || Math.abs(currentLiters - dbTruck.lastFuelLiters) > 2 || (now - dbTruck.lastUpdate) > 600000) {
            await Truck.findOneAndUpdate({ deviceId }, updatePayload, { upsert: true });
        }
    }
    
    setTimeout(runFleetBot, 120000); 
}

// 🌙 DECOUCHAGE LOGIC (STRICT DAILY RESET 00:00 - 06:00)
async function runDecouchageLogic(trucks) {
    const nowUTC = new Date(); 
    // Algeria Time (UTC+1)
    const dzTime = new Date(nowUTC.getTime() + (3600000)); 
    
    const dzHour = dzTime.getUTCHours();
    // Logic Date: e.g. "2023-10-25"
    const dzToday = dzTime.toISOString().split('T')[0]; 

    // 1. HARD RESET: CLOSE ALL ALERTS FROM YESTERDAY
    await Decouchage.updateMany(
        { date: { $ne: dzToday }, isClosed: false },
        { $set: { isClosed: true, status: 'Archivé' } }
    );

    const safeZones = SYSTEM_SETTINGS.customLocations.filter(l => l.type === 'douroub');
    if (safeZones.length === 0) return; 

    // 2. DETECTION WINDOW (00:00 to 06:00 ONLY)
    if (dzHour >= 0 && dzHour < 6) {
        
        for (const t of trucks) {
            if (!t.params || !t.lat || !t.lng) continue;
            const deviceId = String(t.id || t.imei);

            // Check if truck is in a safe zone RIGHT NOW
            let isInsideSafeZone = false;
            let closestDist = Infinity;
            for (const zone of safeZones) {
                const dist = calculateDistance(parseFloat(t.lat), parseFloat(t.lng), zone.lat, zone.lng);
                if (dist <= (zone.radius || 500)) { isInsideSafeZone = true; break; }
                if (dist < closestDist) closestDist = dist;
            }

            // Check if we already have an alert for TODAY
            const todaysAlert = await Decouchage.findOne({ date: dzToday, deviceId: deviceId });

            if (todaysAlert) {
                // ALERT EXISTS: CHECK IF RETURNED
                if (isInsideSafeZone && !todaysAlert.isClosed) {
                    console.log(`✅ Truck Returned to Base: ${t.name}`);
                    todaysAlert.isClosed = true;
                    todaysAlert.status = 'Confirmé (Rentré)'; 
                    todaysAlert.entryTime = nowUTC;
                    await todaysAlert.save();
                }
            } else {
                // NO ALERT YET: CREATE ONE IF OUTSIDE
                if (!isInsideSafeZone) {
                    console.log(`🌙 Decouchage Detected: ${t.name}`);
                    await Decouchage.create({
                        date: dzToday,
                        snapshotTime: nowUTC,
                        deviceId: deviceId,
                        truckName: t.name,
                        locationAtMidnight: { lat: parseFloat(t.lat), lng: parseFloat(t.lng) },
                        distanceFromSite: Math.round(closestDist),
                        status: 'Confirmé (Dehors)',
                        isClosed: false,
                        lastUpdate: nowUTC
                    });
                }
            }
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

// --- NEW MODEL: AUDIT REPORTS ---
const AuditSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    truckName: String,
    truckId: String,
    periodStart: String,
    periodEnd: String,
    stats: {
        uptime: String,
        downtime: String,
        sleep: String,
        score: String
    },
    incidents: Array, // Stores the cuts
    parkings: Array   // Stores the sleep logs
});
const AuditReport = mongoose.model('AuditReport', AuditSchema);

// --- NEW ROUTES: AUDIT HISTORY ---

// 1. SAVE REPORT
app.post('/api/audit/save', checkAccess, async (req, res) => {
    try {
        const report = new AuditReport(req.body);
        await report.save();
        res.json({ success: true, id: report._id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. LIST REPORTS
app.get('/api/audit/list', checkAccess, async (req, res) => {
    try {
        // Return light version (no heavy arrays) for the list
        const list = await AuditReport.find({}, 'date truckName periodStart periodEnd stats.score').sort({ date: -1 }).limit(50);
        res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. GET FULL REPORT
app.get('/api/audit/:id', checkAccess, async (req, res) => {
    try {
        const report = await AuditReport.findById(req.params.id);
        res.json(report);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. DELETE REPORT
app.delete('/api/audit/:id', checkAccess, async (req, res) => {
    try {
        await AuditReport.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// --- 6. API ROUTES ---

app.get('/health', (req, res) => res.send('System Operational'));

app.get('/api/admin/add-code/:code', async (req, res) => {
    const MASTER_SECRET = "Douroub_2025_Admin_Secure"; 
    if (req.query.secret !== MASTER_SECRET) {
        return res.status(403).send("⛔ DÉGAGE ! Accès Interdit (Mauvais Secret).");
    }
    try {
        await AccessCode.create({ code: req.params.code, note: "Admin" });
        res.send(`✅ SUCCESS: Code ${req.params.code} added!`);
    } catch(e) { 
        res.send("❌ Error: Duplicate or DB Error."); 
    }
});

// LOCKED ROUTES
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
        if (isAuto !== undefined) doc.isAuto = isAuto;
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

// --- REPLACE THE /api/history ROUTE IN server.js WITH THIS ---

app.get('/api/history', checkAccess, async (req, res) => {
    const { imei, start, end } = req.query;

    // 1. Clean Inputs: Encode spaces manually to prevent node-fetch crashes
    // If the browser sent %20, Express decodes it to ' '. We put %20 back.
    const safeStart = start.replace(' ', '%20');
    const safeEnd = end.replace(' ', '%20');

    // 2. Construct URL
    const url = `https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_MESSAGES,${imei},${safeStart},${safeEnd}`;

    console.log("------------------------------------------");
    console.log("📡 FETCHING HISTORY...");
    console.log("URL:", url); // <--- Check your terminal for this!

    try {
        // 3. Fetch with SSL Verification Disabled (Fixes "UNABLE_TO_VERIFY_LEAF_SIGNATURE")
        const https = require('https');
        const agent = new https.Agent({ rejectUnauthorized: false });
        
        const r = await fetch(url, { agent });
        const text = await r.text(); // Get raw text first
        
        console.log("📩 RESPONSE RAW:", text.substring(0, 100) + "..."); // Log first 100 chars

        // 4. Try to parse JSON safely
        try {
            const json = JSON.parse(text);
            res.json(json);
        } catch (parseError) {
            console.error("❌ JSON PARSE ERROR. API returned non-JSON.");
            // Send the raw text to the frontend so we can see the error
            res.status(502).json({ error: "Provider Error", details: text });
        }

    } catch(e) { 
        console.error("🔥 NETWORK/FETCH ERROR:", e.message);
        res.status(500).json({ error: "Server Error", details: e.message }); 
    }
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
    await Truck.updateMany({}, { $set: { lastFuelLiters: 0 } });
    res.json({ success: true, message: "Burned migration data cleared." });
});

// --- 8. INITIALIZATION (CONNECTION LOGIC) ---
if (DB_URI) {
    mongoose.connect(DB_URI)
        .then(() => {
            console.log("✅ MongoDB Connected! Starting App...");
            app.listen(PORT, () => console.log(`🚀 Fleet Analytics Engine running on port ${PORT}`));
            runFleetBot();
        })
        .catch(err => {
            console.error("❌ Mongo Connection Failed:", err);
        });
} else {
    console.error("❌ FATAL: Missing DB_URI");
    app.listen(PORT, () => console.log(`🚀 Server running (No DB Mode) on port ${PORT}`));
}