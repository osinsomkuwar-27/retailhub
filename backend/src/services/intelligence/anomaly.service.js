const cfg = require('../../config/intelligence.config');
const calc = require('../../utils/intelligence/calculations');
const { models, oid, DAY, logger } = require('../../utils/intelligence/shared');
const AnomalyRecord = require('../../models/intelligence/AnomalyRecord');
const StockAlert = require('../../models/intelligence/StockAlert');
const alertSvc = require('./alert.service');

const a = cfg.anomaly;

async function record(data) {
  try {
    const doc = await AnomalyRecord.create(data);
    await alertSvc.raise({
      type: 'ANOMALY', severity: data.severity, dedupeKey: `ANOM:${doc._id}`, product: data.product,
      warehouse: data.warehouse, anomaly: doc._id, message: data.description,
    });
    logger.warn(`[intelligence] anomaly recorded: ${data.type} (${data.severity})`);
    return doc;
  } catch (e) {
    if (e.code === 11000) return null; // already recorded (idempotent on replay)
    throw e;
  }
}

// Mongo filter equivalent of reductionUnits() + !isApproved()
const unapprovedReductionFilter = () => ({
  $or: [{ type: 'STOCK_OUT' }, { type: 'ADJUSTMENT', quantity: { $lt: 0 } }],
  'reference.type': { $nin: a.approvedReferenceTypes },
  approved: { $ne: true },
});

// RULE 1 + RULE 2: evaluated for every new inventory log (Change Stream)
async function evaluateLog(log) {
  const units = calc.reductionUnits(log);
  if (!units || calc.isApproved(log)) return [];
  const created = [];
  const at = new Date(log.createdAt || Date.now());

  if (units >= a.largeReductionUnits) {
    created.push(await record({
      type: 'LARGE_UNAPPROVED_REDUCTION', severity: units >= 2 * a.largeReductionUnits ? 'CRITICAL' : 'HIGH',
      dedupeKey: `LRG:${log._id}`, product: log.product, warehouse: log.warehouse, user: log.performedBy, detectedAt: at,
      description: `${units} units removed without an approved sale or transfer (threshold ${a.largeReductionUnits}).`,
      evidence: { units, threshold: a.largeReductionUnits, logIds: [log._id], windowStart: at, windowEnd: at },
    }));
  }

  if (log.performedBy) {
    const windowStart = new Date(at.getTime() - a.rapidWindowMinutes * 60000);
    const [agg] = await models.InventoryLog.aggregate([
      { $match: { performedBy: log.performedBy, createdAt: { $gte: windowStart, $lte: at }, ...unapprovedReductionFilter() } },
      { $group: { _id: '$performedBy', count: { $sum: 1 }, units: { $sum: { $abs: '$quantity' } }, logIds: { $push: '$_id' } } },
    ]);
    if (agg && agg.count >= 2 && (agg.count >= a.rapidReductionCount || agg.units >= a.rapidReductionUnits)) {
      const bucket = Math.floor(at.getTime() / (a.rapidWindowMinutes * 60000));
      created.push(await record({
        type: 'RAPID_REPEATED_REDUCTIONS', severity: agg.units >= 2 * a.rapidReductionUnits ? 'CRITICAL' : 'HIGH',
        dedupeKey: `RPD:${log.performedBy}:${bucket}`, user: log.performedBy, product: log.product, warehouse: log.warehouse, detectedAt: at,
        description: `${agg.count} unapproved reductions totalling ${agg.units} units by one user within ${a.rapidWindowMinutes} minutes.`,
        evidence: { units: agg.units, count: agg.count, threshold: a.rapidReductionUnits, logIds: agg.logIds, windowStart, windowEnd: at },
      }));
    }
  }
  return created.filter(Boolean);
}

// RULE 3: repeated cancellations by one customer
async function evaluateCancellations(customerId) {
  if (!customerId) return null;
  const since = new Date(Date.now() - a.cancellationWindowDays * DAY);
  const orders = await models.Order.find({ customer: customerId, status: 'CANCELLED', updatedAt: { $gte: since } }).select('_id').lean();
  if (orders.length < a.cancellationCount) return null;
  const day = Math.floor(Date.now() / DAY);
  return record({
    type: 'REPEATED_ORDER_CANCELLATION', severity: orders.length >= 2 * a.cancellationCount ? 'HIGH' : 'MEDIUM',
    dedupeKey: `CXL:${customerId}:${day}`, customer: customerId,
    description: `Customer cancelled ${orders.length} orders within ${a.cancellationWindowDays} days (threshold ${a.cancellationCount}).`,
    evidence: { count: orders.length, threshold: a.cancellationCount, orderIds: orders.map((o) => o._id), windowStart: since, windowEnd: new Date() },
  });
}

// Scheduled safety net (catches anything a stopped Change Stream missed). Idempotent via dedupeKey.
async function sweep() {
  const since = new Date(Date.now() - a.sweepLookbackMinutes * 60000);
  let found = 0;
  const cursor = models.InventoryLog.find({ createdAt: { $gte: since }, ...unapprovedReductionFilter() }).lean().cursor();
  for await (const log of cursor) found += (await evaluateLog(log)).length;

  const heavy = await models.Order.aggregate([
    { $match: { status: 'CANCELLED', updatedAt: { $gte: new Date(Date.now() - a.cancellationWindowDays * DAY) } } },
    { $group: { _id: '$customer', n: { $sum: 1 } } },
    { $match: { n: { $gte: a.cancellationCount } } },
  ]);
  for (const h of heavy) if (await evaluateCancellations(h._id)) found += 1;
  return found;
}

async function list({ status, type, severity, user, from, to, page = 1, limit = 20 }) {
  const q = {};
  if (status) q.status = status;
  if (type) q.type = type;
  if (severity) q.severity = severity;
  if (user) q.user = oid(user);
  if (from || to) q.detectedAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  const [rows, total] = await Promise.all([
    AnomalyRecord.find(q).sort({ detectedAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('product', 'name sku').populate('warehouse', 'name code')
      .populate('user', 'name email').populate('customer', 'name email').populate('reviewedBy', 'name').lean(),
    AnomalyRecord.countDocuments(q),
  ]);
  return { rows, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

async function summary() {
  const since = new Date(Date.now() - 14 * DAY);
  const [r] = await AnomalyRecord.aggregate([
    { $facet: {
        byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        bySeverity: [{ $match: { status: { $in: ['OPEN', 'INVESTIGATING'] } } }, { $group: { _id: '$severity', count: { $sum: 1 } } }],
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        trend: [
          { $match: { detectedAt: { $gte: since } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$detectedAt' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }, { $project: { _id: 0, date: '$_id', count: 1 } },
        ],
        topUsers: [
          { $match: { user: { $ne: null } } }, { $group: { _id: '$user', count: { $sum: 1 } } },
          { $sort: { count: -1 } }, { $limit: 5 },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', pipeline: [{ $project: { name: 1, email: 1 } }], as: 'user' } },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        ],
    } },
  ]);
  const open = (r.byStatus.find((s) => s._id === 'OPEN')?.count || 0) + (r.byStatus.find((s) => s._id === 'INVESTIGATING')?.count || 0);
  return { open, ...r };
}

async function review(id, { status, note }, userId) {
  const doc = await AnomalyRecord.findByIdAndUpdate(
    id, { $set: { status, resolutionNote: note, reviewedBy: userId, reviewedAt: new Date() } }, { new: true, runValidators: true });
  if (doc && ['CONFIRMED', 'DISMISSED'].includes(status)) await alertSvc.resolveWhere({ anomaly: doc._id }, userId);
  return doc;
}

module.exports = { evaluateLog, evaluateCancellations, sweep, list, summary, review };