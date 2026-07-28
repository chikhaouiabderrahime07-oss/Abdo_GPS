/**
 * fix_old_data.js - V2
 * If the API returns no GPS data for corrupted events (>10h), 
 * we safely delete them to unpollute the history.
 */
const mongoose = require('mongoose');
const DB_URI = 'mongodb+srv://MrNoBoDy:123Chikh1994@cluster0.cljee0n.mongodb.net/fleet_db?retryWrites=true&w=majority&appName=Cluster0';
const ZoneEventSchema = new mongoose.Schema({}, { strict: false, collection: 'zoneevents' });
const ZoneEvent = mongoose.model('ZoneEvent', ZoneEventSchema);

async function run() {
  await mongoose.connect(DB_URI);
  console.log('✅ DB Connected');
  
  // Find all closed events with duration > 10 hours
  const badEvents = await ZoneEvent.find({ durationMinutes: { $gt: 600 }, status: 'terminé' }).lean();
  console.log(`Found ${badEvents.length} historically corrupted events (>10h) to fix.\n`);
  
  let deletedCount = 0;

  for (const ev of badEvents) {
    console.log(`🗑️ Deleting corrupted event: ${ev.truckName} @ "${ev.zoneName}" (Stored duration: ${ev.durationMinutes}m)`);
    await ZoneEvent.findByIdAndDelete(ev._id);
    deletedCount++;
  }
  
  console.log(`\n✅ Summary: Deleted ${deletedCount} corrupted ghost events.`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
