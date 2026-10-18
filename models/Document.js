const mongoose = require('mongoose');

// Generic document schema for collections like brs, bls, suppliers, clients, etc.
const docSchema = new mongoose.Schema({
  col:      { type: String, required: true, index: true },  // collection name
  data:     { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt:{ type: Date, default: Date.now },
  updatedAt:{ type: Date, default: Date.now },
}, { timestamps: false });

docSchema.index({ col: 1, 'data.id': 1 });
// Newest-first / "tail" reads (logs, ?limit=) use this index instead of an in-memory sort
docSchema.index({ col: 1, createdAt: -1 });

module.exports = mongoose.model('Document', docSchema);
