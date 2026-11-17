const calc = require('../../utils/intelligence/calculations');
const { oid, DAY, HttpError, logger } = require('../../utils/intelligence/shared');
const Supplier = require('../../models/intelligence/Supplier');
const SupplierOrder = require('../../models/intelligence/SupplierOrder');
const alertSvc = require('./alert.service');
const { models } = require('../../utils/intelligence/shared');

const listSuppliers = ({ active, search } = {}) => {
  const q = {};
  if (active !== undefined) q.isActive = active === 'true' || active === true;
  if (search) q.$text = { $search: search };
  return Supplier.find(q).sort({ name: 1 }).lean();
};
const createSupplier = (body) => Supplier.create(body);
const updateSupplier = (id, body) => Supplier.findByIdAndUpdate(id, { $set: body }, { new: true, runValidators: true });

const orderNumber = () => `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

async function createOrder({ supplier, items, expectedDate, notes }, userId) {
  const sup = await Supplier.findById(supplier).lean();
  if (!sup || !sup.isActive) throw new HttpError(400, 'Supplier not found or inactive');
  const products = await models.Product.find({ _id: { $in: items.map((i) => i.product) } }).select('costPrice').lean();
  const cost = new Map(products.map((p) => [String(p._id), p.costPrice || 0]));
  if (products.length !== new Set(items.map((i) => String(i.product))).size) throw new HttpError(400, 'One or more products do not exist');
  return SupplierOrder.create({
    orderNumber: orderNumber(), supplier, createdBy: userId, notes,
    expectedDate: expectedDate ? new Date(expectedDate) : new Date(Date.now() + sup.leadTimeDays * DAY),
    items: items.map((i) => ({ product: i.product, quantityOrdered: i.quantity, unitCost: i.unitCost ?? cost.get(String(i.product)) ?? 0 })),
  });
}

/** Records receipt on the supplier order only. Physical stock-in is done via Module 1's Stock Management. */
async function receiveOrder(id, receipts) {
  const order = await SupplierOrder.findById(id);
  if (!order) throw new HttpError(404, 'Supplier order not found');
  if (['RECEIVED', 'CANCELLED'].includes(order.status)) throw new HttpError(400, `Order already ${order.status}`);
  for (const r of receipts) {
    const item = order.items.find((i) => String(i.product) === String(r.product));
    if (!item) throw new HttpError(400, `Product ${r.product} is not on this order`);
    item.quantityReceived += r.quantityReceived;
  }
  order.receivedAt = new Date();
  order.status = order.items.every((i) => i.quantityReceived >= i.quantityOrdered) ? 'RECEIVED' : 'PARTIAL';
  await order.save(); // optimisticConcurrency guards concurrent receipts
  return order;
}

async function cancelOrder(id) {
  const order = await SupplierOrder.findOneAndUpdate({ _id: oid(id), status: 'PLACED' }, { $set: { status: 'CANCELLED' } }, { new: true });
  if (!order) throw new HttpError(400, 'Only PLACED orders can be cancelled');
  return order;
}

async function listOrders({ status, supplier, page = 1, limit = 20 }) {
  const q = {};
  if (status) q.status = status;
  if (supplier) q.supplier = oid(supplier);
  const [rows, total] = await Promise.all([
    SupplierOrder.find(q).sort({ orderedAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('supplier', 'name code').populate('items.product', 'name sku').lean(),
    SupplierOrder.countDocuments(q),
  ]);
  return { rows, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

// Supplier delivery performance: on-time rate, fill rate, delay, lead time
async function performance({ days = 180 } = {}) {
  const since = new Date(Date.now() - days * DAY);
  const rows = await SupplierOrder.aggregate([
    { $match: { status: { $in: ['RECEIVED', 'PARTIAL'] }, receivedAt: { $gte: since } } },
    { $project: {
        supplier: 1,
        ordered: { $sum: '$items.quantityOrdered' },
        received: { $sum: '$items.quantityReceived' },
        onTime: { $cond: [{ $lte: ['$receivedAt', '$expectedDate'] }, 1, 0] },
        delayDays: { $max: [0, { $divide: [{ $subtract: ['$receivedAt', '$expectedDate'] }, DAY] }] },
        leadDays: { $divide: [{ $subtract: ['$receivedAt', '$orderedAt'] }, DAY] },
    } },
    { $group: { _id: '$supplier', orders: { $sum: 1 }, onTimeOrders: { $sum: '$onTime' }, unitsOrdered: { $sum: '$ordered' },
        unitsReceived: { $sum: '$received' }, avgDelayDays: { $avg: '$delayDays' }, avgLeadDays: { $avg: '$leadDays' } } },
    { $lookup: { from: Supplier.collection.name, localField: '_id', foreignField: '_id', pipeline: [{ $project: { name: 1, code: 1, leadTimeDays: 1 } }], as: 'supplier' } },
    { $unwind: '$supplier' },
  ]);
  return rows.map((r) => {
    const onTimeRate = r.orders ? r.onTimeOrders / r.orders : 0;
    const fillRate = r.unitsOrdered ? Math.min(1, r.unitsReceived / r.unitsOrdered) : 0;
    return { supplier: r.supplier, orders: r.orders, onTimeRate: calc.round(onTimeRate, 3), fillRate: calc.round(fillRate, 3),
      avgDelayDays: calc.round(r.avgDelayDays, 1), avgLeadDays: calc.round(r.avgLeadDays, 1),
      promisedLeadDays: r.supplier.leadTimeDays, score: calc.scoreSupplier({ onTimeRate, fillRate }) };
  }).sort((a, b) => b.score - a.score);
}

const overdueOrders = () =>
  SupplierOrder.find({ status: { $in: ['PLACED', 'PARTIAL'] }, expectedDate: { $lt: new Date() } })
    .populate('supplier', 'name code').sort({ expectedDate: 1 }).lean();

async function scanOverdue() {
  const rows = await overdueOrders();
  const keys = [];
  for (const o of rows) {
    const late = Math.ceil((Date.now() - new Date(o.expectedDate)) / DAY);
    const dedupeKey = `PO_OVERDUE:${o._id}`; keys.push(dedupeKey);
    await alertSvc.raise({ type: 'SUPPLIER_OVERDUE', severity: late > 7 ? 'HIGH' : 'MEDIUM', dedupeKey,
      message: `${o.orderNumber} from ${o.supplier?.name || 'supplier'} is ${late} day(s) overdue.`, meta: { orderId: o._id, daysLate: late } });
  }
  await alertSvc.resolveWhere({ type: 'SUPPLIER_OVERDUE', dedupeKey: { $nin: keys } });
  logger.info(`[intelligence] overdue supplier orders: ${rows.length}`);
  return rows.length;
}

module.exports = { listSuppliers, createSupplier, updateSupplier, createOrder, receiveOrder, cancelOrder, listOrders, performance, overdueOrders, scanOverdue };