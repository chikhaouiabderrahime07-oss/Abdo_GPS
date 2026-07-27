const fs = require('fs');
let s = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', 'utf8');

const startIdx = s.indexOf("app.post('/api/maintenance/delete'");
const endMarker = "    res.json({ success: true });";
const endIdx = s.indexOf(endMarker, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const newBlock = `app.post('/api/maintenance/delete', checkAccess, async (req, res) => {
  try {
    const doc = await Maintenance.findById(req.body.id);
    if (doc) {
      if (doc.type === 'Vidange' || doc.type === 'Vidange Complète') {
        if (SYSTEM_SETTINGS.vidangeOverrides && SYSTEM_SETTINGS.vidangeOverrides[doc.deviceId]) {
          delete SYSTEM_SETTINGS.vidangeOverrides[doc.deviceId];
          const mongoose = require('mongoose');
          await mongoose.models.Settings.findOneAndUpdate({}, { vidangeOverrides: SYSTEM_SETTINGS.vidangeOverrides }, { upsert: true });
        }
      }
      await Maintenance.findByIdAndDelete(req.body.id);
    }
    DB_STATS.lastWriteAt = new Date().toISOString();
    DB_STATS.totalWrites++;
`;
    s = s.substring(0, startIdx) + newBlock + s.substring(endIdx);
    fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', s);
    console.log('Successfully updated delete route using index matching');
} else {
    console.log('Could not find markers');
}
