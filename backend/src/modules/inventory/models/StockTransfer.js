const mongoose = require('mongoose');
const { TRANSFER_STATUS } = require('../utils/constants');

const { ObjectId } = mongoose.Schema.Types;

// EMBEDDED: the batches moved for each line (snapshot, never edited later)
const movedBatchSchema = new mongoose.Schema(
  { batchNumber: String, quantity: Number, expiryDate: Date, costPrice: Number },
  { _id: false },
);

const transferItemSchema = new mongoose.Schema(
  {
    product: { type: ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
    batches: { type: [movedBatchSchema], default: [] },
  },
  { _id: false },
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: TRANSFER_STATUS, required: true },
    changedBy: { type: ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const stockTransferSchema = new mongoose.Schema(
  {
    transferNumber: { type: String, required: true, uppercase: true },
    fromWarehouse: { type: ObjectId, ref: 'Warehouse', required: true },
    toWarehouse: { type: ObjectId, ref: 'Warehouse', required: true },
    items: {
      type: [transferItemSchema],
      validate: [(v) => v.length > 0 && v.length <= 50, 'A transfer needs 1–50 items'],
    },
    status: { type: String, enum: TRANSFER_STATUS, default: 'pending' },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    requestedBy: { type: ObjectId, ref: 'User' },
    completedBy: { type: ObjectId, ref: 'User' },
    completedAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true, collection: 'stock_transfers' },
);

stockTransferSchema.pre('validate', function differentWarehouses() {
  if (this.fromWarehouse && this.toWarehouse && this.fromWarehouse.equals(this.toWarehouse)) {
    this.invalidate('toWarehouse', 'Source and destination warehouses must be different');
  }
});

stockTransferSchema.index({ transferNumber: 1 }, { unique: true });
stockTransferSchema.index({ status: 1, createdAt: -1 });
stockTransferSchema.index({ fromWarehouse: 1, createdAt: -1 });
stockTransferSchema.index({ toWarehouse: 1, createdAt: -1 });

module.exports = mongoose.models.StockTransfer || mongoose.model('StockTransfer', stockTransferSchema);
