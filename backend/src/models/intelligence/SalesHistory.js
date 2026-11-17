const mongoose = require('mongoose');
const { Schema } = mongoose;

// MongoDB TIME-SERIES collection. Insert-only; cancellations are stored as negative rows.
const salesHistorySchema = new Schema(
  {
    timestamp: { type: Date, required: true },
    meta: {
      product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    },
    quantity: { type: Number, required: true },       // signed units
    revenue: { type: Number, default: 0 },            // signed
    kind: { type: String, enum: ['SALE', 'CANCELLATION'], default: 'SALE' },
    orderId: { type: Schema.Types.ObjectId, default: null },
    source: { type: String, default: 'ORDER' },       // ORDER | DEMO_SEED
  },
  {
    collection: 'sales_history',
    versionKey: false,
    timeseries: { timeField: 'timestamp', metaField: 'meta', granularity: 'hours' },
  }
);
salesHistorySchema.index({ 'meta.product': 1, timestamp: -1 });
salesHistorySchema.index({ 'meta.product': 1, 'meta.warehouse': 1, timestamp: -1 });

module.exports = mongoose.models.SalesHistory || mongoose.model('SalesHistory', salesHistorySchema);