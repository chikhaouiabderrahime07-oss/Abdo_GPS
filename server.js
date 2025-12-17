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

// --- 1. CONNEXION FIREBASE (Variable d'abord, Fichier ensuite) ---
let serviceAccount;

// Option A: Render (Variable)
if (process.env.FIREBASE_CREDENTIALS) {
    try {
        console.log("☁️ Lecture de la clé depuis Render...");
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    } catch (e) {
        console.error("❌ Erreur lecture clé:", e.message);
    }
}

// Option B: Local (Fichier)
if (!serviceAccount && fs.existsSync('./firebase-key.json')) {
    try {
        console.log("💻 Lecture du fichier local...");
        serviceAccount = require('./firebase-key.json');
    } catch(e) {
        console.error("❌ Erreur fichier:", e.message);
    }
}

if (serviceAccount) {
    try {
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("✅ SUCCÈS: Base de Données Connectée !");
        }
    } catch(e) {
        console.error("❌ Erreur connexion Firebase:", e.message);
    }
} else {
    console.error("⚠️ ATTENTION: Aucune clé trouvée. L'API ne marchera pas.");
}

const db = admin.firestore();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const GPS_API_URL = 'https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_LOCATIONS,*';

// --- ROUTES ---

// 0. SILENCE FAVICON ERROR
app.get('/favicon.ico', (req, res) => res.status(204).end());

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

// 3. MAINTENANCE
app.get('/api/maintenance', async (req, res) => {
    try {
        const snap = await db.collection('maintenance').orderBy('date', 'desc').limit(100).get();
        res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/maintenance/add', async (req, res) => {
    try {
        const entry = { ...req.body, serverTime: new Date().toISOString() };
        const ref = await db.collection('maintenance').add(entry);
        res.json({ success: true, id: ref.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. SETTINGS
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

// 5. BACKUP & RESTORE (The Missing Part)
app.get('/api/backup/download', async (req, res) => {
    try {
        const collections = ['settings', 'refuels', 'maintenance', 'truck_states'];
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

app.listen(PORT, () => {
    console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});