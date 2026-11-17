const cfg = require('../../config/intelligence.config');
const calc = require('../../utils/intelligence/calculations');
const { models, oid, DAY, logger } = require('../../utils/intelligence/shared');
const ExpiryAlert = require('../../models/intelligence/ExpiryAlert');

async function scan() {
  const { StockBatch, Product } = models;
  const qty = cfg.batchQtyField;
  const horizon = new Date(Date.now() + cfg.expiry.warningDays * DAY);
  const batches = await StockBatch.aggregate([
    { $match: { [qty]: { $gt: 0 }, expiryDate: { $ne: null, $lte: horizon } } },
    { $lookup: { from: Product.collection.name, localField: 'product', foreignField: '_id', pipeline: [{ $project: { costPrice: 1 } }], as: 'p' } },
    { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
  ]);
  const ops = []; const ids = [];
  for (const b of batches) {
    const days = calc.daysToExpiry(b.expiryDate);
    const status = calc.expiryStatus(days);
    if (!status) continue;
    ids.push(b._id);
    ops.push({ updateOne: {
      filter: { batch: b._id, isActive: true },
      update: { $set: { product: b.product, warehouse: b.warehouse, batchNumber: b.batchNumber, quantity: b[qty], expiryDate: b.expiryDate,
                        daysToExpiry: days, status, suggestedAction: calc.expiryAction(status), valueAtRisk: calc.round(b[qty] * (b.p?.costPrice || 0), 2) } },
      upsert: true,
    } });
  }
  if (ops.length) await ExpiryAlert.bulkWrite(ops, { ordered: false });
  const resolved = await ExpiryAlert.updateMany({ isActive: true, batch: { $nin: ids } }, { $set: { isActive: false, resolvedAt: new Date() } });
  logger.info(`[intelligence] expiry scan: ${ids.length} active, ${resolved.modifiedCount} resolved`);
  return ids.length;
}

async function list({ status, warehouse, acknowledged, page = 1, limit = 20 }) {
  const q = { isActive: true };
  if (status) q.status = status;
  if (warehouse) q.warehouse = oid(warehouse);
  if (acknowledged !== undefined) q.acknowledged = acknowledged === 'true';
  const [rows, total] = await Promise.all([
    ExpiryAlert.find(q).sort({ expiryDate: 1 }).skip((page - 1) * limit).limit(limit)
      .populate('product', 'name sku').populate('warehouse', 'name code').lean(),
    ExpiryAlert.countDocuments(q),
  ]);
  return { rows, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

async function summary() {
  const [r] = await ExpiryAlert.aggregate([
    { $match: { isActive: true } },
    { $facet: {
        byStatus: [{ $group: { _id: '$status', batches: { $sum: 1 }, units: { $sum: '$quantity' }, value: { $sum: '$valueAtRisk' } } }],
        byWarehouse: [
          { $group: { _id: '$warehouse', batches: { $sum: 1 }, units: { $sum: '$quantity' }, value: { $sum: '$valueAtRisk' } } },
          { $lookup: { from: models.Warehouse.collection.name, localField: '_id', foreignField: '_id', pipeline: [{ $project: { name: 1 } }], as: 'w' } },
          { $unwind: { path: '$w', preserveNullAndEmptyArrays: true } },
          { $project: { batches: 1, units: 1, value: 1, name: '$w.name' } },
        ],
    } },
  ]);
  const totals = r.byStatus.reduce((t, s) => ({ batches: t.batches + s.batches, units: t.units + s.units, value: t.value + s.value }), { batches: 0, units: 0, value: 0 });
  return { ...r, totals };
}

const acknowledge = (id, userId) =>
  ExpiryAlert.findOneAndUpdate({ _id: oid(id), isActive: true }, { $set: { acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() } }, { new: true });

module.exports = { scan, list, summary, acknowledge };