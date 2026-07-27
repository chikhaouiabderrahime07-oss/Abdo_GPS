const fs = require('fs');
let s = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', 'utf8');

const oldDeleteStr = `app.post('/api/maintenance/delete', checkAccess, async (req, res) => {
  try {
    await Maintenance.findByIdAndDelete(req.body.id);
    DB_STATS.lastWriteAt = new Date().toISOString();
    DB_STATS.totalWrites++;
    res.json({ success: true });
  } catch (e) {`;

const newDeleteStr = `app.post('/api/maintenance/delete', checkAccess, async (req, res) => {
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
    res.json({ success: true });
  } catch (e) {`;

if (s.includes(oldDeleteStr)) {
    s = s.replace(oldDeleteStr, newDeleteStr);
    fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', s);
    console.log('Fixed delete route successfully');
} else {
    console.log('Could not find old delete route');
}
