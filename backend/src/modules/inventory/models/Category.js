const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Category name is required'], trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    // 2–6 char code used as the SKU prefix (ELE, GRO, ...)
    code: {
      type: String, required: [true, 'Category code is required'], uppercase: true, trim: true,
      match: [/^[A-Z0-9]{2,6}$/, 'Code must be 2–6 letters/digits'],
    },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    // Self-reference for sub-categories (Electronics > Mobiles)
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'categories' },
);

// Unique, case-insensitive name (collation strength 2 ignores case)
categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ code: 1 }, { unique: true });
categorySchema.index({ parent: 1, isActive: 1 });

categorySchema.pre('validate', function setSlug() {
  if (this.isModified('name') || !this.slug) {
    this.slug = String(this.name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
});

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
