const mongoose = require('mongoose');
const { Schema } = mongoose;

const supplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    contactPerson: String,
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    address: { line1: String, city: String, state: String, country: String, pincode: String }, // embedded
    leadTimeDays: { type: Number, min: 0, default: 7 },
    paymentTerms: { type: String, default: 'NET_30' },
    suppliedProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'suppliers' }
);
supplierSchema.index({ name: 'text', code: 'text' });
supplierSchema.index({ isActive: 1, name: 1 });
supplierSchema.index({ suppliedProducts: 1 });

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);