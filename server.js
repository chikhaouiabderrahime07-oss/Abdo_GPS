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

// --- 1. CRITICAL: FIREBASE CONNECTION ---
const KEY_FILE = './firebase-key.json';

try {
    if (!fs.existsSync(KEY_FILE)) {
        throw new Error(`❌ FICHIER MANQUANT: ${KEY_FILE} est introuvable ! Placez-le dans le même dossier.`);
    }

    console.log("📂 Chargement de la clé Firebase depuis le fichier...");
    const serviceAccount = require(KEY_FILE);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    console.log("✅ SUCCÈS: Firebase est connecté et prêt !");

} catch (e) {
    console.error("\n/!\\ ERREUR FATALE FIREBASE /!\\");
    console.error(e.message);
    console.error("Le serveur ne peut pas démarrer sans la clé valide.\n");
    process.exit(1); // Stop the server if auth fails
}

const db = admin.firestore();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const GPS_API_URL = 'https://alg.webgps.dz/api/api.php?api=user&ver=1.0&key=5145BB5EC45361FAF9E61DE3CAED29DF&cmd=OBJECT_GET_LOCATIONS,*';

// --- ROUTES ---

app.get('/api/trucks', async (req, res) => {
    try {
        const response = await fetch(GPS_API_URL);
        const json = await response.json();
        res.json(json);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ROBUST Refuels Route
app.get('/api/refuels', async (req, res) => {
    try {
        const snap = await db.collection('refuels').orderBy('timestamp', 'desc').limit(100).get();
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (e) {
        console.error("❌ Erreur API Refuels:", e.message);
        res.status(500).json({ error: "Erreur Base de Données: " + e.message });
    }
});

// ROBUST Maintenance Route
app.get('/api/maintenance', async (req, res) => {
    try {
        const snap = await db.collection('maintenance').orderBy('date', 'desc').limit(100).get();
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (e) {
        console.error("❌ Erreur API Maintenance:", e.message);
        res.status(500).json({ error: "Erreur Base de Données: " + e.message });
    }
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

// BACKUP & RESTORE
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
        // Simplified restore logic for stability
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

// START SERVER
app.listen(PORT, () => {
    console.log(`\n🚀 SERVEUR LANCÉ: http://localhost:${PORT}`);
    console.log(`👉 Vérifiez que "✅ SUCCÈS" est affiché ci-dessus.\n`);
});