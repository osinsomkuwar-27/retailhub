const calc = require('../../utils/intelligence/calculations');
const { oid } = require('../../utils/intelligence/shared');
const prediction = require('./prediction.service');
const ReorderRule = require('../../models/intelligence/ReorderRule');
const SupplierOrder = require('../../models/intelligence/SupplierOrder');
const Supplier = require('../../models/intelligence/Supplier');
const { models } = require('../../utils/intelligence/shared');

// product -> units still expected from open supplier orders
async function getOnOrderMap() {
  const rows = await SupplierOrder.aggregate([
    { $match: { status: { $in: ['PLACED', 'PARTIAL'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', pending: { $sum: { $max: [0, { $subtract: ['$items.quantityOrdered', '$items.quantityReceived'] }] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.pending]));
}

function buildRecommendations(preds, onOrderMap, { onlyNeeded = true } = {}) {
  const out = preds.map((p) => {
    const onOrder = onOrderMap.get(String(p.productId)) || 0;
    const r = calc.computeReorder({
      available: p.available, onOrder, avgDaily: p.avgDailySales, leadTimeDays: p.leadTimeDays,
      safetyStock: p.safetyStock, reviewPeriodDays: p.reviewPeriodDays, minOrderQty: p.minOrderQty,
    });
    return {
      productId: p.productId, name: p.name, sku: p.sku, available: p.available, onOrder,
      avgDailySales: p.avgDailySales, daysUntilStockout: p.daysUntilStockout, riskStatus: p.riskStatus,
      leadTimeDays: p.leadTimeDays, safetyStock: p.safetyStock, reviewPeriodDays: p.reviewPeriodDays,
      minOrderQty: p.minOrderQty, preferredSupplier: p.preferredSupplier, ...r,
      estimatedCost: calc.round(r.recommendedQty * p.costPrice, 2),
    };
  });
  const rows = onlyNeeded ? out.filter((r) => r.needsReorder && r.recommendedQty > 0) : out;
  return rows.sort((a, b) => prediction.RISK_ORDER[a.riskStatus] - prediction.RISK_ORDER[b.riskStatus]
    || (a.daysUntilStockout ?? 1e5) - (b.daysUntilStockout ?? 1e5));
}

async function getRecommendations(opts = {}) {
  const [preds, onOrder] = await Promise.all([prediction.getPredictions(opts), getOnOrderMap()]);
  const rows = buildRecommendations(preds, onOrder, opts);
  const supplierIds = [...new Set(rows.map((r) => r.preferredSupplier).filter(Boolean).map(String))];
  const suppliers = supplierIds.length ? await Supplier.find({ _id: { $in: supplierIds } }).select('name code').lean() : [];
  const sMap = new Map(suppliers.map((s) => [String(s._id), s]));
  return rows.map((r) => ({ ...r, supplier: r.preferredSupplier ? sMap.get(String(r.preferredSupplier)) || null : null }));
}

async function listRules() {
  const { Product } = models;
  return ReorderRule.aggregate([
    { $lookup: { from: Product.collection.name, localField: 'product', foreignField: '_id',
        pipeline: [{ $project: { name: 1, sku: 1 } }], as: 'product' } },
    { $unwind: '$product' },
    { $sort: { 'product.name': 1 } },
  ]);
}

const upsertRule = (productId, body, userId) =>
  ReorderRule.findOneAndUpdate(
    { product: oid(productId) },
    { $set: { ...pick(body, ['safetyStock', 'leadTimeDays', 'reviewPeriodDays', 'minOrderQty', 'preferredSupplier']), updatedBy: userId } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

function pick(o, keys) { return keys.reduce((a, k) => (o[k] !== undefined ? { ...a, [k]: o[k] } : a), {}); }

module.exports = { getOnOrderMap, buildRecommendations, getRecommendations, listRules, upsertRule };