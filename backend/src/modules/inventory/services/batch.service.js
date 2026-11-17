// Batch & expiry management.
const mongoose = require('mongoose');
const { StockBatch } = require('../models');
const { ApiError, parsePagination, buildMeta, escapeRegex } = require('../utils/http');
const { MOVEMENT_TYPES: T } = require('../utils/constants');
const { audit, emitSafe } = require('../utils/events');
const { assertWarehouseAccess } = require('../middleware/auth');
const { withStockTransaction, _stockOut } = require('./stock.service');
const env = require('../../../config/env');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const DAY = 86400000;

/**
 * expiry filter values:
 *   expired  → expiryDate <= now (still holding stock)
 *   expiring → now < expiryDate <= now + days
 *   fresh    → expiryDate > now + days (or no expiry)
 */
async function listBatches(query, user) {
  const { page, limit, skip, sort } = parsePagination(query, {
    allowedSort: ['expiryDate', 'receivedAt', 'quantity', 'batchNumber', 'createdAt'], defaultSort: 'expiryDate',
  });
  const now = new Date();
  const days = Number(query.days) || env.expiryWarningDays;
  const match = {};
  if (query.product) match.product = oid(query.product);
  if (query.warehouse) match.warehouse = oid(query.warehouse);
  if (user?.role === 'warehouse_manager' && user.warehouses?.length && !query.warehouse) {
    match.warehouse = { $in: user.warehouses.map(oid) };
  }
  if (query.status) match.status = query.status;
  if (query.inStock !== 'false') match.quantity = { $gt: 0 };
  if (query.search) match.batchNumber = { $regex: escapeRegex(query.search.toUpperCase()) };
  if (query.expiry === 'expired') match.expiryDate = { $ne: null, $lte: now };
  if (query.expiry === 'expiring') match.expiryDate = { $gt: now, $lte: new Date(now.getTime() + days * DAY) };
  if (query.expiry === 'fresh') match.$or = [{ expiryDate: null }, { expiryDate: { $gt: new Date(now.getTime() + days * DAY) } }];

  // Sorting by expiry: batches without an expiry date go last
  let sortStage = sort;
  if ('expiryDate' in sort) sortStage = { expirySort: sort.expiryDate, _id: 1 };

  const [res] = await StockBatch.aggregate([
    { $match: match },
    { $addFields: { expirySort: { $ifNull: ['$expiryDate', new Date('9999-12-31')] } } },
    {
      $facet: {
        data: [
          { $sort: sortStage }, { $skip: skip }, { $limit: limit }, { $project: { expirySort: 0 } },
          { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product', pipeline: [{ $project: { sku: 1, name: 1, unit: 1 } }] } },
          { $unwind: '$product' },
          { $lookup: { from: 'warehouses', localField: 'warehouse', foreignField: '_id', as: 'warehouse', pipeline: [{ $project: { code: 1, name: 1 } }] } },
          { $unwind: '$warehouse' },
          {
            $addFields: {
              daysToExpiry: {
                $cond: [{ $eq: ['$expiryDate', null] }, null, { $dateDiff: { startDate: now, endDate: '$expiryDate', unit: 'day' } }],
              },
              value: { $round: [{ $multiply: ['$quantity', '$costPrice'] }, 2] },
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  return { data: res.data, meta: buildMeta(res.total[0]?.count || 0, page, limit) };
}

async function getBatch(id) {
  const b = await StockBatch.findById(id)
    .populate('product', 'sku name unit isPerishable')
    .populate('warehouse', 'code name')
    .populate('sourceTransfer', 'transferNumber')
    .lean();
  if (!b) throw ApiError.notFound('Batch not found');
  return b;
}

async function updateBatch(id, data, user) {
  const b = await StockBatch.findById(id);
  if (!b) throw ApiError.notFound('Batch not found');
  assertWarehouseAccess(user, b.warehouse);
  ['notes', 'expiryDate', 'manufactureDate'].forEach((k) => { if (data[k] !== undefined) b[k] = data[k]; });
  // Re-activate if expiry was corrected into the future
  if (b.status === 'expired' && b.expiryDate && b.expiryDate > new Date() && b.quantity > 0) b.status = 'active';
  await b.save();
  audit('batch.updated', 'StockBatch', b._id, user.id, data);
  return getBatch(b._id);
}

/** Remove all remaining units of a batch (expired / damaged / recalled) in one transaction. */
async function writeOffBatch(id, { reason, type = T.EXPIRED }, user) {
  const batch = await StockBatch.findById(id).lean();
  if (!batch) throw ApiError.notFound('Batch not found');
  assertWarehouseAccess(user, batch.warehouse);
  if (batch.quantity <= 0) throw ApiError.badRequest('Batch has no remaining stock');

  await withStockTransaction(async (session, ctx) => {
    await _stockOut(session, ctx, {
      productId: batch.product, warehouseId: batch.warehouse, quantity: batch.quantity,
      batchNumber: batch.batchNumber, allowExpired: true, type,
      reference: { kind: 'ExpiryWriteOff', id: batch._id, code: batch.batchNumber },
      reason: reason || `Batch ${batch.batchNumber} written off`, userId: user.id,
    });
    await StockBatch.updateOne({ _id: batch._id }, { $set: { status: 'written_off' } }, { session });
  });
  audit('batch.writtenOff', 'StockBatch', batch._id, user.id, { quantity: batch.quantity, type });
  return getBatch(batch._id);
}

/** Dashboard numbers for the Batch & Expiry page. */
async function expirySummary(user, days = env.expiryWarningDays) {
  const now = new Date();
  const soon = new Date(now.getTime() + Number(days) * DAY);
  const match = { quantity: { $gt: 0 }, status: { $in: ['active', 'expired'] } };
  if (user?.role === 'warehouse_manager' && user.warehouses?.length) match.warehouse = { $in: user.warehouses.map(oid) };

  const bucket = (cond) => [{ $match: cond }, { $group: { _id: null, batches: { $sum: 1 }, units: { $sum: '$quantity' }, value: { $sum: { $multiply: ['$quantity', '$costPrice'] } } } }];
  const [r] = await StockBatch.aggregate([
    { $match: match },
    {
      $facet: {
        expired: bucket({ expiryDate: { $ne: null, $lte: now } }),
        within7: bucket({ expiryDate: { $gt: now, $lte: new Date(now.getTime() + 7 * DAY) } }),
        withinWindow: bucket({ expiryDate: { $gt: now, $lte: soon } }),
        noExpiry: bucket({ expiryDate: null }),
        // timeline: units expiring per week for the next 12 weeks
        timeline: [
          { $match: { expiryDate: { $gt: now, $lte: new Date(now.getTime() + 84 * DAY) } } },
          { $group: { _id: { $floor: { $divide: [{ $subtract: ['$expiryDate', now] }, 7 * DAY] } }, units: { $sum: '$quantity' }, batches: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, week: { $add: ['$_id', 1] }, units: 1, batches: 1 } },
        ],
      },
    },
  ]);
  const pick = (a) => ({ batches: a[0]?.batches || 0, units: a[0]?.units || 0, value: Math.round((a[0]?.value || 0) * 100) / 100 });
  return {
    windowDays: Number(days),
    expired: pick(r.expired),
    expiringIn7Days: pick(r.within7),
    expiringInWindow: pick(r.withinWindow),
    noExpiry: pick(r.noExpiry),
    timeline: r.timeline,
  };
}

/** Called by the daily job: flag batches whose expiry date has passed. */
async function markExpiredBatches() {
  const now = new Date();
  const expiredNow = await StockBatch.find({ status: 'active', expiryDate: { $ne: null, $lte: now }, quantity: { $gt: 0 } })
    .select('_id batchNumber product warehouse quantity expiryDate').lean();
  if (!expiredNow.length) return { marked: 0 };
  const res = await StockBatch.updateMany(
    { _id: { $in: expiredNow.map((b) => b._id) }, status: 'active' },
    { $set: { status: 'expired' } },
  );
  // Person 3 can subscribe to create expiry_alerts
  emitSafe('inventory.batchesExpired', { batches: expiredNow, at: now });
  return { marked: res.modifiedCount };
}

module.exports = { listBatches, getBatch, updateBatch, writeOffBatch, expirySummary, markExpiredBatches };
