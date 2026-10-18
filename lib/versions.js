/**
 * In-memory change-version registry.
 *
 * Every write route calls bump(col). Clients poll GET /api/data/_versions
 * (a tiny, DB-free response) and only re-download the collections whose
 * version changed. This replaces "download 15+ collections every 2 minutes"
 * which was the main source of bandwidth, DB load and lag on free tiers.
 *
 * NOTE: valid for a SINGLE server instance (Render free tier = 1 instance).
 * On restart `epoch` changes, so every client re-syncs once — always safe.
 */
const epoch = Date.now();
let seq = 0;
const versions = Object.create(null);

function bump(col) {
  if (!col) return;
  versions[col] = `${epoch}.${++seq}`;
}

function bumpAll() {
  for (const col of Object.keys(versions)) bump(col);
  // Also invalidate collections never written since boot: change the global stamp.
  globalStamp = `${epoch}.${++seq}`;
}

let globalStamp = `${epoch}.0`;

function snapshot() {
  return { epoch, global: globalStamp, v: { ...versions } };
}

module.exports = { bump, bumpAll, snapshot };
