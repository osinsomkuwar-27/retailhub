// A batch/lot of a product received into a warehouse.
// Invariant (kept by stock.service inside transactions):
//   inventory.quantity == SUM(stock_batches.quantity) for that product+warehouse
const mongoose = require('mongoose');
const { BATCH_STATUS } = require('../utils/constants');

const { ObjectId } = mongoose.Schema.Types;

const stockBatchSchema = new mongoose.Schema(
  {
    batchNumber: { type: String, required: true, uppercase: true, trim: true },
    product: { type: ObjectId, ref: 'Product', required: true },
    warehouse: { type: ObjectId, ref: 'Warehouse', required: true },
    initialQuantity: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: [0, 'Batch quantity cannot be negative'] },
    costPrice: { type: Number, min: 0, default: 0 },
    manufactureDate: Date,
    expiryDate: { type: Date, default: null },
    receivedAt: { type: Date, default: Date.now },
    supplier: { type: ObjectId, ref: 'Supplier', default: null },
    sourceTransfer: { type: ObjectId, ref: 'StockTransfer', default: null },
    status: { type: String, enum: BATCH_STATUS, default: 'active' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true, collection: 'stock_batches' },
);

stockBatchSchema.path('expiryDate').validate(function expiryAfterMfg(v) {
  return !v || !this.manufactureDate || v > this.manufactureDate;
}, 'Expiry date must be after manufacture date');

stockBatchSchema.index({ product: 1, warehouse: 1, batchNumber: 1 }, { unique: true });
// FEFO (First-Expiry-First-Out) consumption order
stockBatchSchema.index({ product: 1, warehouse: 1, status: 1, expiryDate: 1, receivedAt: 1 });
// Expiry dashboard: "what expires in the next N days?"
stockBatchSchema.index({ status: 1, expiryDate: 1 });

module.exports = mongoose.models.StockBatch || mongoose.model('StockBatch', stockBatchSchema);
