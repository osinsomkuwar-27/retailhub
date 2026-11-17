const mongoose = require('mongoose');
const { Schema } = mongoose;

const itemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantityOrdered: { type: Number, required: true, min: 1 },
  quantityReceived: { type: Number, default: 0, min: 0 },
  unitCost: { type: Number, default: 0, min: 0 },
});

const supplierOrderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: { type: [itemSchema], validate: (v) => v.length > 0 }, // embedded
    status: { type: String, enum: ['PLACED', 'PARTIAL', 'RECEIVED', 'CANCELLED'], default: 'PLACED' },
    orderedAt: { type: Date, default: Date.now },
    expectedDate: { type: Date, required: true },
    receivedAt: { type: Date, default: null },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'supplier_orders', optimisticConcurrency: true }
);
supplierOrderSchema.index({ supplier: 1, status: 1, expectedDate: 1 });
supplierOrderSchema.index({ status: 1, receivedAt: -1 });
supplierOrderSchema.index({ 'items.product': 1, status: 1 });

module.exports = mongoose.models.SupplierOrder || mongoose.model('SupplierOrder', supplierOrderSchema);