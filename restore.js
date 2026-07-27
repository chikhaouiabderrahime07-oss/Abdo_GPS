const fs = require('fs');
let s = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', 'utf8');

const anchor = "console.error('❌ /api/maintenance/add error:', e.message);";
const newCode = `
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
      if (prevType !== 'Vidange' && (doc.type === 'Vidange' || doc.type === 'Vidange Complète') && doc.deviceId && doc.odometer) {
        await acknowledgeVidange(doc.deviceId, doc.truckName, parseInt(doc.odometer, 10));
      }
    } catch (e) {
      console.warn('Vidange acknowledge (update) failed:', e.message);
    }

    res.json({ success: true });
`;

if (s.includes(anchor)) {
    const idx = s.indexOf(anchor) + anchor.length;
    if (!s.includes("app.post('/api/maintenance/update'")) {
        s = s.substring(0, idx) + newCode + s.substring(idx);
        fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', s);
        console.log('Restored missing routes');
    } else {
        console.log('Already restored');
    }
}
