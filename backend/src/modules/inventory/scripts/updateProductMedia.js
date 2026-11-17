// One-time update for products already in the database (no re-seed needed):
//  - sets the real photo (Pexels URL) and current retail prices for each sample product
//  - fills the integration fields (price, costPrice, lowStockThreshold) read by the other modules
// Run from backend/:  node src/modules/inventory/scripts/updateProductMedia.js
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../../../config/db');
const { migrateIntegrationFields } = require('./migrateIntegrationFields');
const { PRODUCTS } = require('../seed/seedInventory');
const { PHOTOS } = require('../seed/productPhotos');

async function updateProductMedia(db = mongoose.connection.db) {
  let matched = 0;
  let updated = 0;
  for (const [, name, , , cost, sell, mrp] of PRODUCTS) {
    const set = {
      'pricing.costPrice': cost,
      'pricing.sellingPrice': sell,
      'pricing.mrp': mrp,
      costPrice: cost,
      price: sell,
      updatedAt: new Date(),
    };
    if (PHOTOS[name]) set.images = [PHOTOS[name]];
    const res = await db.collection('products').updateOne({ name }, { $set: set });
    matched += res.matchedCount;
    updated += res.modifiedCount;
  }
  console.log(`[media] ${matched} product(s) found, ${updated} updated with photos + prices`);
}

if (require.main === module) {
  (async () => {
    await connectDB();
    await updateProductMedia();
    await migrateIntegrationFields();
    await disconnectDB();
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { updateProductMedia };
