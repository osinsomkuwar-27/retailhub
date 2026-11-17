const cfg = require('../../config/intelligence.config');
const { models, oid, logger } = require('../../utils/intelligence/shared');
const StockAlert = require('../../models/intelligence/StockAlert');
const prediction = require('./prediction.service');

const RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

async function raise({ type, severity, dedupeKey, message, product, warehouse, anomaly, currentStock, threshold, meta }, attempt = 0) {
  const now = new Date();
  try {
    return await StockAlert.findOneAndUpdate(
      { dedupeKey, isActive: true },
      {
        $set: { type, severity, severityRank: RANK[severity], message, currentStock, threshold, meta, lastTriggeredAt: now,
                ...(product ? { product } : {}), ...(warehouse ? { warehouse } : {}), ...(anomaly ? { anomaly } : {}) },
        $inc: { occurrences: 1 },
        $setOnInsert: { status: 'OPEN', firstTriggeredAt: now },
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    if (e.code === 11000 && attempt < 2) return raise({ type, severity, dedupeKey, message, product, warehouse, anomaly, currentStock, threshold, meta }, attempt + 1);
    throw e;
  }
}

const resolveWhere = (filter, by = 'SYSTEM') =>
  StockAlert.updateMany({ isActive: true, ...filter }, { $set: { status: 'RESOLVED', isActive: false, resolvedAt: new Date(), resolvedBy: String(by) } });

// Called by the Change Stream whenever an inventory quantity changes
async function evaluateStock(productId, warehouseId) {
  const { Inventory, Product } = models;
  const [inv, prod] = await Promise.all([
    Inventory.findOne({ product: productId, warehouse: warehouseId }).lean(),
    Product.findById(productId).select('name sku lowStockThreshold').lean(),
  ]);
  if (!inv || !prod) return;
  const threshold = prod.lowStockThreshold ?? cfg.alerts.defaultLowStockThreshold;
  const key = `LOW:${productId}:${warehouseId}`;
  if (inv.quantity <= threshold) {
    const out = inv.quantity <= 0;
    await raise({
      type: out ? 'OUT_OF_STOCK' : 'LOW_STOCK', severity: out ? 'CRITICAL' : inv.quantity <= threshold / 2 ? 'HIGH' : 'MEDIUM',
      dedupeKey: key, product: productId, warehouse: warehouseId, currentStock: inv.quantity, threshold,
      message: `${prod.name} (${prod.sku || 'no SKU'}) ${out ? 'is out of stock' : `is low: ${inv.quantity} left (threshold ${threshold})`} in this warehouse.`,
    });
  } else {
    await resolveWhere({ dedupeKey: key });
  }
}

const SEVERITY_BY_RISK = { OUT_OF_STOCK: 'CRITICAL', CRITICAL: 'HIGH', WARNING: 'MEDIUM' };

async function syncPredictionAlerts(rows) {
  const keys = [];
  for (const p of rows) {
    const sev = SEVERITY_BY_RISK[p.riskStatus];
    if (!sev || p.avgDailySales <= 0) continue;
    const dedupeKey = `PRED:${p.productId}`;
    keys.push(dedupeKey);
    await raise({
      type: 'PREDICTED_STOCKOUT', severity: sev, dedupeKey, product: p.productId, currentStock: p.available,
      message: `${p.name}: about ${p.daysUntilStockout} day(s) of stock left at ${p.avgDailySales}/day (lead time ${p.leadTimeDays}d).`,
      meta: { daysUntilStockout: p.daysUntilStockout, avgDailySales: p.avgDailySales, leadTimeDays: p.leadTimeDays },
    });
  }
  await resolveWhere({ type: 'PREDICTED_STOCKOUT', dedupeKey: { $nin: keys } });
  return keys.length;
}

async function evaluatePrediction(productId) {
  const rows = await prediction.getPredictions({ productId });
  if (!rows.length) return;
  const p = rows[0];
  if (SEVERITY_BY_RISK[p.riskStatus] && p.avgDailySales > 0) await syncPredictionAlertsForOne(p);
  else await resolveWhere({ dedupeKey: `PRED:${productId}` });
}
const syncPredictionAlertsForOne = (p) => raiseOne(p);
async function raiseOne(p) {
  return raise({
    type: 'PREDICTED_STOCKOUT', severity: SEVERITY_BY_RISK[p.riskStatus], dedupeKey: `PRED:${p.productId}`,
    product: p.productId, currentStock: p.available,
    message: `${p.name}: about ${p.daysUntilStockout} day(s) of stock left at ${p.avgDailySales}/day (lead time ${p.leadTimeDays}d).`,
    meta: { daysUntilStockout: p.daysUntilStockout, avgDailySales: p.avgDailySales, leadTimeDays: p.leadTimeDays },
  });
}

// Scheduled full scan: $lookup + $match with $expr comparing quantity to per-product threshold
async function scanLowStock() {
  const { Inventory, Product } = models;
  const lows = await Inventory.aggregate([
    { $lookup: { from: Product.collection.name, localField: 'product', foreignField: '_id',
        pipeline: [{ $project: { name: 1, sku: 1, lowStockThreshold: 1 } }], as: 'p' } },
    { $unwind: '$p' },
    { $addFields: { threshold: { $ifNull: ['$p.lowStockThreshold', cfg.alerts.defaultLowStockThreshold] } } },
    { $match: { $expr: { $lte: ['$quantity', '$threshold'] } } },
    { $project: { product: 1, warehouse: 1, quantity: 1, threshold: 1, name: '$p.name', sku: '$p.sku' } },
  ]);
  const keys = [];
  for (const l of lows) {
    const key = `LOW:${l.product}:${l.warehouse}`; keys.push(key);
    const out = l.quantity <= 0;
    await raise({
      type: out ? 'OUT_OF_STOCK' : 'LOW_STOCK', severity: out ? 'CRITICAL' : l.quantity <= l.threshold / 2 ? 'HIGH' : 'MEDIUM',
      dedupeKey: key, product: l.product, warehouse: l.warehouse, currentStock: l.quantity, threshold: l.threshold,
      message: `${l.name} (${l.sku || 'no SKU'}) ${out ? 'is out of stock' : `is low: ${l.quantity} left (threshold ${l.threshold})`} in this warehouse.`,
    });
  }
  await resolveWhere({ type: { $in: ['LOW_STOCK', 'OUT_OF_STOCK'] }, dedupeKey: { $nin: keys } });
  logger.info(`[intelligence] low-stock scan: ${lows.length} active`);
  return lows.length;
}

async function list({ status, type, severity, page = 1, limit = 20 }) {
  const q = status ? { status } : { isActive: true };
  if (type) q.type = type;
  if (severity) q.severity = severity;
  const [rows, total] = await Promise.all([
    StockAlert.find(q).sort({ severityRank: -1, lastTriggeredAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('product', 'name sku').populate('warehouse', 'name code').lean(),
    StockAlert.countDocuments(q),
  ]);
  return { rows, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

async function summary() {
  const [r] = await StockAlert.aggregate([
    { $match: { isActive: true } },
    { $facet: {
        bySeverity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }],
        byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        total: [{ $count: 'n' }],
    } },
  ]);
  return { total: r.total[0]?.n || 0, bySeverity: r.bySeverity, byType: r.byType };
}

const acknowledge = (id, userId) =>
  StockAlert.findOneAndUpdate({ _id: oid(id), isActive: true }, { $set: { status: 'ACKNOWLEDGED', acknowledgedBy: userId, acknowledgedAt: new Date() } }, { new: true });
const resolveManually = (id, userId) =>
  StockAlert.findOneAndUpdate({ _id: oid(id), isActive: true }, { $set: { status: 'RESOLVED', isActive: false, resolvedAt: new Date(), resolvedBy: String(userId) } }, { new: true });

module.exports = { raise, resolveWhere, evaluateStock, evaluatePrediction, syncPredictionAlerts, scanLowStock, list, summary, acknowledge, resolveManually };