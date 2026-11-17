const mongoose = require('mongoose');
const { Schema } = mongoose;
const cfg = require('../../config/intelligence.config');

const reorderRuleSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    safetyStock: { type: Number, min: 0, default: cfg.reorder.defaultSafetyStock },
    leadTimeDays: { type: Number, min: 0, default: cfg.reorder.defaultLeadTimeDays },
    reviewPeriodDays: { type: Number, min: 0, default: cfg.reorder.defaultReviewPeriodDays },
    minOrderQty: { type: Number, min: 1, default: cfg.reorder.defaultMinOrderQty },
    preferredSupplier: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'reorder_rules' }
);
reorderRuleSchema.index({ preferredSupplier: 1 });

module.exports = mongoose.models.ReorderRule || mongoose.model('ReorderRule', reorderRuleSchema);