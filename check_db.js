const mongoose = require('mongoose');

const ZE = mongoose.model('ZoneEvent', new mongoose.Schema({
  deviceId:String, truckName:String, zoneName:String,
  entryTime:Number, exitTime:Number, source:String, createdAt:Date
}));

mongoose.connect(process.env.MONGO_URI).then(async () => {
  // Events created in the last 30 minutes
  const recentMs = Date.now() - 30*60000;
  const recent = await ZE.find({ createdAt: { $gte: new Date(recentMs) } }).sort({ createdAt: -1 }).lean();
  console.log('Events created in last 30 min:', recent.length);
  recent.slice(0, 15).forEach(e => {
    console.log('  ' + (e.truckName||'?').padEnd(12) + ' | ' + (e.zoneName||'?').padEnd(22) + ' | created:' + new Date(e.createdAt).toISOString().slice(11,19) + ' | src:' + (e.source||'?') + ' | exit:' + (e.exitTime ? 'YES' : 'null'));
  });

  // T019 specifically
  const t019 = await ZE.find({ truckName: 'T019' }).sort({ entryTime: -1 }).limit(4).lean();
  console.log('\nT019 recent events:');
  t019.forEach(e => {
    const ageDays = Math.round((Date.now() - e.entryTime) / 86400000);
    console.log('  entry:' + new Date(e.entryTime).toISOString().slice(0,16) + ' | exit:' + (e.exitTime ? new Date(e.exitTime).toISOString().slice(0,16) : 'OPEN') + ' | ' + ageDays + 'd ago | src:' + e.source);
  });

  // How many open events are there NOW (after corrective)?
  const openNow = await ZE.countDocuments({ exitTime: null });
  console.log('\nOpen events now:', openNow);

  mongoose.disconnect();
}).catch(e => { console.error('ERR', e.message); process.exit(1); });
