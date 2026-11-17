const mongoose = require('mongoose');
const { Schema } = mongoose;

const anomalySchema = new Schema(
  {
    type: { type: String, required: true, enum: ['LARGE_UNAPPROVED_REDUCTION', 'RAPID_REPEATED_REDUCTIONS', 'REPEATED_ORDER_CANCELLATION'] },
    severity: { type: String, required: true, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    status: { type: String, enum: ['OPEN', 'INVESTIGATING', 'CONFIRMED', 'DISMISSED'], default: 'OPEN' },
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    user: { type: Schema.Types.ObjectId, ref: 'User' },        // staff member
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    description: { type: String, required: true },
    evidence: {                                                  // embedded
      units: Number, threshold: Number, count: Number,
      logIds: [{ type: Schema.Types.ObjectId }], orderIds: [{ type: Schema.Types.ObjectId }],
      windowStart: Date, windowEnd: Date,
    },
    detectedAt: { type: Date, default: Date.now },
    dedupeKey: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    resolutionNote: String,
  },
  { timestamps: true, collection: 'anomaly_records' }
);
anomalySchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
anomalySchema.index({ status: 1, detectedAt: -1 });
anomalySchema.index({ type: 1, detectedAt: -1 });
anomalySchema.index({ user: 1, detectedAt: -1 });
anomalySchema.index({ customer: 1, detectedAt: -1 });

module.exports = mongoose.models.AnomalyRecord || mongoose.model('AnomalyRecord', anomalySchema);