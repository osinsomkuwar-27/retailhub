const cfg = require('../../config/intelligence.config');
const calc = require('../../utils/intelligence/calculations');
const { models, oid, DAY, escapeRegex } = require('../../utils/intelligence/shared');
const SalesHistory = require('../../models/intelligence/SalesHistory');
const ReorderRule = require('../../models/intelligence/ReorderRule');

const RISK_ORDER = { OUT_OF_STOCK: 0, CRITICAL: 1, WARNING: 2, HEALTHY: 3, NO_DEMAND: 4 };

// Inventory -> $group per product -> $lookup product + reorder rule
async function getStockRows(productId) {
  const { Inventory, Product } = models;
  return Inventory.aggregate([
    ...(productId ? [{ $match: { product: oid(productId) } }] : []),
    { $group: { _id: '$product', available: { $sum: '$quantity' }, warehouses: { $push: { warehouse: '$warehouse', quantity: '$quantity' } } } },
    { $lookup: { from: Product.collection.name, localField: '_id', foreignField: '_id',
        pipeline: [{ $project: { name: 1, sku: 1, costPrice: 1, lowStockThreshold: 1 } }], as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: ReorderRule.collection.name, localField: '_id', foreignField: 'product', as: 'rule' } },
    { $unwind: { path: '$rule', preserveNullAndEmptyArrays: true } },
  ]);
}

// Time-series sales_history -> $match + $group (net units, cancellations are negative rows)
async function getDemandMap(windowDays, productId) {
  const since = new Date(Date.now() - windowDays * DAY);
  const rows = await SalesHistory.aggregate([
    { $match: { timestamp: { $gte: since }, ...(productId ? { 'meta.product': oid(productId) } : {}) } },
    { $group: { _id: '$meta.product', totalSold: { $sum: '$quantity' },
        lastSale: { $max: { $cond: [{ $gt: ['$quantity', 0] }, '$timestamp', null] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

async function getWarehouseDemand(windowDays) {
  const since = new Date(Date.now() - windowDays * DAY);
  return SalesHistory.aggregate([
    { $match: { timestamp: { $gte: since }, 'meta.warehouse': { $ne: null } } },
    { $group: { _id: { product: '$meta.product', warehouse: '$meta.warehouse' }, sold: { $sum: '$quantity' } } },
  ]);
}

async function getPredictions({ windowDays = cfg.prediction.windowDays, productId } = {}) {
  const [stock, demand] = await Promise.all([getStockRows(productId), getDemandMap(windowDays, productId)]);
  const r = cfg.reorder;
  return stock.map((s) => {
    const d = demand.get(String(s._id)) || { totalSold: 0, lastSale: null };
    const avgDaily = calc.averageDailySales(d.totalSold, windowDays);
    const days = calc.daysUntilStockout(s.available, avgDaily);
    const leadTimeDays = s.rule?.leadTimeDays ?? r.defaultLeadTimeDays;
    const riskStatus = calc.classifyRisk({ available: s.available, avgDaily, leadTimeDays });
    return {
      productId: s._id, name: s.product.name, sku: s.product.sku, costPrice: s.product.costPrice || 0,
      available: s.available, warehouses: s.warehouses,
      windowDays, totalSold: d.totalSold, avgDailySales: calc.round(avgDaily, 2),
      daysUntilStockout: days === null ? null : calc.round(days, 1),
      estimatedStockoutDate: days === null ? null : new Date(Date.now() + days * DAY),
      riskStatus, lastSaleAt: d.lastSale,
      leadTimeDays, safetyStock: s.rule?.safetyStock ?? r.defaultSafetyStock,
      reviewPeriodDays: s.rule?.reviewPeriodDays ?? r.defaultReviewPeriodDays,
      minOrderQty: s.rule?.minOrderQty ?? r.defaultMinOrderQty,
      preferredSupplier: s.rule?.preferredSupplier || null,
      stockValue: calc.round(s.available * (s.product.costPrice || 0), 2),
    };
  });
}

function filterSort(rows, { status, search, sortBy = 'risk', order = 'asc' } = {}) {
  let out = rows;
  if (status) out = out.filter((r) => r.riskStatus === status);
  if (search) { const re = new RegExp(escapeRegex(search), 'i'); out = out.filter((r) => re.test(r.name) || re.test(r.sku || '')); }
  const dir = order === 'desc' ? -1 : 1;
  const key = {
    risk: (r) => RISK_ORDER[r.riskStatus] * 1e6 + (r.daysUntilStockout ?? 1e5),
    days: (r) => r.daysUntilStockout ?? Infinity,
    name: (r) => r.name.toLowerCase(), available: (r) => r.available, demand: (r) => r.avgDailySales,
  }[sortBy] || ((r) => 0);
  return [...out].sort((a, b) => (key(a) > key(b) ? dir : key(a) < key(b) ? -dir : 0));
}

// $group by day + $setWindowFields (7-day moving average and running total)
async function getDemandTrend(productId, days = 60) {
  const since = new Date(Date.now() - days * DAY);
  return SalesHistory.aggregate([
    { $match: { 'meta.product': oid(productId), timestamp: { $gte: since } } },
    { $group: { _id: { $dateTrunc: { date: '$timestamp', unit: 'day' } }, units: { $sum: '$quantity' }, revenue: { $sum: '$revenue' } } },
    { $setWindowFields: { sortBy: { _id: 1 }, output: {
        movingAvg7: { $avg: '$units', window: { documents: [-6, 0] } },
        cumulativeUnits: { $sum: '$units', window: { documents: ['unbounded', 'current'] } } } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', units: 1, revenue: 1, cumulativeUnits: 1, movingAvg7: { $round: ['$movingAvg7', 2] } } },
  ]);
}

async function getSlowMoving() {
  const p = cfg.prediction;
  const rows = await getPredictions({ windowDays: p.slowMovingWindowDays });
  return rows
    .filter((r) => r.available > 0 && r.avgDailySales <= p.slowMovingMaxDailySales)
    .map((r) => ({ ...r, daysSinceLastSale: r.lastSaleAt ? Math.floor((Date.now() - new Date(r.lastSaleAt)) / DAY) : null }))
    .sort((a, b) => b.stockValue - a.stockValue);
}

module.exports = { getStockRows, getDemandMap, getWarehouseDemand, getPredictions, filterSort, getDemandTrend, getSlowMoving, RISK_ORDER };