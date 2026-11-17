const cfg = require('../../config/intelligence.config');
const { asyncHandler, ok, HttpError, parsePaging, paginate, models } = require('../../utils/intelligence/shared');
const prediction = require('../../services/intelligence/prediction.service');
const reorder = require('../../services/intelligence/reorder.service');
const alertSvc = require('../../services/intelligence/alert.service');
const anomalySvc = require('../../services/intelligence/anomaly.service');
const transferSvc = require('../../services/intelligence/transfer.service');
const expirySvc = require('../../services/intelligence/expiry.service');
const supplierSvc = require('../../services/intelligence/supplier.service');
const jobs = require('../../jobs/intelligence.jobs');

const windowOf = (q) => Math.min(365, Math.max(1, parseInt(q.days, 10) || cfg.prediction.windowDays));

// ---------- Dashboard ----------
exports.dashboard = asyncHandler(async (req, res) => {
  const [preds, onOrder] = await Promise.all([prediction.getPredictions({}), reorder.getOnOrderMap()]);
  const recs = reorder.buildRecommendations(preds, onOrder);
  const [alerts, anomalies, expiry, overdue, recentAlerts, recentAnomalies] = await Promise.all([
    alertSvc.summary(), anomalySvc.summary(), expirySvc.summary(), supplierSvc.overdueOrders(),
    alertSvc.list({ page: 1, limit: 6 }), anomalySvc.list({ status: 'OPEN', page: 1, limit: 5 }),
  ]);
  const dist = preds.reduce((m, p) => ({ ...m, [p.riskStatus]: (m[p.riskStatus] || 0) + 1 }), {});
  ok(res, {
    kpis: {
      openAlerts: alerts.total,
      criticalPredictions: (dist.CRITICAL || 0) + (dist.OUT_OF_STOCK || 0),
      openAnomalies: anomalies.open, expiringBatches: expiry.totals.batches,
      reorderNeeded: recs.length, overdueSupplierOrders: overdue.length,
    },
    riskDistribution: Object.entries(dist).map(([status, count]) => ({ status, count })),
    alertsBySeverity: alerts.bySeverity, anomalyTrend: anomalies.trend,
    topRisks: prediction.filterSort(preds, { sortBy: 'risk' }).filter((p) => p.avgDailySales > 0).slice(0, 8),
    recentAlerts: recentAlerts.rows, recentAnomalies: recentAnomalies.rows,
  });
});

// ---------- Predictions ----------
exports.predictions = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req.query);
  const rows = await prediction.getPredictions({ windowDays: windowOf(req.query) });
  const sorted = prediction.filterSort(rows, req.query);
  const out = paginate(sorted, page, limit);
  ok(res, out.rows, { ...out.meta, windowDays: windowOf(req.query) });
});
exports.predictionDetail = asyncHandler(async (req, res) => {
  const [row] = await prediction.getPredictions({ windowDays: windowOf(req.query), productId: req.params.productId });
  if (!row) throw new HttpError(404, 'No inventory found for this product');
  ok(res, row);
});
exports.demandTrend = asyncHandler(async (req, res) =>
  ok(res, await prediction.getDemandTrend(req.params.productId, Math.min(365, parseInt(req.query.days, 10) || 60))));
exports.slowMoving = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req.query);
  const out = paginate(await prediction.getSlowMoving(), page, limit);
  ok(res, out.rows, out.meta);
});

// ---------- Reorder ----------
exports.reorderRecommendations = asyncHandler(async (req, res) =>
  ok(res, await reorder.getRecommendations({ windowDays: windowOf(req.query), onlyNeeded: req.query.all !== 'true' })));
exports.reorderRules = asyncHandler(async (req, res) => ok(res, await reorder.listRules()));
exports.upsertRule = asyncHandler(async (req, res) =>
  ok(res, await reorder.upsertRule(req.params.productId, req.body, req.user?._id)));
exports.createOrderFromRecommendations = asyncHandler(async (req, res) =>
  ok(res, await supplierSvc.createOrder(req.body, req.user?._id), null, 201));

// ---------- Alerts ----------
exports.alerts = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req.query);
  const { rows, meta } = await alertSvc.list({ ...req.query, page, limit });
  ok(res, rows, meta);
});
exports.alertSummary = asyncHandler(async (req, res) => ok(res, await alertSvc.summary()));
exports.ackAlert = asyncHandler(async (req, res) => {
  const a = await alertSvc.acknowledge(req.params.id, req.user?._id);
  if (!a) throw new HttpError(404, 'Active alert not found');
  ok(res, a);
});
exports.resolveAlert = asyncHandler(async (req, res) => {
  const a = await alertSvc.resolveManually(req.params.id, req.user?._id);
  if (!a) throw new HttpError(404, 'Active alert not found');
  ok(res, a);
});

// ---------- Anomalies ----------
exports.anomalies = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req.query);
  const { rows, meta } = await anomalySvc.list({ ...req.query, page, limit });
  ok(res, rows, meta);
});
exports.anomalySummary = asyncHandler(async (req, res) => ok(res, await anomalySvc.summary()));
exports.reviewAnomaly = asyncHandler(async (req, res) => {
  const a = await anomalySvc.review(req.params.id, req.body, req.user?._id);
  if (!a) throw new HttpError(404, 'Anomaly not found');
  ok(res, a);
});

// ---------- Transfers ----------
exports.transferSuggestions = asyncHandler(async (req, res) =>
  ok(res, await transferSvc.suggest({ windowDays: windowOf(req.query) })));

// ---------- Expiry ----------
exports.expiry = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req.query);
  const { rows, meta } = await expirySvc.list({ ...req.query, page, limit });
  ok(res, rows, meta);
});
exports.expirySummary = asyncHandler(async (req, res) => ok(res, await expirySvc.summary()));
exports.ackExpiry = asyncHandler(async (req, res) => {
  const a = await expirySvc.acknowledge(req.params.id, req.user?._id);
  if (!a) throw new HttpError(404, 'Active expiry alert not found');
  ok(res, a);
});

// ---------- Suppliers ----------
exports.suppliers = asyncHandler(async (req, res) => ok(res, await supplierSvc.listSuppliers(req.query)));
exports.createSupplier = asyncHandler(async (req, res) => ok(res, await supplierSvc.createSupplier(req.body), null, 201));
exports.updateSupplier = asyncHandler(async (req, res) => {
  const s = await supplierSvc.updateSupplier(req.params.id, req.body);
  if (!s) throw new HttpError(404, 'Supplier not found');
  ok(res, s);
});
exports.supplierPerformance = asyncHandler(async (req, res) =>
  ok(res, await supplierSvc.performance({ days: parseInt(req.query.days, 10) || 180 })));
exports.supplierOrders = asyncHandler(async (req, res) => {
  const { page, limit } = parsePaging(req.query);
  const { rows, meta } = await supplierSvc.listOrders({ ...req.query, page, limit });
  ok(res, rows, meta);
});
exports.createSupplierOrder = asyncHandler(async (req, res) =>
  ok(res, await supplierSvc.createOrder(req.body, req.user?._id), null, 201));
exports.receiveSupplierOrder = asyncHandler(async (req, res) => {
  const receipts = req.body.receipts;
  if (!Array.isArray(receipts) || !receipts.length || receipts.some((r) => !(r.quantityReceived > 0)))
    throw new HttpError(400, 'receipts must be [{ product, quantityReceived > 0 }]');
  ok(res, await supplierSvc.receiveOrder(req.params.id, receipts));
});
exports.cancelSupplierOrder = asyncHandler(async (req, res) => ok(res, await supplierSvc.cancelOrder(req.params.id)));

// ---------- Jobs ----------
exports.jobStatus = asyncHandler(async (req, res) => ok(res, jobs.status()));
exports.runJob = asyncHandler(async (req, res) => {
  if (!jobs.exists(req.params.name)) throw new HttpError(404, 'Unknown job');
  ok(res, await jobs.run(req.params.name));
});