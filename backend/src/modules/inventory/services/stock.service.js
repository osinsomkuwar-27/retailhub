// =============================================================================
// STOCK SERVICE — the only code allowed to change stock levels.
//
// Every write here runs inside a multi-document transaction that touches:
//   inventory (live level)  +  stock_batches (lots)  +  inventory_logs (history)
// so the three collections can never disagree.
//
// Concurrency: stock is reduced with a conditional atomic update
//   findOneAndUpdate({ ..., available >= qty }, { $inc: { quantity: -qty } })
// so two simultaneous requests can never push stock below zero.
// =============================================================================
const mongoose = require('mongoose');
const { Inventory, StockBatch, InventoryLog, Product, Warehouse, Counter } = require('../models');
const { ApiError } = require('../utils/http');
const { MOVEMENT_TYPES: T } = require('../utils/constants');
const { runInTransaction } = require('../utils/transaction');
const { EVENTS, emitSafe } = require('../utils/events');

const toId = (v) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);
const ymd = (d = new Date()) => d.toISOString().slice(0, 10).replace(/-/g, '');

// ---------------------------------------------------------------------------
// Transaction + event plumbing
// ---------------------------------------------------------------------------

/**
 * Runs fn(session, ctx) in a transaction and emits ctx.events after COMMIT.
 * If the caller passes its own session (Person 2's order transaction), we join
 * it and park the events on the session — call emitPendingEvents(session)
 * after your commit.
 */
async function withStockTransaction(fn, externalSession) {
  if (externalSession) {
    const ctx = { events: [] };
    const result = await fn(externalSession, ctx);
    externalSession.inventoryEvents = (externalSession.inventoryEvents || []).concat(ctx.events);
    return result;
  }
  let ctx;
  const result = await runInTransaction(async (session) => {
    ctx = { events: [] }; // reset on every retry attempt
    return fn(session, ctx);
  });
  ctx.events.forEach((e) => emitSafe(e.name, e.payload));
  return result;
}

function emitPendingEvents(session) {
  (session?.inventoryEvents || []).forEach((e) => emitSafe(e.name, e.payload));
  if (session) session.inventoryEvents = [];
}

async function generateBatchNumber(session, prefix = 'B') {
  const day = ymd();
  const seq = await Counter.next(`batch:${prefix}:${day}`, session);
  return `${prefix}${day.slice(2)}-${String(seq).padStart(4, '0')}`;
}

async function loadProduct(productId, session) {
  const product = await Product.findById(productId).session(session).lean();
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

async function loadWarehouse(warehouseId, session, { mustBeActive = true } = {}) {
  const warehouse = await Warehouse.findById(warehouseId).session(session).lean();
  if (!warehouse) throw ApiError.notFound('Warehouse not found');
  if (mustBeActive && !warehouse.isActive) throw ApiError.conflict(`Warehouse ${warehouse.code} is inactive`);
  return warehouse;
}

async function warehouseUsedCapacity(warehouseId, session) {
  const [row] = await Inventory.aggregate([
    { $match: { warehouse: toId(warehouseId) } },
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ]).session(session);
  return row?.total || 0;
}

// ---------------------------------------------------------------------------
// Core primitives (always called with a session)
// ---------------------------------------------------------------------------

async function _stockIn(session, ctx, p) {
  const quantity = Number(p.quantity);
  const type = p.type || T.STOCK_IN;
  if (!Number.isInteger(quantity) || quantity <= 0) throw ApiError.badRequest('Quantity must be a positive whole number');

  const product = await loadProduct(p.productId, session);
  if (type === T.STOCK_IN && product.status !== 'active') {
    throw ApiError.conflict(`Cannot receive stock for a ${product.status} product`);
  }
  const warehouse = await loadWarehouse(p.warehouseId, session);

  // Capacity check
  const used = await warehouseUsedCapacity(warehouse._id, session);
  if (used + quantity > warehouse.capacity) {
    throw ApiError.conflict(
      `Warehouse ${warehouse.code} capacity exceeded (used ${used} of ${warehouse.capacity}, adding ${quantity})`,
    );
  }

  // Batch: reuse an existing lot (same number) or create a new one
  const batchNumber = p.batchNumber
    ? String(p.batchNumber).toUpperCase().trim()
    : await generateBatchNumber(session, type === T.ADJUSTMENT ? 'ADJ' : 'B');
  let batch = await StockBatch.findOne({ product: product._id, warehouse: warehouse._id, batchNumber }).session(session);

  let expiryDate = p.expiryDate ? new Date(p.expiryDate) : batch?.expiryDate || null;
  if (product.isPerishable && !expiryDate) {
    if (product.shelfLifeDays) expiryDate = addDays(p.manufactureDate || new Date(), product.shelfLifeDays);
    else throw ApiError.badRequest('Expiry date is required for perishable products');
  }
  if (type === T.STOCK_IN && expiryDate && expiryDate <= new Date()) {
    throw ApiError.badRequest('Cannot receive stock that has already expired');
  }

  if (batch) {
    if (p.expiryDate && batch.expiryDate && +new Date(p.expiryDate) !== +batch.expiryDate) {
      throw ApiError.conflict(`Batch ${batchNumber} already exists with a different expiry date`);
    }
    batch.quantity += quantity;
    batch.initialQuantity += quantity;
    if (batch.status === 'depleted') batch.status = 'active';
    await batch.save({ session });
  } else {
    [batch] = await StockBatch.create([{
      batchNumber,
      product: product._id,
      warehouse: warehouse._id,
      initialQuantity: quantity,
      quantity,
      costPrice: p.costPrice ?? product.pricing?.costPrice ?? 0,
      manufactureDate: p.manufactureDate || undefined,
      expiryDate,
      supplier: p.supplierId || null,
      sourceTransfer: p.sourceTransfer || null,
      notes: p.batchNotes || '',
    }], { session });
  }

  // Atomic upsert of the live stock row
  const inventory = await Inventory.findOneAndUpdate(
    { product: product._id, warehouse: warehouse._id },
    { $inc: { quantity }, $set: { lastStockInAt: new Date() }, $setOnInsert: { reservedQuantity: 0 } },
    { returnDocument: 'after', upsert: true, session, setDefaultsOnInsert: true },
  );

  const [log] = await InventoryLog.create([{
    product: product._id,
    warehouse: warehouse._id,
    type,
    quantityChange: quantity,
    quantityBefore: inventory.quantity - quantity,
    quantityAfter: inventory.quantity,
    batches: [{ batchNumber, quantity }],
    unitCost: batch.costPrice,
    reference: p.reference || { kind: 'Manual' },
    reason: p.reason || '',
    performedBy: p.userId || null,
  }], { session });

  ctx.events.push({
    name: EVENTS.STOCK_CHANGED,
    payload: {
      productId: product._id, warehouseId: warehouse._id, type, quantityChange: quantity,
      quantityAfter: inventory.quantity, logId: log._id, userId: p.userId,
    },
  });

  return { inventory, batch, log };
}

/**
 * Consumes batches FEFO (first-expiry-first-out). Expired batches are skipped
 * unless allowExpired (write-offs / damage).
 */
async function consumeBatches(session, { productId, warehouseId, quantity, batchNumber, allowExpired }) {
  const now = new Date();
  const filter = { product: toId(productId), warehouse: toId(warehouseId), quantity: { $gt: 0 } };
  if (batchNumber) filter.batchNumber = String(batchNumber).toUpperCase();
  if (allowExpired) {
    filter.status = { $in: ['active', 'expired'] };
  } else {
    filter.status = 'active';
    filter.$or = [{ expiryDate: null }, { expiryDate: { $gt: now } }];
  }

  const batches = await StockBatch.find(filter).sort({ expiryDate: 1, receivedAt: 1, _id: 1 }).session(session).lean();
  let remaining = quantity;
  const consumed = [];

  for (const b of batches) {
    if (remaining === 0) break;
    const take = Math.min(remaining, b.quantity);
    // Pipeline update: decrement and flip to "depleted" at zero, atomically
    const res = await StockBatch.updateOne(
      { _id: b._id, quantity: { $gte: take } },
      [
        { $set: { quantity: { $subtract: ['$quantity', take] } } },
        { $set: { status: { $cond: [{ $eq: ['$quantity', 0] }, 'depleted', '$status'] } } },
      ],
      { session, updatePipeline: true }, // Mongoose 9: pipeline updates must be opted in
    );
    if (res.modifiedCount !== 1) throw ApiError.conflict('Batch changed concurrently — please retry');
    remaining -= take;
    consumed.push({ batchNumber: b.batchNumber, quantity: take, expiryDate: b.expiryDate, costPrice: b.costPrice });
  }

  if (remaining > 0) {
    const usable = quantity - remaining;
    throw ApiError.conflict(
      batchNumber
        ? `Batch ${batchNumber} has only ${usable} usable unit(s)`
        : `Only ${usable} unit(s) are in usable (non-expired) batches. Write off expired batches first.`,
    );
  }
  return consumed;
}

async function _stockOut(session, ctx, p) {
  const quantity = Number(p.quantity);
  const type = p.type || T.STOCK_OUT;
  if (!Number.isInteger(quantity) || quantity <= 0) throw ApiError.badRequest('Quantity must be a positive whole number');

  const product = await loadProduct(p.productId, session);
  const warehouse = await loadWarehouse(p.warehouseId, session, { mustBeActive: false });

  const filter = { product: product._id, warehouse: warehouse._id };
  const update = { $set: { lastStockOutAt: new Date() } };
  if (p.fromReserved) {
    // Order fulfilment of stock reserved earlier by Person 2
    filter.quantity = { $gte: quantity };
    filter.reservedQuantity = { $gte: quantity };
    update.$inc = { quantity: -quantity, reservedQuantity: -quantity };
  } else {
    // Only unreserved stock may be removed
    filter.$expr = { $gte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, quantity] };
    update.$inc = { quantity: -quantity };
  }

  const inventory = await Inventory.findOneAndUpdate(filter, update, { returnDocument: 'after', session });
  if (!inventory) {
    const cur = await Inventory.findOne({ product: product._id, warehouse: warehouse._id }).session(session).lean();
    const available = cur ? cur.quantity - cur.reservedQuantity : 0;
    throw ApiError.conflict(
      `Insufficient stock for ${product.sku} in ${warehouse.code}: available ${available}, requested ${quantity}`,
      [{ productId: product._id, warehouseId: warehouse._id, available, requested: quantity }],
    );
  }

  const consumed = await consumeBatches(session, {
    productId: product._id, warehouseId: warehouse._id, quantity,
    batchNumber: p.batchNumber, allowExpired: p.allowExpired,
  });

  const unitCost = consumed.reduce((s, b) => s + b.costPrice * b.quantity, 0) / quantity;
  const [log] = await InventoryLog.create([{
    product: product._id,
    warehouse: warehouse._id,
    type,
    quantityChange: -quantity,
    quantityBefore: inventory.quantity + quantity,
    quantityAfter: inventory.quantity,
    batches: consumed.map(({ batchNumber, quantity: q }) => ({ batchNumber, quantity: q })),
    unitCost: Math.round(unitCost * 100) / 100,
    reference: p.reference || { kind: 'Manual' },
    reason: p.reason || '',
    performedBy: p.userId || null,
  }], { session });

  ctx.events.push({
    name: EVENTS.STOCK_CHANGED,
    payload: {
      productId: product._id, warehouseId: warehouse._id, type, quantityChange: -quantity,
      quantityAfter: inventory.quantity, logId: log._id, userId: p.userId,
    },
  });

  // Low-stock threshold crossing → event for Person 3's alert engine
  const reorderLevel = inventory.reorderLevel ?? product.reorderLevel ?? 0;
  const availableAfter = inventory.quantity - inventory.reservedQuantity;
  const availableBefore = availableAfter + (p.fromReserved ? 0 : quantity);
  if (availableAfter <= reorderLevel && availableBefore > reorderLevel) {
    ctx.events.push({
      name: EVENTS.LOW_STOCK,
      payload: {
        productId: product._id, sku: product.sku, name: product.name,
        warehouseId: warehouse._id, warehouseCode: warehouse.code,
        available: availableAfter, reorderLevel,
      },
    });
  }

  return { inventory, consumed, log };
}

// ---------------------------------------------------------------------------
// Public operations (each = one business transaction)
// ---------------------------------------------------------------------------

const stockIn = (params, { session } = {}) =>
  withStockTransaction((s, ctx) => _stockIn(s, ctx, { ...params, type: params.type || T.STOCK_IN }), session);

const stockOut = (params, { session } = {}) =>
  withStockTransaction((s, ctx) => _stockOut(s, ctx, { ...params, type: params.type || T.STOCK_OUT }), session);

/** Physical stock count: set quantity to what was counted. */
const adjustStock = (params, { session } = {}) =>
  withStockTransaction(async (s, ctx) => {
    const counted = Number(params.countedQuantity);
    const cur = await Inventory.findOne({ product: params.productId, warehouse: params.warehouseId }).session(s).lean();
    const current = cur?.quantity || 0;
    const diff = counted - current;
    if (diff === 0) throw ApiError.badRequest(`Counted quantity equals current stock (${current}); nothing to adjust`);
    const reason = params.reason || `Stock count: system ${current}, counted ${counted}`;
    if (diff > 0) {
      return _stockIn(s, ctx, { ...params, quantity: diff, type: T.ADJUSTMENT, reason });
    }
    return _stockOut(s, ctx, { ...params, quantity: -diff, type: T.ADJUSTMENT, reason, allowExpired: true });
  }, session);

// ---------------------------------------------------------------------------
// Integration API for Person 2 (orders). All accept { session } to join the
// order transaction so order + payment + stock commit or roll back together.
// ---------------------------------------------------------------------------

/** Hold stock for a pending order/cart (no movement log — nothing left the shelf). */
async function reserveStock({ productId, warehouseId, quantity }, { session } = {}) {
  const inv = await Inventory.findOneAndUpdate(
    { product: productId, warehouse: warehouseId, $expr: { $gte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, quantity] } },
    { $inc: { reservedQuantity: quantity } },
    { returnDocument: 'after', session },
  );
  if (!inv) throw ApiError.conflict('Not enough available stock to reserve');
  return inv;
}

async function releaseReservation({ productId, warehouseId, quantity }, { session } = {}) {
  const inv = await Inventory.findOneAndUpdate(
    { product: productId, warehouse: warehouseId, reservedQuantity: { $gte: quantity } },
    { $inc: { reservedQuantity: -quantity } },
    { returnDocument: 'after', session },
  );
  if (!inv) throw ApiError.conflict('Reservation not found or already released');
  return inv;
}

/**
 * Deduct stock for an order. items: [{ productId, warehouseId, quantity }]
 * order: { id, code }.  Throws (→ rollback) if any line is short.
 */
const deductForOrder = ({ items, order, userId, fromReserved = false }, { session } = {}) =>
  withStockTransaction(async (s, ctx) => {
    const results = [];
    for (const it of items) {
      results.push(await _stockOut(s, ctx, {
        ...it, type: T.SALE, userId, fromReserved,
        reference: { kind: 'Order', id: order.id, code: order.code || '' },
        reason: `Order ${order.code || order.id}`,
      }));
    }
    return results;
  }, session);

/** Put stock back for a cancelled/returned order — into the SAME batches it came from. */
const restockForOrder = ({ order, userId, reason }, { session } = {}) =>
  withStockTransaction(async (s, ctx) => {
    const saleLogs = await InventoryLog.find({ type: T.SALE, 'reference.kind': 'Order', 'reference.id': order.id }).session(s).lean();
    if (!saleLogs.length) throw ApiError.notFound('No stock deductions found for this order');
    const already = await InventoryLog.exists({ type: T.RETURN, 'reference.kind': 'Order', 'reference.id': order.id }).session(s);
    if (already) throw ApiError.conflict('Stock for this order has already been returned');
    const results = [];
    for (const log of saleLogs) {
      for (const b of log.batches) {
        results.push(await _stockIn(s, ctx, {
          productId: log.product, warehouseId: log.warehouse, quantity: b.quantity, batchNumber: b.batchNumber,
          type: T.RETURN, userId, reason: reason || `Order ${order.code || order.id} cancelled`,
          reference: { kind: 'Order', id: order.id, code: order.code || '' },
        }));
      }
    }
    return results;
  }, session);

/**
 * Pick a warehouse that can fulfil `quantity`. If lng/lat given, nearest first ($geoNear).
 */
async function findFulfilmentWarehouse({ productId, quantity, lng, lat }) {
  const stockLookup = {
    $lookup: {
      from: 'inventory',
      let: { wid: '$_id' },
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$warehouse', '$$wid'] }, { $eq: ['$product', toId(productId)] }] } } },
        { $project: { _id: 0, available: { $subtract: ['$quantity', '$reservedQuantity'] } } },
      ],
      as: 'stock',
    },
  };
  const pipeline = [];
  if (lng != null && lat != null) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        distanceField: 'distanceMeters', query: { isActive: true }, spherical: true,
      },
    });
  } else {
    pipeline.push({ $match: { isActive: true } });
  }
  pipeline.push(
    stockLookup,
    { $addFields: { available: { $ifNull: [{ $first: '$stock.available' }, 0] } } },
    { $match: { available: { $gte: Number(quantity) } } },
  );
  if (lng == null || lat == null) pipeline.push({ $sort: { available: -1 } });
  pipeline.push({ $limit: 1 }, { $project: { stock: 0 } });
  const [wh] = await Warehouse.aggregate(pipeline);
  return wh || null;
}

module.exports = {
  // used by other Module 1 services
  withStockTransaction, _stockIn, _stockOut, emitPendingEvents,
  // public
  stockIn, stockOut, adjustStock,
  reserveStock, releaseReservation, deductForOrder, restockForOrder, findFulfilmentWarehouse,
};
