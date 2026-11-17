const mongoose = require('mongoose');
const { Schema } = mongoose;
const cfg = require('../../config/intelligence.config');

const stockAlertSchema = new Schema(
  {
    type: { type: String, required: true, enum: ['LOW_STOCK', 'OUT_OF_STOCK', 'PREDICTED_STOCKOUT', 'ANOMALY', 'SUPPLIER_OVERDUE'] },
    severity: { type: String, required: true, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    severityRank: { type: Number, default: 1 },
    status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'], default: 'OPEN' },
    isActive: { type: Boolean, default: true },
    dedupeKey: { type: String, required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    anomaly: { type: Schema.Types.ObjectId, ref: 'AnomalyRecord' },
    message: { type: String, required: true },
    currentStock: Number,
    threshold: Number,
    occurrences: { type: Number, default: 1 },
    meta: Schema.Types.Mixed,
    firstTriggeredAt: Date,
    lastTriggeredAt: Date,
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    resolvedAt: Date,
    resolvedBy: String, // 'SYSTEM' or user id
  },
  { timestamps: true, collection: 'stock_alerts' }
);

// One ACTIVE alert per dedupeKey (partial unique index)
stockAlertSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
stockAlertSchema.index({ isActive: 1, severityRank: -1, lastTriggeredAt: -1 });
stockAlertSchema.index({ product: 1, status: 1 });
stockAlertSchema.index({ type: 1, isActive: 1 });
// TTL: resolved alerts are purged automatically (docs without resolvedAt never expire)
stockAlertSchema.index({ resolvedAt: 1 }, { expireAfterSeconds: cfg.alerts.resolvedTtlDays * 86400 });

module.exports = mongoose.models.StockAlert || mongoose.model('StockAlert', stockAlertSchema);