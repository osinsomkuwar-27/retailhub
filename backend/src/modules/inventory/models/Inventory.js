// One document per (product, warehouse) pair = the live stock level.
// It's a separate collection (not embedded in products) because:
//  - stock changes far more often than product details
//  - each warehouse updates its own row → less write contention
//  - unbounded growth: products × warehouses
const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const inventorySchema = new mongoose.Schema(
  {
    product: { type: ObjectId, ref: 'Product', required: true },
    warehouse: { type: ObjectId, ref: 'Warehouse', required: true },
    quantity: { type: Number, required: true, min: [0, 'Stock cannot be negative'], default: 0 },
    // Reserved by Person 2 for carts/orders awaiting payment
    reservedQuantity: { type: Number, min: 0, default: 0 },
    reorderLevel: { type: Number, min: 0, default: null }, // overrides product.reorderLevel if set
    binLocation: { type: String, trim: true, default: '' },
    lastStockInAt: Date,
    lastStockOutAt: Date,
  },
  {
    timestamps: true,
    collection: 'inventory',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

inventorySchema.virtual('availableQuantity').get(function available() {
  return this.quantity - (this.reservedQuantity || 0);
});

inventorySchema.path('reservedQuantity').validate(function reservedCheck(v) {
  return v <= this.quantity;
}, 'Reserved quantity cannot exceed quantity');

// Unique compound index: exactly one stock row per product per warehouse
inventorySchema.index({ product: 1, warehouse: 1 }, { unique: true });
// Warehouse stock page / low-stock scans
inventorySchema.index({ warehouse: 1, quantity: 1 });

module.exports = mongoose.models.Inventory || mongoose.model('Inventory', inventorySchema);
