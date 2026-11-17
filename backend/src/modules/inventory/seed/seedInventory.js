// =============================================================================
// Seed data for Module 1. Touches ONLY Module 1 collections.
//
//   npm run seed            → seeds if Module 1 collections are empty
//   npm run seed -- --fresh → wipes Module 1 collections first, then seeds
//
// Stock is created through the real stock service (transactions), so
// inventory, batches and logs are consistent exactly as in production.
// =============================================================================
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../../../config/db');
const { Category, Product, Warehouse, Inventory, StockBatch, StockTransfer, InventoryLog, Counter } = require('../models');
const stock = require('../services/stock.service');
const transfers = require('../services/transfer.service');
const productService = require('../services/product.service');
const { applySchemaValidation } = require('../scripts/applySchemaValidation');
const { syncAll } = require('../scripts/syncIndexes');

const ADMIN = { id: '000000000000000000000a01', role: 'admin' };
const MANAGER = { id: '000000000000000000000b01', role: 'warehouse_manager', warehouses: [] };
const DAY = 86400000;
const inDays = (n) => new Date(Date.now() + n * DAY);

const CATEGORIES = [
  { name: 'Electronics', code: 'ELE', description: 'Phones, audio and accessories' },
  { name: 'Groceries', code: 'GRO', description: 'Staples, grains and packaged food' },
  { name: 'Dairy & Bakery', code: 'DAI', description: 'Milk, cheese, bread — perishable' },
  { name: 'Beverages', code: 'BEV', description: 'Tea, coffee, juices' },
  { name: 'Personal Care', code: 'PCR', description: 'Toiletries and grooming' },
  { name: 'Home & Kitchen', code: 'HOM', description: 'Cookware and household items' },
];

const WAREHOUSES = [
  { code: 'WH-MUM-01', name: 'Mumbai Central Warehouse', type: 'main', capacity: 50000, coords: [72.8777, 19.076], address: { line1: 'Plot 12, MIDC Andheri East', city: 'Mumbai', state: 'Maharashtra', postalCode: '400093' } },
  { code: 'WH-DEL-01', name: 'Delhi North Hub', type: 'regional', capacity: 30000, coords: [77.209, 28.6139], address: { line1: 'Sector 5, Narela Industrial Area', city: 'New Delhi', state: 'Delhi', postalCode: '110040' } },
  { code: 'WH-BLR-01', name: 'Bengaluru South Hub', type: 'regional', capacity: 30000, coords: [77.5946, 12.9716], address: { line1: 'Bommasandra Industrial Area', city: 'Bengaluru', state: 'Karnataka', postalCode: '560099' } },
  { code: 'WH-CHE-01', name: 'Chennai Cold Storage', type: 'cold_storage', capacity: 15000, coords: [80.2707, 13.0827], address: { line1: 'Ambattur Industrial Estate', city: 'Chennai', state: 'Tamil Nadu', postalCode: '600058' } },
];

// [category, name, brand, unit, cost, sell, mrp, reorder, perishable, shelfLifeDays, attributes]
const PRODUCTS = [
  ['ELE', 'Galaxy M35 5G Smartphone 128GB', 'Samsung', 'pcs', 14200, 16999, 19999, 15, false, null, { Color: 'Blue', RAM: '6GB' }],
  ['ELE', 'Redmi Note 14 Smartphone 128GB', 'Xiaomi', 'pcs', 12800, 14999, 17999, 15, false, null, { Color: 'Black', RAM: '8GB' }],
  ['ELE', 'Rockerz 450 Bluetooth Headphones', 'boAt', 'pcs', 900, 1499, 3990, 25, false, null, { Color: 'Red' }],
  ['ELE', '20000mAh Power Bank', 'Mi', 'pcs', 1100, 1699, 2199, 20, false, null, { Capacity: '20000mAh' }],
  ['ELE', 'USB-C Fast Charging Cable 1m', 'Portronics', 'pcs', 120, 249, 499, 50, false, null, { Length: '1m' }],
  ['GRO', 'Basmati Rice Premium 5kg', 'India Gate', 'pack', 520, 699, 799, 40, true, 365, { Weight: '5kg' }],
  ['GRO', 'Toor Dal 1kg', 'Tata Sampann', 'pack', 140, 189, 210, 60, true, 270, { Weight: '1kg' }],
  ['GRO', 'Sunflower Oil 1L', 'Fortune', 'l', 125, 155, 175, 50, true, 270, { Volume: '1L' }],
  ['GRO', 'Whole Wheat Atta 10kg', 'Aashirvaad', 'pack', 390, 489, 540, 30, true, 120, { Weight: '10kg' }],
  ['GRO', 'Instant Noodles Masala (Pack of 12)', 'Maggi', 'pack', 150, 192, 204, 40, true, 270, { Count: '12' }],
  ['DAI', 'Toned Milk 1L', 'Amul', 'l', 52, 66, 68, 100, true, 7, { Fat: '3%' }],
  ['DAI', 'Processed Cheese Slices 200g', 'Amul', 'pack', 105, 135, 145, 30, true, 180, { Weight: '200g' }],
  ['DAI', 'Brown Bread 400g', 'Britannia', 'pack', 38, 50, 55, 40, true, 5, { Weight: '400g' }],
  ['DAI', 'Salted Butter 500g', 'Amul', 'pack', 245, 285, 295, 25, true, 180, { Weight: '500g' }],
  ['BEV', 'Premium Tea 1kg', 'Tata Tea', 'pack', 430, 540, 590, 30, true, 540, { Weight: '1kg' }],
  ['BEV', 'Instant Coffee 200g', 'Nescafe', 'pack', 520, 650, 699, 20, true, 540, { Weight: '200g' }],
  ['BEV', 'Mixed Fruit Juice 1L', 'Real', 'l', 85, 120, 130, 40, true, 180, { Volume: '1L' }],
  ['PCR', 'Anti-Dandruff Shampoo 340ml', 'Head & Shoulders', 'ml', 280, 365, 399, 25, false, null, { Volume: '340ml' }],
  ['PCR', 'Herbal Toothpaste 200g', 'Dabur', 'pack', 85, 115, 125, 50, false, null, { Weight: '200g' }],
  ['PCR', 'Moisturising Soap (Pack of 4)', 'Dove', 'pack', 190, 245, 260, 30, false, null, { Count: '4' }],
  ['HOM', 'Non-Stick Fry Pan 24cm', 'Prestige', 'pcs', 650, 899, 1295, 10, false, null, { Diameter: '24cm' }],
  ['HOM', 'Stainless Steel Water Bottle 1L', 'Milton', 'pcs', 320, 449, 599, 20, false, null, { Volume: '1L' }],
  ['HOM', 'Dishwash Liquid 750ml', 'Vim', 'ml', 105, 135, 145, 30, false, null, { Volume: '750ml' }],
  ['HOM', 'Electric Kettle 1.5L', 'Pigeon', 'pcs', 540, 749, 1195, 8, false, null, { Volume: '1.5L' }],
];

async function wipeModule1() {
  await Promise.all([Category, Product, Warehouse, Inventory, StockBatch, StockTransfer, InventoryLog, Counter].map((M) => M.deleteMany({})));
  console.log('[seed] Module 1 collections cleared');
}

async function seed() {
  const fresh = process.argv.includes('--fresh');
  if (fresh) await wipeModule1();
  else if (await Product.estimatedDocumentCount()) {
    console.log('[seed] Module 1 already has data. Use "npm run seed:inventory -- --fresh" to reset it.');
    return;
  }

  await applySchemaValidation();
  await syncAll();

  // Categories & warehouses
  const cats = {};
  for (const c of CATEGORIES) cats[c.code] = await Category.create(c);
  const whs = [];
  for (const w of WAREHOUSES) {
    whs.push(await Warehouse.create({
      code: w.code, name: w.name, type: w.type, capacity: w.capacity, address: w.address,
      location: { type: 'Point', coordinates: w.coords },
      contact: { phone: '+91 22 4000 0000', email: `${w.code.toLowerCase()}@retailsync.local` },
    }));
  }
  const [MUM, DEL, BLR, CHE] = whs;
  console.log(`[seed] ${CATEGORIES.length} categories, ${whs.length} warehouses`);

  // Products (SKUs generated by the real SKU service)
  const products = [];
  for (const [code, name, brand, unit, cost, sell, mrp, reorder, perishable, shelf, attrs] of PRODUCTS) {
    const p = await productService.createProduct({
      name, brand, unit, category: String(cats[code]._id),
      description: `${brand} ${name}. Sample product for the RetailSync demo.`,
      pricing: { costPrice: cost, sellingPrice: sell, mrp, taxRate: code === 'ELE' ? 18 : 5 },
      reorderLevel: reorder, isPerishable: perishable, shelfLifeDays: shelf || undefined,
      attributes: Object.entries(attrs).map(([key, value]) => ({ key, value })),
    }, ADMIN);
    products.push({ ...p, code });
  }
  console.log(`[seed] ${products.length} products`);

  // Stock-in: each product into 2–3 warehouses, perishables with 2 batches of different expiry
  let ins = 0;
  for (const [i, p] of products.entries()) {
    const targets = p.code === 'DAI' ? [CHE, MUM] : i % 3 === 0 ? [MUM, DEL, BLR] : [MUM, i % 2 ? DEL : BLR];
    for (const wh of targets) {
      const base = p.code === 'ELE' ? 60 : 180;
      const qty = base + ((i * 37 + wh.capacity) % 120);
      if (p.isPerishable) {
        const shelf = p.shelfLifeDays || 180;
        await stock.stockIn({ productId: p._id, warehouseId: wh._id, quantity: Math.ceil(qty * 0.4), userId: MANAGER.id, reason: 'Opening stock', manufactureDate: inDays(-Math.floor(shelf * 0.6)), expiryDate: inDays(Math.max(2, Math.floor(shelf * 0.4))) });
        await stock.stockIn({ productId: p._id, warehouseId: wh._id, quantity: Math.floor(qty * 0.6), userId: MANAGER.id, reason: 'Supplier delivery', manufactureDate: inDays(-2), expiryDate: inDays(shelf - 2) });
        ins += 2;
      } else {
        await stock.stockIn({ productId: p._id, warehouseId: wh._id, quantity: qty, userId: MANAGER.id, reason: 'Opening stock' });
        ins += 1;
      }
    }
  }
  console.log(`[seed] ${ins} stock-in operations`);

  // Sales & reductions to create history and some low / out-of-stock rows
  let outs = 0;
  for (const [i, p] of products.entries()) {
    const rows = await Inventory.find({ product: p._id }).lean();
    for (const r of rows) {
      const sales = 2 + (i % 4);
      for (let s = 0; s < sales; s += 1) {
        const q = Math.max(1, Math.floor(r.quantity * 0.06));
        await stock.stockOut({ productId: p._id, warehouseId: r.warehouse, quantity: q, type: 'SALE', userId: ADMIN.id, reason: 'Demo sale', reference: { kind: 'Seed', code: `SEED-SALE-${i}-${s}` } }).catch(() => {});
        outs += 1;
      }
    }
  }
  // Force a few low / out-of-stock situations
  const forceTo = async (p, wh, target, type = 'SALE') => {
    const inv = await Inventory.findOne({ product: p._id, warehouse: wh._id }).lean();
    if (inv && inv.quantity > target) {
      await stock.stockOut({ productId: p._id, warehouseId: wh._id, quantity: inv.quantity - target, type, userId: ADMIN.id, reason: 'Demo: heavy demand', reference: { kind: 'Seed', code: 'SEED-RUSH' } });
      outs += 1;
    }
  };
  await forceTo(products[0], MUM, 6);   // phone low in Mumbai
  await forceTo(products[2], MUM, 0);   // headphones out in Mumbai
  await forceTo(products[10], CHE, 30); // milk low in Chennai
  await forceTo(products[23], MUM, 3);  // kettle low
  await stock.stockOut({ productId: products[21]._id, warehouseId: MUM._id, quantity: 4, type: 'DAMAGED', userId: MANAGER.id, reason: 'Dented during unloading' });
  console.log(`[seed] ${outs} sales / reductions`);

  // Transfers: two completed, one pending
  await transfers.createTransfer({ fromWarehouse: MUM._id, toWarehouse: DEL._id, items: [{ product: products[3]._id, quantity: 20 }, { product: products[4]._id, quantity: 40 }], notes: 'Rebalance accessories to North', executeNow: true }, MANAGER);
  await transfers.createTransfer({ fromWarehouse: MUM._id, toWarehouse: CHE._id, items: [{ product: products[11]._id, quantity: 15 }], notes: 'Cold-chain items to Chennai', executeNow: true }, MANAGER);
  await transfers.createTransfer({ fromWarehouse: MUM._id, toWarehouse: BLR._id, items: [{ product: products[6]._id, quantity: 25 }, { product: products[19]._id, quantity: 10 }], notes: 'Awaiting truck' }, MANAGER);
  console.log('[seed] 3 transfers (2 completed, 1 pending)');

  // One batch that is already expired (date moved into the past via the raw driver, as time would)
  const bread = await StockBatch.findOne({ product: products[12]._id, status: 'active' }).sort({ expiryDate: 1 });
  if (bread) await StockBatch.collection.updateOne({ _id: bread._id }, { $set: { expiryDate: inDays(-1), status: 'expired' } });

  // Spread history over the last 30 days so charts look realistic (order preserved)
  const logs = await InventoryLog.find({}).sort({ _id: 1 }).select('_id').lean();
  const start = Date.now() - 30 * DAY;
  const step = (30 * DAY - 3600000) / Math.max(1, logs.length);
  await InventoryLog.collection.bulkWrite(logs.map((l, i) => ({
    updateOne: { filter: { _id: l._id }, update: { $set: { createdAt: new Date(start + i * step) } } },
  })));

  // Invariant check: inventory.quantity == sum(batches.quantity)
  const mismatches = await Inventory.aggregate([
    { $lookup: { from: 'stock_batches', let: { p: '$product', w: '$warehouse' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$product', '$$p'] }, { $eq: ['$warehouse', '$$w'] }] } } }, { $group: { _id: null, q: { $sum: '$quantity' } } }], as: 'b' } },
    { $match: { $expr: { $ne: ['$quantity', { $ifNull: [{ $first: '$b.q' }, 0] }] } } },
  ]);
  console.log(`[seed] consistency check: ${mismatches.length === 0 ? 'OK — inventory matches batches' : `${mismatches.length} MISMATCH(ES)`}`);
  console.log(`[seed] done: ${await InventoryLog.countDocuments()} inventory logs, ${await StockBatch.countDocuments()} batches`);
}

(async () => {
  await connectDB();
  await seed();
  await disconnectDB();
})().catch(async (e) => {
  console.error('[seed] failed:', e);
  await mongoose.disconnect();
  process.exit(1);
});
