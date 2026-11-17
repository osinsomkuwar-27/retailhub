/**
 * Module 1 integration tests — real MongoDB replica set, real transactions.
 * Run: npm run test:inventory
 */
const { startDB, stopDB } = require('./helpers'); // must be first (sets env)
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../../app');
const { signDevToken } = require('../../../dev/devAuth');
const { Inventory, StockBatch, InventoryLog, StockTransfer, Product } = require('../models');
const stockService = require('../services/stock.service');
const { markExpiredBatches } = require('../services/batch.service');
const { inventoryEvents, EVENTS } = require('../utils/events');

const admin = `Bearer ${signDevToken('admin').token}`;
const manager = `Bearer ${signDevToken('warehouse_manager').token}`;
const customer = `Bearer ${signDevToken('customer').token}`;
const api = () => request(app);

const ids = {};

async function invQty(productId, warehouseId) {
  const row = await Inventory.findOne({ product: productId, warehouse: warehouseId }).lean();
  return row ? row.quantity : 0;
}

/** inventory.quantity must always equal the sum of its batches */
async function expectConsistent() {
  const rows = await Inventory.find().lean();
  for (const r of rows) {
    const [b] = await StockBatch.aggregate([
      { $match: { product: r.product, warehouse: r.warehouse } },
      { $group: { _id: null, q: { $sum: '$quantity' } } },
    ]);
    expect(b?.q || 0).toBe(r.quantity);
  }
}

const warehouseBody = (code, coords) => ({
  code, name: `Warehouse ${code}`, type: 'regional', capacity: 10000,
  address: { line1: 'Line 1', city: 'Mumbai', state: 'MH', postalCode: '400001' },
  location: { type: 'Point', coordinates: coords },
});

beforeAll(async () => {
  await startDB();
});
afterAll(async () => {
  await stopDB();
});

// ---------------------------------------------------------------------------
describe('Authentication & authorization', () => {
  test('401 without a token on protected routes', async () => {
    const res = await api().get('/api/inventory');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('403 for a customer on inventory routes', async () => {
    const res = await api().get('/api/inventory').set('Authorization', customer);
    expect(res.status).toBe(403);
  });

  test('warehouse manager cannot create categories/products', async () => {
    const res = await api().post('/api/categories').set('Authorization', manager).send({ name: 'X', code: 'XX' });
    expect(res.status).toBe(403);
  });

  test('catalogue is publicly readable', async () => {
    const res = await api().get('/api/products');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('Categories, products & SKU', () => {
  test('create categories', async () => {
    let res = await api().post('/api/categories').set('Authorization', admin).send({ name: 'Groceries', code: 'gro' });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('GRO');
    expect(res.body.data.slug).toBe('groceries');
    ids.groceries = res.body.data._id;

    res = await api().post('/api/categories').set('Authorization', admin).send({ name: 'Electronics', code: 'ELE' });
    ids.electronics = res.body.data._id;
  });

  test('duplicate category name (case-insensitive) → 409', async () => {
    const res = await api().post('/api/categories').set('Authorization', admin).send({ name: 'GROCERIES', code: 'GR2' });
    expect(res.status).toBe(409);
  });

  test('validation errors → 400 with field list', async () => {
    const res = await api().post('/api/products').set('Authorization', admin).send({ name: 'x', pricing: { costPrice: -1 } });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['body.category', 'body.pricing.costPrice']));
  });

  test('auto-generated SKU follows CAT-BRD-00001', async () => {
    const res = await api().post('/api/products').set('Authorization', admin).send({
      name: 'Basmati Rice 5kg', brand: 'India Gate', category: ids.groceries, unit: 'pack',
      pricing: { costPrice: 500, sellingPrice: 650, mrp: 700 }, reorderLevel: 20,
      isPerishable: true, shelfLifeDays: 365,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe('GRO-IND-00001');
    ids.rice = res.body.data._id;

    const res2 = await api().post('/api/products').set('Authorization', admin).send({
      name: 'Basmati Rice 1kg', brand: 'India Gate', category: ids.groceries,
      pricing: { costPrice: 100, sellingPrice: 130 }, isPerishable: true, shelfLifeDays: 365,
    });
    expect(res2.body.data.sku).toBe('GRO-IND-00002');
  });

  test('manual SKU: duplicate → 409, bad format → 400', async () => {
    const body = { name: 'Phone', brand: 'Samsung', category: ids.electronics, pricing: { costPrice: 10000, sellingPrice: 12000 }, reorderLevel: 5 };
    let res = await api().post('/api/products').set('Authorization', admin).send({ ...body, sku: 'ELE-SAM-00100' });
    expect(res.status).toBe(201);
    ids.phone = res.body.data._id;
    res = await api().post('/api/products').set('Authorization', admin).send({ ...body, sku: 'ELE-SAM-00100' });
    expect(res.status).toBe(409);
    res = await api().post('/api/products').set('Authorization', admin).send({ ...body, sku: 'bad sku!' });
    expect(res.status).toBe(400);
  });

  test('SKU check endpoint', async () => {
    const res = await api().get('/api/products/sku/check?sku=ELE-SAM-00100').set('Authorization', admin);
    expect(res.body.data).toMatchObject({ valid: true, available: false });
  });

  test('selling price above MRP is rejected', async () => {
    const res = await api().put(`/api/products/${ids.rice}`).set('Authorization', admin).send({ pricing: { sellingPrice: 900 } });
    expect(res.status).toBe(400);
  });

  test('list with text search, filter and pagination', async () => {
    const res = await api().get('/api/products?search=rice&limit=1').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 2, totalPages: 2 });
    const partial = await api().get('/api/products?search=basm').set('Authorization', admin); // regex fallback
    expect(partial.body.meta.total).toBe(2);
  });

  test('customers never see cost price', async () => {
    const res = await api().get(`/api/products/${ids.rice}`);
    expect(res.body.data.pricing.costPrice).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('Warehouses', () => {
  test('create warehouses + geospatial nearby search', async () => {
    let res = await api().post('/api/warehouses').set('Authorization', admin).send(warehouseBody('WH-MUM-01', [72.8777, 19.076]));
    expect(res.status).toBe(201);
    ids.mum = res.body.data._id;
    res = await api().post('/api/warehouses').set('Authorization', admin).send(warehouseBody('WH-DEL-01', [77.209, 28.6139]));
    ids.del = res.body.data._id;
    res = await api().post('/api/warehouses').set('Authorization', admin).send({ ...warehouseBody('WH-TINY', [73.85, 18.52]), capacity: 50 });
    ids.tiny = res.body.data._id;

    res = await api().get('/api/warehouses/nearby?lng=73.8567&lat=18.5204&maxDistanceKm=2000').set('Authorization', customer);
    expect(res.status).toBe(200);
    expect(res.body.data[0].code).toBe('WH-TINY'); // Pune → nearest
    expect(res.body.data[1].code).toBe('WH-MUM-01');
  });

  test('invalid coordinates → 400', async () => {
    const res = await api().post('/api/warehouses').set('Authorization', admin).send(warehouseBody('WH-BAD', [200, 100]));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('Stock in / out (transactions, batches, FEFO)', () => {
  test('stock-in creates inventory + batch + log atomically', async () => {
    const res = await api().post('/api/inventory/stock-in').set('Authorization', manager).send({
      productId: ids.rice, warehouseId: ids.mum, quantity: 50, batchNumber: 'RICE-LATE', expiryDate: new Date(Date.now() + 200 * 864e5),
    });
    expect(res.status).toBe(201);
    await api().post('/api/inventory/stock-in').set('Authorization', manager).send({
      productId: ids.rice, warehouseId: ids.mum, quantity: 30, batchNumber: 'RICE-EARLY', expiryDate: new Date(Date.now() + 20 * 864e5),
    });
    expect(await invQty(ids.rice, ids.mum)).toBe(80);
    expect(await StockBatch.countDocuments({ product: ids.rice })).toBe(2);
    expect(await InventoryLog.countDocuments({ product: ids.rice, type: 'STOCK_IN' })).toBe(2);
    await expectConsistent();
  });

  test('perishable without expiry derives it from shelf life', async () => {
    const res = await api().post('/api/inventory/stock-in').set('Authorization', manager).send({ productId: ids.rice, warehouseId: ids.del, quantity: 10 });
    expect(res.status).toBe(201);
    expect(new Date(res.body.data.batch.expiryDate).getTime()).toBeGreaterThan(Date.now() + 360 * 864e5);
  });

  test('stock-out consumes the earliest-expiring batch first (FEFO)', async () => {
    const res = await api().post('/api/inventory/stock-out').set('Authorization', manager).send({
      productId: ids.rice, warehouseId: ids.mum, quantity: 35, type: 'STOCK_OUT', reason: 'Bulk sale to store',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.consumedBatches).toEqual([
      expect.objectContaining({ batchNumber: 'RICE-EARLY', quantity: 30 }),
      expect.objectContaining({ batchNumber: 'RICE-LATE', quantity: 5 }),
    ]);
    const early = await StockBatch.findOne({ batchNumber: 'RICE-EARLY' }).lean();
    expect(early.status).toBe('depleted');
    expect(await invQty(ids.rice, ids.mum)).toBe(45);
    await expectConsistent();
  });

  test('insufficient stock → 409 and nothing changes', async () => {
    const logsBefore = await InventoryLog.countDocuments();
    const res = await api().post('/api/inventory/stock-out').set('Authorization', manager).send({
      productId: ids.rice, warehouseId: ids.mum, quantity: 999, reason: 'too much',
    });
    expect(res.status).toBe(409);
    expect(await invQty(ids.rice, ids.mum)).toBe(45);
    expect(await InventoryLog.countDocuments()).toBe(logsBefore);
  });

  test('warehouse capacity is enforced', async () => {
    const res = await api().post('/api/inventory/stock-in').set('Authorization', admin).send({ productId: ids.phone, warehouseId: ids.tiny, quantity: 51 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/capacity/);
  });

  test('stock count adjustment', async () => {
    const res = await api().post('/api/inventory/adjust').set('Authorization', manager).send({
      productId: ids.rice, warehouseId: ids.mum, countedQuantity: 40, reason: 'Cycle count',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.log.type).toBe('ADJUSTMENT');
    expect(res.body.data.log.quantityChange).toBe(-5);
    await expectConsistent();
  });

  test('database $jsonSchema rejects negative stock even from raw driver', async () => {
    await expect(
      Inventory.collection.updateOne({ product: new mongoose.Types.ObjectId(ids.rice), warehouse: new mongoose.Types.ObjectId(ids.mum) }, { $set: { quantity: -5 } }),
    ).rejects.toMatchObject({ code: 121 });
  });

  test('inventory logs are append-only', async () => {
    await expect(InventoryLog.updateOne({}, { $set: { quantityChange: 0 } })).rejects.toThrow(/append-only/);
  });
});

// ---------------------------------------------------------------------------
describe('Concurrency', () => {
  test('20 parallel stock-outs of 10 on 100 units → exactly 10 succeed, never negative', async () => {
    await stockService.stockIn({ productId: ids.phone, warehouseId: ids.mum, quantity: 100 });
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => stockService.stockOut({ productId: ids.phone, warehouseId: ids.mum, quantity: 10, reason: 'race' })),
    );
    const ok = attempts.filter((a) => a.status === 'fulfilled').length;
    expect(ok).toBe(10);
    expect(await invQty(ids.phone, ids.mum)).toBe(0);
    expect(await InventoryLog.countDocuments({ product: ids.phone, type: 'STOCK_OUT' })).toBe(10);
    await expectConsistent();
  });
});

// ---------------------------------------------------------------------------
describe('Stock transfers (multi-document transaction)', () => {
  test('pending → complete moves stock and keeps batch numbers + expiry', async () => {
    let res = await api().post('/api/stock-transfers').set('Authorization', manager).send({
      fromWarehouse: ids.mum, toWarehouse: ids.del, items: [{ product: ids.rice, quantity: 15 }], notes: 'rebalance',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.transferNumber).toMatch(/^TRF-\d{8}-\d{4}$/);
    const id = res.body.data._id;

    res = await api().post(`/api/stock-transfers/${id}/complete`).set('Authorization', manager).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(await invQty(ids.rice, ids.mum)).toBe(25);
    expect(await invQty(ids.rice, ids.del)).toBe(25);
    const moved = await StockBatch.findOne({ warehouse: ids.del, batchNumber: 'RICE-LATE' }).lean();
    const src = await StockBatch.findOne({ warehouse: ids.mum, batchNumber: 'RICE-LATE' }).lean();
    expect(moved.quantity).toBe(15);
    expect(+moved.expiryDate).toBe(+src.expiryDate);
    expect(await InventoryLog.countDocuments({ 'reference.id': id })).toBe(2); // OUT + IN
    await expectConsistent();
  });

  test('completing twice (in parallel) only succeeds once', async () => {
    const t = await api().post('/api/stock-transfers').set('Authorization', manager).send({
      fromWarehouse: ids.mum, toWarehouse: ids.del, items: [{ product: ids.rice, quantity: 5 }],
    });
    const results = await Promise.all([1, 2].map(() => api().post(`/api/stock-transfers/${t.body.data._id}/complete`).set('Authorization', manager).send({})));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await invQty(ids.rice, ids.mum)).toBe(20);
  });

  test('ROLLBACK: if any line fails, nothing moves and transfer stays pending', async () => {
    await stockService.stockIn({ productId: ids.phone, warehouseId: ids.mum, quantity: 10 });
    const t = await api().post('/api/stock-transfers').set('Authorization', manager).send({
      fromWarehouse: ids.mum, toWarehouse: ids.del,
      items: [{ product: ids.rice, quantity: 5 }, { product: ids.phone, quantity: 10 }],
    });
    expect(t.status).toBe(201);
    // Phones get sold after the transfer was requested
    await stockService.stockOut({ productId: ids.phone, warehouseId: ids.mum, quantity: 8, reason: 'sold' });

    const riceBefore = await invQty(ids.rice, ids.mum);
    const logsBefore = await InventoryLog.countDocuments();
    const res = await api().post(`/api/stock-transfers/${t.body.data._id}/complete`).set('Authorization', manager).send({});
    expect(res.status).toBe(409);
    expect(await invQty(ids.rice, ids.mum)).toBe(riceBefore);       // line 1 rolled back
    expect(await invQty(ids.rice, ids.del)).toBe(30);
    expect(await InventoryLog.countDocuments()).toBe(logsBefore);   // no partial logs
    expect((await StockTransfer.findById(t.body.data._id)).status).toBe('pending');
    await expectConsistent();

    const cancel = await api().post(`/api/stock-transfers/${t.body.data._id}/cancel`).set('Authorization', manager).send({ reason: 'stock sold' });
    expect(cancel.body.data.status).toBe('cancelled');
  });

  test('same source and destination → 400', async () => {
    const res = await api().post('/api/stock-transfers').set('Authorization', manager).send({ fromWarehouse: ids.mum, toWarehouse: ids.mum, items: [{ product: ids.rice, quantity: 1 }] });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('Batches & expiry', () => {
  test('expired batches are flagged, excluded from sale, and can be written off', async () => {
    await stockService.stockIn({ productId: ids.rice, warehouseId: ids.mum, quantity: 12, batchNumber: 'OLD-LOT', expiryDate: new Date(Date.now() + 5 * 864e5) });
    // time passes: move expiry into the past
    await StockBatch.collection.updateOne({ batchNumber: 'OLD-LOT' }, { $set: { expiryDate: new Date(Date.now() - 864e5) } });
    const { marked } = await markExpiredBatches();
    expect(marked).toBe(1);

    const total = await invQty(ids.rice, ids.mum);
    await expect(stockService.stockOut({ productId: ids.rice, warehouseId: ids.mum, quantity: total, reason: 'sell all' }))
      .rejects.toMatchObject({ statusCode: 409 });

    const list = await api().get('/api/batches?expiry=expired').set('Authorization', manager);
    expect(list.body.data[0].batchNumber).toBe('OLD-LOT');
    expect(list.body.data[0].daysToExpiry).toBeLessThan(0);

    const res = await api().post(`/api/batches/${list.body.data[0]._id}/write-off`).set('Authorization', manager).send({ reason: 'Expired' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('written_off');
    expect(await invQty(ids.rice, ids.mum)).toBe(total - 12);
    expect(await InventoryLog.countDocuments({ type: 'EXPIRED' })).toBe(1);
    await expectConsistent();
  });

  test('cannot receive already-expired goods', async () => {
    const res = await api().post('/api/inventory/stock-in').set('Authorization', manager).send({ productId: ids.rice, warehouseId: ids.mum, quantity: 5, expiryDate: '2020-01-01' });
    expect(res.status).toBe(400);
  });

  test('expiry summary', async () => {
    const res = await api().get('/api/batches/expiry-summary').set('Authorization', manager);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('expiringInWindow');
  });
});

// ---------------------------------------------------------------------------
describe('Events & Person 2 integration API', () => {
  test('low-stock event fires when crossing the reorder level', async () => {
    const events = [];
    const onLow = (e) => events.push(e);
    inventoryEvents.on(EVENTS.LOW_STOCK, onLow);
    await stockService.stockIn({ productId: ids.phone, warehouseId: ids.del, quantity: 8 }); // reorder level 5
    await stockService.stockOut({ productId: ids.phone, warehouseId: ids.del, quantity: 4, reason: 'sale' });
    inventoryEvents.off(EVENTS.LOW_STOCK, onLow);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ available: 4, reorderLevel: 5 });
  });

  test('deductForOrder joins the caller transaction — abort rolls stock back', async () => {
    const before = await invQty(ids.rice, ids.del);
    const session = await mongoose.startSession();
    session.startTransaction();
    await stockService.deductForOrder({ items: [{ productId: ids.rice, warehouseId: ids.del, quantity: 3 }], order: { id: new mongoose.Types.ObjectId(), code: 'ORD-TEST' } }, { session });
    await session.abortTransaction(); // e.g. payment failed
    await session.endSession();
    expect(await invQty(ids.rice, ids.del)).toBe(before);
  });

  test('order sale + cancellation returns units to the same batches', async () => {
    const orderId = new mongoose.Types.ObjectId();
    const before = await invQty(ids.rice, ids.del);
    await stockService.deductForOrder({ items: [{ productId: ids.rice, warehouseId: ids.del, quantity: 4 }], order: { id: orderId, code: 'ORD-1' } });
    expect(await invQty(ids.rice, ids.del)).toBe(before - 4);
    await stockService.restockForOrder({ order: { id: orderId, code: 'ORD-1' } });
    expect(await invQty(ids.rice, ids.del)).toBe(before);
    await expect(stockService.restockForOrder({ order: { id: orderId } })).rejects.toMatchObject({ statusCode: 409 });
    await expectConsistent();
  });

  test('reserve / release', async () => {
    await stockService.reserveStock({ productId: ids.rice, warehouseId: ids.del, quantity: 2 });
    const inv = await Inventory.findOne({ product: ids.rice, warehouse: ids.del });
    expect(inv.availableQuantity).toBe(inv.quantity - 2);
    await stockService.releaseReservation({ productId: ids.rice, warehouseId: ids.del, quantity: 2 });
  });

  test('findFulfilmentWarehouse picks nearest warehouse with stock', async () => {
    const wh = await stockService.findFulfilmentWarehouse({ productId: ids.rice, quantity: 1, lng: 77.1, lat: 28.7 });
    expect(wh.code).toBe('WH-DEL-01');
  });
});

// ---------------------------------------------------------------------------
describe('Reads & aggregations', () => {
  test('dashboard', async () => {
    const res = await api().get('/api/inventory/dashboard').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.data.counts.products).toBeGreaterThan(0);
    expect(res.body.data.byWarehouse.length).toBeGreaterThan(0);
  });

  test('inventory list + low stock + history', async () => {
    let res = await api().get('/api/inventory?limit=50').set('Authorization', manager);
    expect(res.body.data[0]).toHaveProperty('stockStatus');
    res = await api().get('/api/inventory/low-stock').set('Authorization', manager);
    expect(res.body.data.every((r) => ['low_stock', 'out_of_stock'].includes(r.stockStatus))).toBe(true);
    res = await api().get(`/api/inventory/logs?product=${ids.rice}&type=TRANSFER_IN,TRANSFER_OUT`).set('Authorization', manager);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].product.sku).toBeDefined();
  });

  test('product with stock cannot be deleted; empty product is soft-deleted when it has history', async () => {
    let res = await api().delete(`/api/products/${ids.rice}`).set('Authorization', admin);
    expect(res.status).toBe(409);
    await stockService.stockOut({ productId: ids.phone, warehouseId: ids.mum, quantity: 2, reason: 'clear' });
    await stockService.stockOut({ productId: ids.phone, warehouseId: ids.del, quantity: 4, reason: 'clear' });
    res = await api().delete(`/api/products/${ids.phone}`).set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('soft');
    expect((await Product.findById(ids.phone)).status).toBe('discontinued');
  });
});

// ---------------------------------------------------------------------------
describe('Compatibility with Module 3 (Smart Inventory)', () => {
  test('products carry costPrice + lowStockThreshold mirrors that stay in sync', async () => {
    const res = await api().post('/api/products').set('Authorization', admin).send({
      name: 'Sync Test Item', brand: 'Acme', category: ids.electronics, pricing: { costPrice: 120, sellingPrice: 150 }, reorderLevel: 7,
    });
    let p = await Product.findById(res.body.data._id).lean();
    expect(p).toMatchObject({ costPrice: 120, lowStockThreshold: 7 });
    await api().put(`/api/products/${p._id}`).set('Authorization', admin).send({ pricing: { costPrice: 130 }, reorderLevel: 9 });
    p = await Product.findById(p._id).lean();
    expect(p).toMatchObject({ costPrice: 130, lowStockThreshold: 9 });
  });

  test('customers never see the costPrice mirror', async () => {
    const list = await api().get('/api/products?search=Sync');
    expect(list.body.data[0].costPrice).toBeUndefined();
    const one = await api().get(`/api/products/${list.body.data[0]._id}`);
    expect(one.body.data.costPrice).toBeUndefined();
  });

  test('inventory logs carry signed quantity + reference.type', async () => {
    const out = await InventoryLog.findOne({ type: 'STOCK_OUT' }).lean();
    expect(out.quantity).toBe(out.quantityChange);
    expect(out.reference.type).toBe('MANUAL');
    const trf = await InventoryLog.findOne({ type: 'TRANSFER_OUT' }).lean();
    expect(trf.reference.type).toBe('TRANSFER');
    const sale = await InventoryLog.findOne({ type: 'SALE' }).lean();
    expect(sale.reference.type).toBe('ORDER');
  });

  test('upper-case roles (ADMIN / WAREHOUSE_MANAGER) are accepted', async () => {
    const upAdmin = `Bearer ${signDevToken('admin', { role: 'ADMIN' }).token}`;
    const upMgr = `Bearer ${signDevToken('warehouse_manager', { role: 'WAREHOUSE_MANAGER' }).token}`;
    expect((await api().get('/api/inventory/dashboard').set('Authorization', upAdmin)).status).toBe(200);
    expect((await api().get('/api/stock-transfers').set('Authorization', upMgr)).status).toBe(200);
    expect((await api().post('/api/categories').set('Authorization', upMgr).send({ name: 'Nope', code: 'NOP' })).status).toBe(403);
  });

  test('list meta includes both totalPages and pages', async () => {
    const res = await api().get('/api/products?limit=1');
    expect(res.body.meta.pages).toBe(res.body.meta.totalPages);
  });
});
