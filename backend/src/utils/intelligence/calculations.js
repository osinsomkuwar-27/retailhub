// Pure, unit-testable business rules. Deterministic formulas only, NOT machine learning.
const cfg = require('../../config/intelligence.config');
const DAY = 86400000;
const round = (n, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

const averageDailySales = (totalSold, windowDays) =>
  windowDays > 0 ? Math.max(0, totalSold) / windowDays : 0;

// Days Until Stockout = Available Stock / Average Daily Sales
const daysUntilStockout = (available, avgDaily) =>
  avgDaily > 0 ? Math.max(0, available) / avgDaily : null;

function classifyRisk({ available, avgDaily, leadTimeDays, warningBufferDays = cfg.prediction.warningBufferDays }) {
  if (available <= 0) return avgDaily > 0 ? 'OUT_OF_STOCK' : 'NO_DEMAND';
  if (avgDaily <= 0) return 'NO_DEMAND';
  const days = available / avgDaily;
  if (days <= leadTimeDays) return 'CRITICAL';
  if (days <= leadTimeDays + warningBufferDays) return 'WARNING';
  return 'HEALTHY';
}

// reorderPoint = avgDaily * leadTime + safetyStock
// target       = avgDaily * (leadTime + reviewPeriod) + safetyStock
function computeReorder({ available, onOrder = 0, avgDaily, leadTimeDays, safetyStock, reviewPeriodDays, minOrderQty = 1 }) {
  const reorderPoint = Math.ceil(avgDaily * leadTimeDays + safetyStock);
  const targetStock = Math.ceil(avgDaily * (leadTimeDays + reviewPeriodDays) + safetyStock);
  const position = available + onOrder;
  const needsReorder = position <= reorderPoint;
  let recommendedQty = needsReorder ? Math.max(0, targetStock - position) : 0;
  if (recommendedQty > 0) recommendedQty = Math.ceil(recommendedQty / Math.max(1, minOrderQty)) * Math.max(1, minOrderQty);
  return { reorderPoint, targetStock, inventoryPosition: position, needsReorder, recommendedQty };
}

// Units removed by a log entry (0 if it is not a reduction)
function reductionUnits(log) {
  if (!log) return 0;
  if (log.type === 'STOCK_OUT') return Math.abs(Number(log.quantity) || 0);
  if (log.type === 'ADJUSTMENT' && Number(log.quantity) < 0) return Math.abs(Number(log.quantity));
  return 0;
}
const isApproved = (log, approved = cfg.anomaly.approvedReferenceTypes) =>
  log?.approved === true || (!!log?.reference?.type && approved.includes(log.reference.type));

const daysToExpiry = (expiryDate, now = Date.now()) => Math.ceil((new Date(expiryDate).getTime() - now) / DAY);
function expiryStatus(days, e = cfg.expiry) {
  if (days < 0) return 'EXPIRED';
  if (days <= e.criticalDays) return 'CRITICAL';
  if (days <= e.warningDays) return 'WARNING';
  return null;
}
const expiryAction = (status) =>
  ({ EXPIRED: 'DISPOSE_OR_RETURN', CRITICAL: 'MARKDOWN_OR_TRANSFER', WARNING: 'MONITOR' }[status] || 'MONITOR');

// Weighted supplier score (0-100): 60% on-time, 40% fill rate
const scoreSupplier = ({ onTimeRate, fillRate }) => round(100 * (0.6 * onTimeRate + 0.4 * fillRate), 1);

/**
 * Greedy donor -> receiver matching for ONE product.
 * nodes: [{ warehouse, quantity, avgDaily }]
 */
function matchTransfers(nodes, { leadTimeDays, safetyStock }, c = cfg.transfer) {
  const enriched = nodes.map((n) => ({ ...n, cover: n.avgDaily > 0 ? n.quantity / n.avgDaily : Infinity }));
  const receivers = enriched
    .filter((n) => n.avgDaily > 0 && n.cover < leadTimeDays + cfg.prediction.warningBufferDays)
    .map((n) => ({ ...n, need: Math.ceil(n.avgDaily * c.targetCoverDays + safetyStock - n.quantity) }))
    .filter((n) => n.need > 0)
    .sort((a, b) => a.cover - b.cover);
  const donors = enriched
    .filter((n) => n.cover > c.surplusCoverDays || (n.avgDaily === 0 && n.quantity > safetyStock))
    .map((n) => ({ ...n, surplus: Math.floor(n.quantity - (Math.ceil(n.avgDaily * c.targetCoverDays) + safetyStock)) }))
    .filter((n) => n.surplus > 0)
    .sort((a, b) => b.surplus - a.surplus);

  const out = [];
  for (const r of receivers) {
    let need = r.need;
    for (const d of donors) {
      if (need <= 0) break;
      if (d.surplus <= 0 || String(d.warehouse) === String(r.warehouse)) continue;
      const qty = Math.min(d.surplus, need);
      if (qty < c.minTransferQty) continue;
      out.push({
        fromWarehouse: d.warehouse, toWarehouse: r.warehouse, quantity: qty,
        donorCoverDays: Number.isFinite(d.cover) ? round(d.cover) : null,
        receiverCoverDays: round(r.cover),
      });
      d.surplus -= qty; need -= qty;
    }
  }
  return out;
}

module.exports = {
  DAY, round, averageDailySales, daysUntilStockout, classifyRisk, computeReorder,
  reductionUnits, isApproved, daysToExpiry, expiryStatus, expiryAction, scoreSupplier, matchTransfers,
};