const mongoose = require('mongoose');
const { PRODUCT_UNITS, PRODUCT_STATUS, SKU_REGEX } = require('../utils/constants');

const { ObjectId } = mongoose.Schema.Types;

// EMBEDDED: pricing and attributes are always read with the product and never
// shared between products → embedding avoids extra lookups.
const pricingSchema = new mongoose.Schema(
  {
    costPrice: { type: Number, required: [true, 'Cost price is required'], min: 0 },
    sellingPrice: { type: Number, required: [true, 'Selling price is required'], min: 0 },
    mrp: { type: Number, min: 0 },
    taxRate: { type: Number, min: 0, max: 100, default: 0 },
    currency: { type: String, default: 'INR', uppercase: true },
  },
  { _id: false },
);

const attributeSchema = new mongoose.Schema(
  { key: { type: String, required: true, trim: true }, value: { type: String, required: true, trim: true } },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String, required: true, uppercase: true, trim: true,
      match: [SKU_REGEX, 'SKU must look like ELE-SAM-00012'],
    },
    name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    // REFERENCED: categories are shared by many products and edited independently
    category: { type: ObjectId, ref: 'Category', required: [true, 'Category is required'] },
    brand: { type: String, trim: true, maxlength: 60, default: '' },
    unit: { type: String, enum: PRODUCT_UNITS, default: 'pcs' },
    pricing: { type: pricingSchema, required: true },
    attributes: { type: [attributeSchema], default: [] },
    images: { type: [String], default: [] },
    reorderLevel: { type: Number, min: 0, default: 10 }, // low-stock threshold per warehouse
    isPerishable: { type: Boolean, default: false },
    shelfLifeDays: { type: Number, min: 1 },
    supplier: { type: ObjectId, ref: 'Supplier' }, // Person 3's suppliers collection
    status: { type: String, enum: PRODUCT_STATUS, default: 'active' },
    createdBy: { type: ObjectId, ref: 'User' },
    updatedBy: { type: ObjectId, ref: 'User' },

    // ---- Integration fields (read by Module 3 – Smart Inventory) ----
    // Copies of pricing.costPrice and reorderLevel, kept in sync automatically
    // by the pre('validate') hook below. Never set them directly.
    costPrice: { type: Number, min: 0 },
    lowStockThreshold: { type: Number, min: 0 },
    // Read by Module 2 (customer storefront): copy of pricing.sellingPrice
    price: { type: Number, min: 0 },
  },
  { timestamps: true, collection: 'products' },
);

productSchema.pre('validate', function syncIntegrationFields() {
  if (this.pricing) {
    this.costPrice = this.pricing.costPrice;
    this.price = this.pricing.sellingPrice;
  }
  this.lowStockThreshold = this.reorderLevel;
});

productSchema.path('pricing').validate(function priceCheck(p) {
  return !p || p.mrp == null || p.sellingPrice <= p.mrp;
}, 'Selling price cannot exceed MRP');

// ---- Indexes ----
productSchema.index({ sku: 1 }, { unique: true });
// Text search index (weights: name matters most)
productSchema.index(
  { name: 'text', brand: 'text', description: 'text' },
  { weights: { name: 10, brand: 5, description: 1 }, name: 'product_text_search' },
);
// Compound index for the product listing filter + sort (ESR rule: Equality, Sort, Range)
productSchema.index({ category: 1, status: 1, createdAt: -1 });
productSchema.index({ status: 1, 'pricing.sellingPrice': 1 });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
