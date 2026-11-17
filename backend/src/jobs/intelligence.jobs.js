const cron = require('node-cron');
const cfg = require('../config/intelligence.config');
const { logger } = require('../utils/intelligence/shared');
const alertSvc = require('../services/intelligence/alert.service');
const prediction = require('../services/intelligence/prediction.service');
const anomalySvc = require('../services/intelligence/anomaly.service');
const expirySvc = require('../services/intelligence/expiry.service');
const supplierSvc = require('../services/intelligence/supplier.service');
const salesSync = require('../services/intelligence/salesSync.service');

const defs = {
  lowStockScan: async () => ({
    lowStock: await alertSvc.scanLowStock(),
    predicted: await alertSvc.syncPredictionAlerts(await prediction.getPredictions({})),
  }),
  anomalySweep: async () => ({ anomalies: await anomalySvc.sweep() }),
  salesReconcile: async () => ({ lines: await salesSync.backfill({ days: 2 }) }),
  expiryScan: async () => ({ activeExpiryAlerts: await expirySvc.scan() }),
  supplierOverdueScan: async () => ({ overdue: await supplierSvc.scanOverdue() }),
};

const state = Object.fromEntries(Object.keys(defs).map((n) => [n, { running: false, lastRunAt: null, lastDurationMs: null, lastResult: null, lastError: null }]));
const tasks = [];

async function run(name) {
  const s = state[name];
  if (s.running) return { skipped: true, reason: 'already running' };
  s.running = true; const t0 = Date.now();
  try {
    s.lastResult = await defs[name](); s.lastError = null;
    return s.lastResult;
  } catch (e) {
    s.lastError = e.message; logger.error(`[intelligence] job ${name} failed: ${e.message}`); throw e;
  } finally { s.running = false; s.lastRunAt = new Date(); s.lastDurationMs = Date.now() - t0; }
}

function start() {
  if (!cfg.jobs.enabled) return logger.warn('[intelligence] scheduled jobs disabled');
  for (const [name, expr] of Object.entries(cfg.jobs.schedules)) {
    tasks.push(cron.schedule(expr, () => run(name).catch(() => {}), { timezone: cfg.jobs.timezone }));
  }
  logger.info(`[intelligence] scheduled ${tasks.length} jobs`);
  // warm-up so dashboards are populated right after boot
  setTimeout(async () => {
    for (const n of ['salesReconcile', 'lowStockScan', 'expiryScan', 'supplierOverdueScan', 'anomalySweep']) await run(n).catch(() => {});
  }, 5000);
}
const stop = () => { tasks.forEach((t) => t.stop()); tasks.length = 0; };

module.exports = { start, stop, run, exists: (n) => !!defs[n], status: () => ({ schedules: cfg.jobs.schedules, jobs: state }) };