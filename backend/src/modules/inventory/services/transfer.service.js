const mongoose = require('mongoose');
const { StockTransfer, Warehouse, Product, Inventory, Counter } = require('../models');
const { ApiError, parsePagination, buildMeta, escapeRegex } = require('../utils/http');
const { MOVEMENT_TYPES: T } = require('../utils/constants');
const { EVENTS, audit } = require('../utils/events');
const { assertWarehouseAccess } = require('../middleware/auth');
const { withStockTransaction, _stockIn, _stockOut } = require('./stock.service');

const POPULATE = [
  { path: 'fromWarehouse', select: 'code name address.city' },
  { path: 'toWarehouse', select: 'code name address.city' },
  { path: 'items.product', select: 'sku name unit' },
];

async function nextTransferNumber() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = await Counter.next(`transfer:${day}`);
  return `TRF-${day}-${String(seq).padStart(4, '0')}`;
}

function mergeItems(items) {
  const map = new Map();
  for (const it of items) {
    const key = String(it.product);
    map.set(key, (map.get(key) || 0) + Number(it.quantity));
  }
  return [...map].map(([product, quantity]) => ({ product, quantity }));
}

async function createTransfer(data, user) {
  const { fromWarehouse, toWarehouse, notes, executeNow } = data;
  if (String(fromWarehouse) === String(toWarehouse)) {
    throw ApiError.badRequest('Source and destination warehouses must be different');
  }
  assertWarehouseAccess(user, fromWarehouse);

  const [from, to] = await Promise.all([Warehouse.findById(fromWarehouse).lean(), Warehouse.findById(toWarehouse).lean()]);
  if (!from || !to) throw ApiError.notFound('Warehouse not found');
  if (!from.isActive || !to.isActive) throw ApiError.conflict('Both warehouses must be active');

  const items = mergeItems(data.items);
  const products = await Product.find({ _id: { $in: items.map((i) => i.product) } }).select('sku name').lean();
  if (products.length !== items.length) throw ApiError.badRequest('One or more products do not exist');

  // Early (non-binding) availability check so the user gets a clear message now.
  // The binding check happens atomically when the transfer is completed.
  const stock = await Inventory.find({ warehouse: from._id, product: { $in: items.map((i) => i.product) } }).lean();
  const shortages = items
    .map((i) => {
      const row = stock.find((s) => String(s.product) === String(i.product));
      const available = row ? row.quantity - row.reservedQuantity : 0;
      const p = products.find((x) => String(x._id) === String(i.product));
      return { productId: i.product, sku: p.sku, requested: i.quantity, available };
    })
    .filter((s) => s.available < s.requested);
  if (shortages.length) throw ApiError.conflict(`Insufficient stock in ${from.code}`, shortages);

  const transfer = await StockTransfer.create({
    transferNumber: await nextTransferNumber(),
    fromWarehouse: from._id,
    toWarehouse: to._id,
    items,
    notes,
    requestedBy: user.id,
    statusHistory: [{ status: 'pending', changedBy: user.id, note: 'Transfer requested' }],
  });
  audit('transfer.created', 'StockTransfer', transfer._id, user.id, { transferNumber: transfer.transferNumber });

  if (executeNow) return completeTransfer(transfer._id, user);
  return StockTransfer.findById(transfer._id).populate(POPULATE).lean();
}

/**
 * THE key multi-document transaction of Module 1.
 * In ONE transaction: mark transfer completed, deduct every line from the
 * source (FEFO batches), add the same batches at the destination, and write
 * TRANSFER_OUT + TRANSFER_IN logs. Any failure → everything rolls back and
 * the transfer stays "pending".
 */
async function completeTransfer(id, user, note = '') {
  const result = await withStockTransaction(async (session, ctx) => {
    // Atomic state transition prevents double-completion by two clicks/users
    const transfer = await StockTransfer.findOneAndUpdate(
      { _id: id, status: 'pending' },
      {
        $set: { status: 'completed', completedAt: new Date(), completedBy: user.id },
        $push: { statusHistory: { status: 'completed', changedBy: user.id, note: note || 'Transfer executed' } },
      },
      { returnDocument: 'after', session },
    );
    if (!transfer) {
      const existing = await StockTransfer.findById(id).session(session).lean();
      if (!existing) throw ApiError.notFound('Transfer not found');
      throw ApiError.conflict(`Transfer is already ${existing.status}`);
    }
    assertWarehouseAccess(user, transfer.fromWarehouse);

    const reference = { kind: 'StockTransfer', id: transfer._id, code: transfer.transferNumber };
    for (const item of transfer.items) {
      const { consumed } = await _stockOut(session, ctx, {
        productId: item.product, warehouseId: transfer.fromWarehouse, quantity: item.quantity,
        type: T.TRANSFER_OUT, reference, userId: user.id, reason: `Transfer to destination (${transfer.transferNumber})`,
      });
      for (const b of consumed) {
        await _stockIn(session, ctx, {
          productId: item.product, warehouseId: transfer.toWarehouse, quantity: b.quantity,
          batchNumber: b.batchNumber, expiryDate: b.expiryDate, costPrice: b.costPrice,
          type: T.TRANSFER_IN, sourceTransfer: transfer._id, reference, userId: user.id,
          reason: `Transfer from source (${transfer.transferNumber})`,
        });
      }
      item.batches = consumed;
    }
    await transfer.save({ session });
    ctx.events.push({ name: EVENTS.TRANSFER_COMPLETED, payload: { transferId: transfer._id, transferNumber: transfer.transferNumber } });
    return transfer._id;
  });

  audit('transfer.completed', 'StockTransfer', result, user.id);
  return StockTransfer.findById(result).populate(POPULATE).lean();
}

async function cancelTransfer(id, user, reason = '') {
  const transfer = await StockTransfer.findById(id).lean();
  if (!transfer) throw ApiError.notFound('Transfer not found');
  assertWarehouseAccess(user, transfer.fromWarehouse);
  const updated = await StockTransfer.findOneAndUpdate(
    { _id: id, status: 'pending' },
    {
      $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason },
      $push: { statusHistory: { status: 'cancelled', changedBy: user.id, note: reason || 'Cancelled' } },
    },
    { returnDocument: 'after' },
  ).populate(POPULATE).lean();
  if (!updated) throw ApiError.conflict(`Only pending transfers can be cancelled (this one is ${transfer.status})`);
  audit('transfer.cancelled', 'StockTransfer', id, user.id, { reason });
  return updated;
}

async function listTransfers(query, user) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: ['createdAt', 'transferNumber', 'status'] });
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) filter.transferNumber = { $regex: escapeRegex(query.search.toUpperCase()) };
  if (query.warehouse) filter.$or = [{ fromWarehouse: query.warehouse }, { toWarehouse: query.warehouse }];
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(`${query.to}T23:59:59.999Z`);
  }
  if (user.role === 'warehouse_manager' && user.warehouses?.length) {
    const ids = user.warehouses.map((w) => new mongoose.Types.ObjectId(String(w)));
    filter.$and = [{ $or: [{ fromWarehouse: { $in: ids } }, { toWarehouse: { $in: ids } }] }];
  }
  const [data, total] = await Promise.all([
    StockTransfer.find(filter).sort(sort).skip(skip).limit(limit).populate(POPULATE).lean(),
    StockTransfer.countDocuments(filter),
  ]);
  return { data, meta: buildMeta(total, page, limit) };
}

async function getTransfer(id) {
  const t = await StockTransfer.findById(id)
    .populate(POPULATE)
    .lean();
  if (!t) throw ApiError.notFound('Transfer not found');
  return t;
}

module.exports = { createTransfer, completeTransfer, cancelTransfer, listTransfers, getTransfer };
