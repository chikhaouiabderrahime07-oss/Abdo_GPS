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
    fleetRules: [] // Store specific truck rules here
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
        }
    } catch (e) { console.error("Settings Load Error:", e); }
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

    // 3. Process Each Truck
    for (const [deviceId, truck] of Object.entries(rawData)) {
        if (!truck.params || truck.loc_valid === '0') continue;

        const lat = parseFloat(truck.lat);
        const lng = parseFloat(truck.lng);
        const truckName = truck.name;

        // --- A. GET CONFIG & CALCULATE FUEL ---
        const config = getTruckConfig(deviceId);
        // Simple calculation (assuming percentage is sent in io87)
        // If you use calibration, we'd need that logic here, but for now linear is safer for the bot
        const rawSensor = parseFloat(truck.params.io87) || 0; 
        const capacity = config.fuelTankCapacity || 600;
        
        // Calculate Liters based on percentage (io87 is usually %)
        const currentLiters = Math.round((rawSensor / 100) * capacity);
        
        // --- B. REFUEL DETECTION LOGIC ---
        const lastState = activeStates[deviceId];
        
        if (lastState && lastState.lastFuelLiters !== undefined) {
            const diff = currentLiters - lastState.lastFuelLiters;
            
            // THRESHOLD: If fuel increased by > 20 Liters (adjust as needed)
            if (diff >= 20) {
                console.log(`⛽ REFUEL DETECTED: ${truckName} (+${diff}L)`);
                
                // Determine Location Name
                let locName = `Position GPS: ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
                let isInternal = false;
                
                // Check if in known custom location
                for (const loc of SYSTEM_SETTINGS.customLocations) {
                    const dist = calculateDistance(lat, lng, loc.lat, loc.lng);
                    if (dist <= (loc.radius || 500)) {
                        locName = loc.name;
                        isInternal = true;
                        break;
                    }
                }

                // Log to 'refuels' collection
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

        // --- C. MAINTENANCE LOGIC (Existing) ---
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
            lastFuelLiters: currentLiters, // Save for next comparison
            lastFuelPercent: rawSensor
        };

        // Persist Maintenance State
        if (inZone) {
            if (!lastState || !lastState.zone) {
                // New Entry
                newState.zone = zoneName;
                newState.entryTime = now;
                newState.hasLogged = false;
                newState.logId = null;
            } else {
                // Maintain existing state info
                newState.zone = lastState.zone;
                newState.entryTime = lastState.entryTime;
                newState.hasLogged = lastState.hasLogged;
                newState.logId = lastState.logId;

                // Duration Check
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
            // Left Zone
            if (lastState && lastState.zone && lastState.logId) {
                await closeMaintenanceSession(lastState, now);
            }
        }

        // SAVE STATE (For next run)
        await db.collection('truck_states').doc(deviceId).set(newState, { merge: true });
    }
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

// HEALTH CHECK for UptimeRobot
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

app.get('/api/backup/download', async (req, res) => {
    try {
        const collections = ['settings', 'refuels', 'maintenance', 'truck_states', 'tms_clients', 'tms_missions']; 
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

// --- TMS DISPATCH ROUTES ---
app.get('/api/tms/init', async (req, res) => {
    try {
        const clientsSnap = await db.collection('tms_clients').get();
        const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const missionsSnap = await db.collection('tms_missions').where('status', '!=', 'archived').get();
        const missions = missionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json({ clients, missions });
    } catch(e) { res.status(500).json({ clients: [], missions: [], error: e.message }); }
});

app.post('/api/tms/clients/save', async (req, res) => {
    try {
        const client = req.body;
        if (!client.id) throw new Error("Missing Client ID");
        await db.collection('tms_clients').doc(client.id).set(client, { merge: true });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tms/missions/save', async (req, res) => {
    try {
        const mission = req.body;
        const missionId = mission.truckId || `m_${Date.now()}`;
        await db.collection('tms_missions').doc(missionId).set(mission, { merge: true });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tms/missions/archive', async (req, res) => {
    try {
        const { truckId, mission } = req.body;
        await db.collection('tms_history').add({
            ...mission,
            archivedAt: new Date().toISOString()
        });
        await db.collection('tms_missions').doc(truckId).delete();
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));