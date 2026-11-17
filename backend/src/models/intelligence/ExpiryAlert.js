const mongoose = require('mongoose');
const { Schema } = mongoose;
const cfg = require('../../config/intelligence.config');

const expiryAlertSchema = new Schema(
  {
    batch: { type: Schema.Types.ObjectId, ref: 'StockBatch', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    batchNumber: String,
    quantity: { type: Number, required: true },
    expiryDate: { type: Date, required: true },
    daysToExpiry: { type: Number, required: true },
    status: { type: String, enum: ['WARNING', 'CRITICAL', 'EXPIRED'], required: true },
    suggestedAction: { type: String, enum: ['MONITOR', 'MARKDOWN_OR_TRANSFER', 'DISPOSE_OR_RETURN'], default: 'MONITOR' },
    valueAtRisk: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    acknowledged: { type: Boolean, default: false },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    resolvedAt: Date,
  },
  { timestamps: true, collection: 'expiry_alerts' }
);
expiryAlertSchema.index({ batch: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
expiryAlertSchema.index({ isActive: 1, expiryDate: 1 });
expiryAlertSchema.index({ warehouse: 1, status: 1 });
expiryAlertSchema.index({ resolvedAt: 1 }, { expireAfterSeconds: cfg.alerts.resolvedTtlDays * 86400 }); // TTL

module.exports = mongoose.models.ExpiryAlert || mongoose.model('ExpiryAlert', expiryAlertSchema);