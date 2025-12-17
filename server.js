const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
require('dotenv').config(); 

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(__dirname)); 

// --- 1. CONNEXION FIREBASE (VIA VARIABLE RENDER) ---
let serviceAccount;

if (process.env.FIREBASE_CREDENTIALS) {
    try {
        console.log("☁️ Lecture de la clé depuis Render...");
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    } catch (e) {
        console.error("❌ Erreur lecture clé:", e.message);
    }
} else {
    console.error("❌ PAS DE CLÉ TROUVÉE ! Ajoutez la variable FIREBASE_CREDENTIALS sur Render.");
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ SUCCÈS: Nouvelle Base de Données Connectée !");
    } catch(e) {
        console.error("❌ Erreur connexion Firebase:", e.message);
    }
}

const db = admin.firestore();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const GPS_API_URL = 'https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_LOCATIONS,*';

// --- ROUTES ---

// 1. TRUCKS
app.get('/api/trucks', async (req, res) => {
    try {
        const response = await fetch(GPS_API_URL);
        const json = await response.json();
        res.json(json);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. REFUELS
app.get('/api/refuels', async (req, res) => {
    try {
        const snap = await db.collection('refuels').orderBy('timestamp', 'desc').limit(100).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. MAINTENANCE (GET)
app.get('/api/maintenance', async (req, res) => {
    try {
        const snap = await db.collection('maintenance').orderBy('date', 'desc').limit(100).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. MAINTENANCE (ADD) - THIS WAS GIVING 404 BEFORE
app.post('/api/maintenance/add', async (req, res) => {
    try {
        const entry = { ...req.body, serverTime: new Date().toISOString() };
        const ref = await db.collection('maintenance').add(entry);
        res.json({ success: true, id: ref.id });
    } catch (e) { 
        console.error("Add Maint Error:", e);
        res.status(500).json({ error: e.message }); 
    }
});

// 5. MAINTENANCE (UPDATE/DELETE)
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
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. SETTINGS
app.get('/api/settings', async (req, res) => {
    try {
        const doc = await db.collection('settings').doc('global').get();
        res.json(doc.exists ? doc.data() : {});
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', async (req, res) => {
    try {
        await db.collection('settings').doc('global').set(req.body, { merge: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
    console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});