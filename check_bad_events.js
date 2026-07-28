const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://MrNoBoDy:123Chikh1994@cluster0.cljee0n.mongodb.net/fleet_db').then(async () => {
  const ZoneEvent = mongoose.model('ZoneEvent', new mongoose.Schema({}, { strict: false, collection: 'zoneevents' }));
  const badEvents = await ZoneEvent.find({ durationMinutes: { $gt: 600 }, status: 'terminé' }, 'truckName zoneName entryTime exitTime durationMinutes').sort({ durationMinutes: -1 }).lean();
  console.log('Found', badEvents.length, 'events > 10 hours');
  console.log(badEvents.slice(0, 10));
  process.exit(0);
});
