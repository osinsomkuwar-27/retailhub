// Atomic sequence generator (used for SKUs, batch numbers and transfer numbers).
// findOneAndUpdate + $inc + upsert is atomic, so two concurrent requests
// can never receive the same number.
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { collection: 'inventory_counters', versionKey: false },
);

counterSchema.statics.next = async function next(key, session) {
  const doc = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, session },
  );
  return doc.seq;
};

counterSchema.statics.peek = async function peek(key) {
  const doc = await this.findById(key).lean();
  return (doc?.seq || 0) + 1;
};

module.exports = mongoose.models.InventoryCounter || mongoose.model('InventoryCounter', counterSchema);
