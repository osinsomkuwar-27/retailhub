// Append-only movement history. Every stock change writes exactly one log
// inside the same transaction as the change itself.
//
// NOTE for Person 3: this is a normal (not time-series) collection on purpose —
// Change Streams do not work on time-series collections, and anomaly detection
// watches inserts here:  InventoryLog.watch([{ $match: { operationType: 'insert' } }])
const mongoose = require('mongoose');
const { MOVEMENT_TYPES, REFERENCE_KINDS } = require('../utils/constants');

const { ObjectId } = mongoose.Schema.Types;

const inventoryLogSchema = new mongoose.Schema(
  {
    product: { type: ObjectId, ref: 'Product', required: true },
    warehouse: { type: ObjectId, ref: 'Warehouse', required: true },
    type: { type: String, enum: Object.values(MOVEMENT_TYPES), required: true },
    quantityChange: { type: Number, required: true }, // signed: +in / -out
    quantityBefore: { type: Number, required: true, min: 0 },
    quantityAfter: { type: Number, required: true, min: 0 },
    batches: [{ _id: false, batchNumber: String, quantity: Number }],
    unitCost: { type: Number, min: 0 },
    reference: {
      kind: { type: String, enum: REFERENCE_KINDS, default: 'Manual' },
      id: { type: ObjectId, default: null },
      code: { type: String, default: '' }, // e.g. TRF-20261117-0003 / ORD-...
      type: { type: String },              // Module 3 alias of kind (see REFERENCE_TYPE)
    },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
    performedBy: { type: ObjectId, ref: 'User', default: null },

    // ---- Integration fields (read by Module 3 anomaly detection) ----
    // quantity       = same signed number as quantityChange
    // reference.type = upper-case reference category (ORDER, TRANSFER, MANUAL, ...)
    // Filled automatically by the pre('validate') hook below.
    quantity: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'inventory_logs' },
);

// Module 1 reference.kind → Module 3 reference.type.
// ORDER and TRANSFER are in Module 3's "approved" list, so they are never flagged.
const REFERENCE_TYPE = {
  Order: 'ORDER',
  StockTransfer: 'TRANSFER',
  ExpiryWriteOff: 'EXPIRY_WRITE_OFF',
  Manual: 'MANUAL',
  Seed: 'SEED',
};
inventoryLogSchema.statics.REFERENCE_TYPE = REFERENCE_TYPE;

inventoryLogSchema.pre('validate', function syncIntegrationFields() {
  this.quantity = this.quantityChange;
  if (!this.reference) this.reference = { kind: 'Manual' };
  this.reference.type = REFERENCE_TYPE[this.reference.kind || 'Manual'] || 'MANUAL';
});

// Logs are immutable
function blockUpdate() { throw new Error('Inventory logs are append-only'); }
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'].forEach((op) => inventoryLogSchema.pre(op, blockUpdate));

inventoryLogSchema.index({ product: 1, createdAt: -1 });
inventoryLogSchema.index({ warehouse: 1, createdAt: -1 });
inventoryLogSchema.index({ type: 1, createdAt: -1 });
inventoryLogSchema.index({ 'reference.kind': 1, 'reference.id': 1 });
// Module 3 "rapid repeated reductions by one user" query
inventoryLogSchema.index({ performedBy: 1, createdAt: -1 });

module.exports = mongoose.models.InventoryLog || mongoose.model('InventoryLog', inventoryLogSchema);
