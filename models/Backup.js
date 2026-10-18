const mongoose = require('mongoose');

// A backup is now stored as ONE gzip-compressed JSON blob (`blob`).
// Why: the old format kept the whole database as a single uncompressed
// document, which (a) hits MongoDB's 16 MB document limit as soon as the data
// grows, and (b) multiplied the stored size by the number of kept backups,
// quickly filling the free 512 MB Atlas tier.
// Legacy backups (uncompressed `data`) remain readable and restorable.
const backupSchema = new mongoose.Schema({
  label:      { type: String, required: true },
  type:       { type: String, enum: ['auto', 'manual'], default: 'auto' },
  createdBy:  { type: String, default: 'system' },
  format:     { type: String, default: 'legacy' },        // 'gzip-v2' | 'legacy'
  blob:       { type: Buffer },                           // gzip(JSON) for format 'gzip-v2'
  data:       { type: mongoose.Schema.Types.Mixed },      // legacy snapshot (older backups only)
  sizeBytes:  { type: Number, default: 0 },               // compressed size
  rawBytes:   { type: Number, default: 0 },               // uncompressed JSON size
  docCount:   { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now, index: true },
  expiresAt:  { type: Date },
});

// Safety net: MongoDB removes backups automatically after expiresAt.
backupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Backup', backupSchema);
