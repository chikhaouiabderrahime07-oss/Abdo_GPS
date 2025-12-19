const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// --- 1. FIREBASE CONNECTION ---
let serviceAccount;

if (process.env.FIREBASE_CREDENTIALS) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    } catch (e) { console.error("❌ Render Key Error:", e.message); }
} else if (fs.existsSync('./firebase-key.json')) {
    try {
        serviceAccount = require('./firebase-key.json');
    } catch(e) { console.error("❌ Local Key Error:", e.message); }
}

if (serviceAccount && admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Database Connected!");
}

const db = admin.firestore();

// --- 2. CONFIGURATION & STATE ---
let SYSTEM_SETTINGS = {
    customLocations: [],
    maintenanceRules: { minDurationMinutes: 60 },
    defaultConfig: { fuelTankCapacity: 600, fuelConsumption: 35 }, // Default fallback
    fleetRules: [], // Store specific truck rules here
    lastDecouchageCheck: null // Stores date string YYYY-MM-DD of last check
};

const GPS_API_URL = 'https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_LOCATIONS,*';

// --- 3. HELPER FUNCTIONS ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Helper to get truck specific config (Capacity, etc.)
function getTruckConfig(deviceId) {
    const globalDefault = SYSTEM_SETTINGS.defaultConfig || {};
    let specificConfig = {};

    if (SYSTEM_SETTINGS.fleetRules && Array.isArray(SYSTEM_SETTINGS.fleetRules)) {
        const matchedRule = SYSTEM_SETTINGS.fleetRules.find(rule => 
            rule.truckIds && rule.truckIds.includes(deviceId.toString())
        );
        if (matchedRule && matchedRule.config) {
            specificConfig = matchedRule.config;
        }
    }
    return { ...globalDefault, ...specificConfig };
}

async function loadSettings() {
    try {
        const doc = await db.collection('settings').doc('global').get();
        if (doc.exists) {
            const data = doc.data();
            if(data.customLocations) SYSTEM_SETTINGS.customLocations = data.customLocations;
            if(data.maintenanceRules) SYSTEM_SETTINGS.maintenanceRules = data.maintenanceRules;
            if(data.defaultConfig) SYSTEM_SETTINGS.defaultConfig = data.defaultConfig;
            if(data.fleetRules) SYSTEM_SETTINGS.fleetRules = data.fleetRules;
            if(data.lastDecouchageCheck) SYSTEM_SETTINGS.lastDecouchageCheck = data.lastDecouchageCheck;
        }
    } catch (e) { console.error("Settings Load Error:", e); }
}

async function saveSettings() {
    try {
        await db.collection('settings').doc('global').set(SYSTEM_SETTINGS, { merge: true });
    } catch (e) { console.error("Settings Save Error:", e); }
}

// --- 4. THE 24/7 ROBOT (STATE AWARE) ---
async function runFleetBot() {
    console.log("🤖 FleetBot: Checking status...");
    
    // 1. Get Live Data
    let rawData = {};
    try {
        const response = await fetch(GPS_API_URL);
        rawData = await response.json();
    } catch (e) {
        console.log("Bot fetch error:", e.message);
        return;
    }
    
    await loadSettings(); 
    
    const now = Date.now();
    const minDuration = SYSTEM_SETTINGS.maintenanceRules.minDurationMinutes || 60;

    // 2. Load Active States (Fuel & Maintenance)
    const statesSnapshot = await db.collection('truck_states').get();
    const activeStates = {}; 
    statesSnapshot.forEach(doc => { activeStates[doc.id] = doc.data(); });

    // --- DECOUCHAGE LOGIC START ---
    await runDecouchageLogic(rawData);
    // --- DECOUCHAGE LOGIC END ---

    // 3. Process Each Truck
    for (const [deviceId, truck] of Object.entries(rawData)) {
        if (!truck.params || truck.loc_valid === '0') continue;

        const lat = parseFloat(truck.lat);
        const lng = parseFloat(truck.lng);
        const truckName = truck.name;

        // --- A. GET CONFIG & CALCULATE FUEL ---
        const config = getTruckConfig(deviceId);
        const rawSensor = parseFloat(truck.params.io87) || 0; 
        const capacity = config.fuelTankCapacity || 600;
        const currentLiters = Math.round((rawSensor / 100) * capacity);
        
        // --- B. REFUEL DETECTION LOGIC ---
        const lastState = activeStates[deviceId];
        
        if (lastState && lastState.lastFuelLiters !== undefined) {
            const diff = currentLiters - lastState.lastFuelLiters;
            
            // THRESHOLD: If fuel increased by > 55 Liters
            if (diff >= 55) {
                console.log(`⛽ REFUEL DETECTED: ${truckName} (+${diff}L)`);
                
                let locName = `Position GPS: ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
                let isInternal = false;
                
                for (const loc of SYSTEM_SETTINGS.customLocations) {
                    const dist = calculateDistance(lat, lng, loc.lat, loc.lng);
                    if (dist <= (loc.radius || 500)) {
                        locName = loc.name;
                        isInternal = true;
                        break;
                    }
                }

                await db.collection('refuels').add({
                    deviceId,
                    truckName,
                    addedLiters: diff,
                    oldLevel: lastState.lastFuelLiters,
                    newLevel: currentLiters,
                    timestamp: new Date().toISOString(),
                    locationRaw: locName,
                    isInternal: isInternal,
                    lat, lng
                });
            }
        }

        // --- C. MAINTENANCE LOGIC ---
        let inZone = false;
        let zoneName = '';

        for (const loc of SYSTEM_SETTINGS.customLocations) {
            if (loc.type !== 'maintenance') continue; 
            const dist = calculateDistance(lat, lng, loc.lat, loc.lng);
            if (dist <= (loc.radius || 500)) {
                inZone = true;
                zoneName = loc.name;
                break;
            }
        }

        let newState = {
            truckName,
            lastUpdate: now,
            lastFuelLiters: currentLiters, 
            lastFuelPercent: rawSensor
        };

        if (inZone) {
            if (!lastState || !lastState.zone) {
                newState.zone = zoneName;
                newState.entryTime = now;
                newState.hasLogged = false;
                newState.logId = null;
            } else {
                newState.zone = lastState.zone;
                newState.entryTime = lastState.entryTime;
                newState.hasLogged = lastState.hasLogged;
                newState.logId = lastState.logId;

                const durationMins = (now - newState.entryTime) / 60000;
                if (durationMins >= minDuration && !newState.hasLogged) {
                     const logRef = await db.collection('maintenance').add({
                        truckName, deviceId, type: 'Plaquettes', 
                        location: zoneName, odometer: parseInt(truck.params.io192 || 0) / 1000, 
                        date: new Date(newState.entryTime).toISOString(), 
                        exitDate: null, note: 'Auto-detected (En cours...)', isAuto: true 
                    });
                    newState.hasLogged = true;
                    newState.logId = logRef.id;
                }
            }
        } else {
            if (lastState && lastState.zone && lastState.logId) {
                await closeMaintenanceSession(lastState, now);
            }
        }

        await db.collection('truck_states').doc(deviceId).set(newState, { merge: true });
    }
}

// --- NEW FEATURE: DECOUCHAGE LOGIC ---
async function runDecouchageLogic(rawData) {
    const todayStr = new Date().toISOString().split('T')[0];
    const douroubSite = SYSTEM_SETTINGS.customLocations.find(l => l.type === 'douroub' || l.name.toLowerCase().includes('douroub'));
    
    if (!douroubSite) {
        console.log("⚠️ Découchage: 'Site Douroub' not defined in Custom Locations.");
        return; 
    }

    // 1. MIDNIGHT SNAPSHOT (Run once per day)
    if (SYSTEM_SETTINGS.lastDecouchageCheck !== todayStr) {
        console.log(`🌙 Running Midnight Découchage Snapshot for ${todayStr}...`);
        
        const batch = db.batch();
        let count = 0;

        for (const [deviceId, truck] of Object.entries(rawData)) {
            // Check if truck is live
            if (!truck.params) continue; 
            
            const lat = parseFloat(truck.lat);
            const lng = parseFloat(truck.lng);
            const dist = calculateDistance(lat, lng, douroubSite.lat, douroubSite.lng);
            const radius = douroubSite.radius || 500;

            // If OUTSIDE site at snapshot time
            if (dist > radius) {
                const ref = db.collection('decouchages').doc();
                batch.set(ref, {
                    date: todayStr, // Index for the day
                    deviceId: deviceId,
                    truckName: truck.name,
                    locationAtMidnight: { lat, lng },
                    distanceFromSite: Math.round(dist),
                    status: 'Confirmé', // Default to Confirmé, changes if they return early
                    entryTime: null, // No return yet
                    lastUpdate: new Date().toISOString(),
                    isClosed: false
                });
                count++;
            }
        }
        
        if (count > 0) await batch.commit();
        
        // Update settings so we don't run again today
        SYSTEM_SETTINGS.lastDecouchageCheck = todayStr;
        await saveSettings();
        console.log(`✅ Snapshot Done: ${count} trucks outside.`);
    }

    // 2. RETURN MONITOR (Check active decouchages)
    // Find records where isClosed is false
    const openSnaps = await db.collection('decouchages').where('isClosed', '==', false).get();
    
    if (openSnaps.empty) return;

    const batchUpdate = db.batch();
    let updatesCount = 0;

    openSnaps.docs.forEach(doc => {
        const data = doc.data();
        const truck = rawData[data.deviceId];

        if (truck && truck.params) {
            const lat = parseFloat(truck.lat);
            const lng = parseFloat(truck.lng);
            const dist = calculateDistance(lat, lng, douroubSite.lat, douroubSite.lng);
            const radius = douroubSite.radius || 500;

            // IF TRUCK ENTERS SITE DOUROUB
            if (dist <= radius) {
                const now = new Date();
                const currentHour = now.getHours(); // 0 to 23
                
                // Logic: 
                // Before 05:00 (0, 1, 2, 3, 4) -> Non Confirmé
                // 05:00 or later -> Confirmé (Remains Confirmed)
                
                let finalStatus = 'Confirmé';
                if (currentHour < 5) {
                    finalStatus = 'Non Confirmé';
                }

                batchUpdate.update(doc.ref, {
                    status: finalStatus,
                    entryTime: now.toISOString(),
                    isClosed: true, // Mark as processed so we stop checking
                    lastUpdate: now.toISOString()
                });
                updatesCount++;
                console.log(`🚚 Truck ${data.truckName} returned. Status: ${finalStatus}`);
            }
        }
    });

    if (updatesCount > 0) await batchUpdate.commit();
}

async function closeMaintenanceSession(state, exitTimeMs) {
    if (!state.logId) return;
    try {
        const exitDate = new Date(exitTimeMs).toISOString();
        const durationHours = ((exitTimeMs - state.entryTime) / (1000 * 60 * 60)).toFixed(1);
        
        await db.collection('maintenance').doc(state.logId).update({
            exitDate: exitDate,
            note: `Terminé (Durée: ${durationHours}h)`
        });
        console.log(`🏁 Closed session for ${state.truckName}`);
    } catch(e) {
        console.error("Error closing session:", e);
    }
}

// Run every 2 minutes
setInterval(runFleetBot, 120000); 

// --- 5. EXISTING API ROUTES ---

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/api/trucks', async (req, res) => {
    try {
        const response = await fetch(GPS_API_URL);
        const json = await response.json();
        res.json(json);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/settings', async (req, res) => {
    try {
        const doc = await db.collection('settings').doc('global').get();
        res.json(doc.exists ? doc.data() : {});
    } catch(e) { res.status(500).json({}); }
});

app.post('/api/settings', async (req, res) => {
    try {
        await db.collection('settings').doc('global').set(req.body, { merge: true });
        await loadSettings();
        res.json({ success: true });
    } catch(e) { res.status(500).json({}); }
});

app.get('/api/maintenance', async (req, res) => {
    try {
        const snap = await db.collection('maintenance').orderBy('date', 'desc').limit(100).get();
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch(e) { res.status(500).json([]); }
});

app.post('/api/maintenance/add', async (req, res) => {
    try {
        await db.collection('maintenance').add(req.body);
        res.json({ success: true });
    } catch(e) { res.status(500).json({}); }
});

app.post('/api/maintenance/update', async (req, res) => {
    try {
        const { id, ...data } = req.body;
        await db.collection('maintenance').doc(id).update(data);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/maintenance/delete', async (req, res) => {
    try {
        await db.collection('maintenance').doc(req.body.id).delete();
        res.json({ success: true });
    } catch(e) { res.status(500).json({}); }
});

app.get('/api/refuels', async (req, res) => {
    try {
        const snap = await db.collection('refuels').orderBy('timestamp', 'desc').limit(100).get();
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch(e) { res.status(500).json([]); }
});

// --- NEW ENDPOINT: DECOUCHAGES ---
app.get('/api/decouchages', async (req, res) => {
    try {
        // Simple fetch, filtering done on frontend to save read costs/complexity
        // Limit to last 300 to keep it light
        const snap = await db.collection('decouchages').orderBy('date', 'desc').limit(300).get();
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch(e) { res.status(500).json([]); }
});

app.get('/api/backup/download', async (req, res) => {
    try {
        const collections = ['settings', 'refuels', 'maintenance', 'truck_states', 'decouchages']; 
        const dbData = {};
        for (const name of collections) {
            const snap = await db.collection(name).get();
            dbData[name] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
        }
        res.json(dbData);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/backup/restore', async (req, res) => {
    try {
        const batch = db.batch();
        for (const [col, items] of Object.entries(req.body)) {
            if (!Array.isArray(items)) continue;
            items.forEach(item => {
                const { _id, ...data } = item;
                const ref = _id ? db.collection(col).doc(_id) : db.collection(col).doc();
                batch.set(ref, data, { merge: true });
            });
        }
        await batch.commit();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));