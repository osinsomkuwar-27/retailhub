const { models, DAY, logger } = require('../../utils/intelligence/shared');
const SalesHistory = require('../../models/intelligence/SalesHistory');

const unitPrice = (i) => i.price ?? i.unitPrice ?? 0;

// Writes one time-series row per order line. Cancellations are negative rows (time-series is insert-only).
async function recordOrder(order, { kind = 'SALE' } = {}) {
  if (!order?.items?.length) return 0;
  const sign = kind === 'SALE' ? 1 : -1;
  const timestamp = kind === 'SALE' ? new Date(order.createdAt) : new Date(order.updatedAt || Date.now());
  if (kind === 'CANCELLATION') {
    const sold = await SalesHistory.exists({ orderId: order._id, kind: 'SALE', timestamp: new Date(order.createdAt) });
    if (!sold) return 0; // sale never recorded -> nothing to reverse
  }
  if (await SalesHistory.exists({ orderId: order._id, kind, timestamp })) return 0; // idempotent
  await SalesHistory.insertMany(order.items.map((i) => ({
    timestamp, meta: { product: i.product, warehouse: i.warehouse || null },
    quantity: sign * i.quantity, revenue: sign * i.quantity * unitPrice(i), kind, orderId: order._id, source: 'ORDER',
  })), { ordered: false });
  return order.items.length;
}

// Reconciliation / initial load from the orders collection (read-only on Module 2 data)
async function backfill({ days = 90 } = {}) {
  const since = new Date(Date.now() - days * DAY);
  let lines = 0;
  const cursor = models.Order.find({ createdAt: { $gte: since }, status: { $ne: 'CANCELLED' } })
    .select('items createdAt updatedAt status').lean().cursor();
  for await (const order of cursor) lines += await recordOrder(order);
  logger.info(`[intelligence] sales backfill (${days}d): ${lines} lines inserted`);
  return lines;
}

module.exports = { recordOrder, backfill };