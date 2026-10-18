const cron = require('node-cron');
const { createBackup, maybeDailyBackup, maybeIntradayBackup } = require('../routes/backup');
const Backup = require('../models/Backup');

/**
 * Ultra-High-Frequency 2-Minute Continuous Backup + Nightly 23:59 Master Consolidation.
 *
 * - Every 2 minutes: automatically snapshots active database state (intraday points).
 * - At 23:59: archives the consolidated Master Daily Backup and purges all intermediate 2-min snapshots.
 * - On boot/wake: catches up if needed.
 */
function startBackupCron() {
  // 1. Nightly Master Backup at 23:59 Algeria time (22:59 UTC)
  cron.schedule('59 22 * * *', async () => {
    try {
      const label = `Clôture Quotidienne (Auto) — ${new Date().toLocaleString('fr-DZ', { timeZone: 'Africa/Algiers' })}`;
      const backup = await createBackup(label, 'auto', 'system');
      // Purge all intermediate 2-minute snapshots from the day
      const purged = await Backup.deleteMany({ type: 'intraday' });
      console.log(`✅ [CRON] Sauvegarde quotidienne de clôture archivée: ${backup.label} (${purged.deletedCount} points intraday nettoyés)`);
    } catch (e) {
      console.error('❌ [CRON] Erreur clôture quotidienne:', e.message);
    }
  }, { timezone: 'UTC' });

  // 2. Ultra-High-Frequency 2-Minute Intraday Continuous Snapshot
  setInterval(() => {
    if (maybeIntradayBackup) {
      maybeIntradayBackup().catch(e => console.warn('⚠️ [BACKUP/2min]', e.message));
    }
  }, 2 * 60 * 1000); // exactly 2 minutes!

  // 3. Catch-up check on boot & hourly while awake
  const catchUp = () => maybeDailyBackup().catch(e => console.error('❌ [BACKUP/catch-up]', e.message));
  setTimeout(catchUp, 60 * 1000);          // 1 min after boot / wake-up
  setInterval(catchUp, 60 * 60 * 1000);    // hourly while awake

  console.log('⏰ [CRON] Sauvegardes continues 2-MINUTES activées + Clôture journalière 23:59 avec purge automatique');
}

module.exports = { startBackupCron, maybeDailyBackup, maybeIntradayBackup };
