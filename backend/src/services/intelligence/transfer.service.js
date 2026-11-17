const cfg = require('../../config/intelligence.config');
const calc = require('../../utils/intelligence/calculations');
const { models, oid } = require('../../utils/intelligence/shared');
const prediction = require('./prediction.service');
const ReorderRule = require('../../models/intelligence/ReorderRule');

async function suggest({ windowDays = cfg.prediction.windowDays } = {}) {
  const { Inventory, Product, Warehouse } = models;
  const [products, demandRows, rules] = await Promise.all([
    Inventory.aggregate([
      { $group: { _id: '$product', stock: { $push: { warehouse: '$warehouse', quantity: '$quantity' } } } },
      { $match: { 'stock.1': { $exists: true } } }, // at least two warehouses
      { $lookup: { from: Product.collection.name, localField: '_id', foreignField: '_id', pipeline: [{ $project: { name: 1, sku: 1 } }], as: 'product' } },
      { $unwind: '$product' },
    ]),
    prediction.getWarehouseDemand(windowDays),
    ReorderRule.find().lean(),
  ]);
  const demand = new Map(demandRows.map((d) => [`${d._id.product}:${d._id.warehouse}`, d.sold]));
  const ruleMap = new Map(rules.map((r) => [String(r.product), r]));

  const raw = [];
  for (const p of products) {
    const rule = ruleMap.get(String(p._id));
    const params = {
      leadTimeDays: rule?.leadTimeDays ?? cfg.reorder.defaultLeadTimeDays,
      safetyStock: rule?.safetyStock ?? cfg.reorder.defaultSafetyStock,
    };
    const nodes = p.stock.map((s) => ({
      warehouse: String(s.warehouse), quantity: s.quantity,
      avgDaily: calc.averageDailySales(demand.get(`${p._id}:${s.warehouse}`) || 0, windowDays),
    }));
    for (const t of calc.matchTransfers(nodes, params)) raw.push({ ...t, productId: p._id, name: p.product.name, sku: p.product.sku });
  }
  const wIds = [...new Set(raw.flatMap((r) => [r.fromWarehouse, r.toWarehouse]))].map(oid);
  const whs = wIds.length ? await Warehouse.find({ _id: { $in: wIds } }).select('name code').lean() : [];
  const wMap = new Map(whs.map((w) => [String(w._id), w]));
  return raw
    .map((r) => ({ ...r, from: wMap.get(r.fromWarehouse) || { _id: r.fromWarehouse }, to: wMap.get(r.toWarehouse) || { _id: r.toWarehouse },
      reason: `Receiver has ${r.receiverCoverDays} days of cover; donor has ${r.donorCoverDays ?? 'no demand (surplus)'} days.` }))
    .sort((x, y) => x.receiverCoverDays - y.receiverCoverDays);
}

module.exports = { suggest };