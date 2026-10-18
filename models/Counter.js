const mongoose = require('mongoose');

// A simple atomic counter per collection/year
// Used to safely generate unique sequential IDs even with concurrent users
const CounterSchema = new mongoose.Schema({
  _id:  { type: String, required: true }, // e.g. "brs_2026" or "bls_2026" or "id_brs"
  seq:  { type: Number, default: 0 }
});

// Atomically increment and return the next value
// If counter doesn't exist yet, initialize from the current max in the collection
CounterSchema.statics.nextSeq = async function(counterId) {
  const doc = await this.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
};

// Initialize a counter from the current max value in a collection (for first-time setup)
CounterSchema.statics.initFromMax = async function(counterId, currentMax, startAt = 1) {
  const existing = await this.findOne({ _id: counterId });
  if (!existing) {
    await this.create({ _id: counterId, seq: Math.max(currentMax, startAt - 1) });
  }
};

module.exports = mongoose.model('Counter', CounterSchema);
