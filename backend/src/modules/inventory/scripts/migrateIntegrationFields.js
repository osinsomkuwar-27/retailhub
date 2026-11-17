// =============================================================================
// One-time migration: adds the Module 3 integration fields to data that was
// created BEFORE they existed. New documents get them automatically.
//   products:       costPrice ← pricing.costPrice, lowStockThreshold ← reorderLevel,
//                   price ← pricing.sellingPrice (Module 2 storefront)
//   inventory_logs: quantity ← quantityChange,      reference.type ← map(reference.kind)
// Safe to re-run. Part of `npm run db:setup`.
// =============================================================================
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../../../config/db');
const InventoryLog = require('../models/InventoryLog');

async function migrateIntegrationFields(db = mongoose.connection.db) {
  // Aggregation-pipeline updates: copy one field into another, server-side
  const p = await db.collection('products').updateMany({}, [
    { $set: { costPrice: '$pricing.costPrice', lowStockThreshold: '$reorderLevel', price: '$pricing.sellingPrice' } },
  ]);

  const map = InventoryLog.REFERENCE_TYPE;
  const branches = Object.entries(map).map(([kind, type]) => ({ case: { $eq: ['$reference.kind', kind] }, then: type }));
  const l = await db.collection('inventory_logs').updateMany(
    { $or: [{ quantity: { $exists: false } }, { 'reference.type': { $exists: false } }] },
    [{ $set: { quantity: '$quantityChange', 'reference.type': { $switch: { branches, default: 'MANUAL' } } } }],
  );
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[migrate] products updated: ${p.modifiedCount}, inventory_logs updated: ${l.modifiedCount}`);
  }
}

if (require.main === module) {
  (async () => {
    await connectDB();
    await migrateIntegrationFields();
    await disconnectDB();
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { migrateIntegrationFields };
