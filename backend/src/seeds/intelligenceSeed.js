// node src/seeds/intelligenceSeed.js [--demo-sales] [--reset]
// Seeds ONLY Module 3 collections. Reads existing products/inventory/orders. Never writes to other modules.
require('dotenv').config();
const mongoose = require('mongoose');
try { require('../models'); } catch (_) {}
const { models, DAY } = require('../utils/intelligence/shared');
const Supplier = require('../models/intelligence/Supplier');
const SupplierOrder = require('../models/intelligence/SupplierOrder');
const ReorderRule = require('../models/intelligence/ReorderRule');
const SalesHistory = require('../models/intelligence/SalesHistory');
const salesSync = require('../services/intelligence/salesSync.service');

const args = new Set(process.argv.slice(2));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME || 'retailsync_db' });
  await SalesHistory.init();
  if (args.has('--reset')) {
    await Promise.all([Supplier.deleteMany({}), SupplierOrder.deleteMany({}), ReorderRule.deleteMany({}), SalesHistory.deleteMany({ source: 'DEMO_SEED' })]);
  }
  const products = await models.Product.find().limit(40).select('_id costPrice').lean();
  if (!products.length) throw new Error('No products found. Seed Module 1 first.');

  const supplierDefs = [
    { name: 'Apex Wholesale Traders', code: 'APEX', leadTimeDays: 5, email: 'sales@apex.example' },
    { name: 'Sahyadri Distributors', code: 'SAHY', leadTimeDays: 8, email: 'orders@sahyadri.example' },
    { name: 'Konkan Fresh Supply', code: 'KONK', leadTimeDays: 3, email: 'hello@konkan.example' },
  ];
  const suppliers = [];
  for (const s of supplierDefs) {
    suppliers.push(await Supplier.findOneAndUpdate({ code: s.code }, { $set: { ...s, suppliedProducts: products.map((p) => p._id) } }, { upsert: true, new: true }));
  }

  for (const [i, p] of products.entries()) {
    const sup = suppliers[i % suppliers.length];
    await ReorderRule.updateOne({ product: p._id }, { $setOnInsert: {
      safetyStock: rnd(5, 25), leadTimeDays: sup.leadTimeDays, reviewPeriodDays: 14, minOrderQty: [1, 6, 12][i % 3], preferredSupplier: sup._id } }, { upsert: true });
  }

  // Historical supplier orders with varying delays / partial fills (for performance analytics)
  if (!(await SupplierOrder.countDocuments())) {
    let n = 0;
    for (const sup of suppliers) {
      const reliability = { APEX: 0.9, SAHY: 0.6, KONK: 0.75 }[sup.code];
      for (let k = 0; k < 8; k++) {
        const orderedAt = new Date(Date.now() - rnd(20, 150) * DAY);
        const expectedDate = new Date(orderedAt.getTime() + sup.leadTimeDays * DAY);
        const late = Math.random() > reliability ? rnd(1, 6) : -rnd(0, 1);
        const items = [0, 1].map(() => {
          const ordered = rnd(20, 120); const p = products[rnd(0, products.length - 1)];
          return { product: p._id, quantityOrdered: ordered, quantityReceived: Math.random() > reliability ? Math.floor(ordered * 0.8) : ordered, unitCost: p.costPrice || 0 };
        });
        const full = items.every((it) => it.quantityReceived >= it.quantityOrdered);
        await SupplierOrder.create({ orderNumber: `PO-SEED-${sup.code}-${++n}`, supplier: sup._id, items, orderedAt, expectedDate,
          receivedAt: new Date(expectedDate.getTime() + late * DAY), status: full ? 'RECEIVED' : 'PARTIAL' });
      }
    }
    // one open overdue order to demonstrate overdue alerts
    await SupplierOrder.create({ orderNumber: 'PO-SEED-OPEN-1', supplier: suppliers[1]._id, status: 'PLACED',
      items: [{ product: products[0]._id, quantityOrdered: 60, unitCost: products[0].costPrice || 0 }],
      orderedAt: new Date(Date.now() - 15 * DAY), expectedDate: new Date(Date.now() - 4 * DAY) });
  }

  console.log('Backfilled sales lines from real orders:', await salesSync.backfill({ days: 90 }));

  // OPTIONAL synthetic demand so predictions are demonstrable on a fresh database (clearly tagged DEMO_SEED)
  if (args.has('--demo-sales')) {
    const inv = await models.Inventory.find({ product: { $in: products.map((p) => p._id) } }).select('product warehouse').lean();
    const docs = [];
    for (const row of inv) {
      const base = rnd(1, 8);
      for (let d = 60; d >= 1; d--) {
        const qty = Math.max(0, base + rnd(-2, 3));
        if (!qty) continue;
        docs.push({ timestamp: new Date(Date.now() - d * DAY), meta: { product: row.product, warehouse: row.warehouse },
          quantity: qty, revenue: 0, kind: 'SALE', source: 'DEMO_SEED' });
      }
    }
    await SalesHistory.insertMany(docs, { ordered: false });
    console.log('Inserted synthetic demo sales rows:', docs.length);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });