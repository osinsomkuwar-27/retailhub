const mongoose = require('mongoose');
const { models, logger } = require('../../utils/intelligence/shared');
const StreamCheckpoint = require('../../models/intelligence/StreamCheckpoint');
const anomalySvc = require('./anomaly.service');
const alertSvc = require('./alert.service');
const salesSync = require('./salesSync.service');

let stopped = true;
const active = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const definitions = () => [
  { // 1. every new inventory log -> anomaly rules
    name: 'inventory_logs',
    model: models.InventoryLog,
    pipeline: [{ $match: { operationType: 'insert' } }],
    options: {},
    handler: async (c) => { await anomalySvc.evaluateLog(c.fullDocument); },
  },
  { // 2. quantity changes -> low-stock + predicted-stockout alerts (auto-resolve when replenished)
    name: 'inventory',
    model: models.Inventory,
    pipeline: [{ $match: { $or: [
      { operationType: { $in: ['insert', 'replace'] } },
      { operationType: 'update', 'updateDescription.updatedFields.quantity': { $exists: true } },
    ] } }],
    options: { fullDocument: 'updateLookup' },
    handler: async (c) => {
      const d = c.fullDocument; if (!d) return;
      await alertSvc.evaluateStock(d.product, d.warehouse);
      await alertSvc.evaluatePrediction(d.product);
    },
  },
  { // 3. orders -> sales history (time-series) + cancellation detection
    name: 'orders',
    model: models.Order,
    pipeline: [{ $match: { $or: [
      { operationType: 'insert' },
      { operationType: 'update', 'updateDescription.updatedFields.status': { $exists: true } },
    ] } }],
    options: { fullDocument: 'updateLookup' },
    handler: async (c) => {
      const o = c.fullDocument; if (!o) return;
      if (c.operationType === 'insert') {
        if (o.status !== 'CANCELLED') await salesSync.recordOrder(o);
      } else if (o.status === 'CANCELLED') {
        await salesSync.recordOrder(o, { kind: 'CANCELLATION' });
        await anomalySvc.evaluateCancellations(o.customer);
      }
    },
  },
];

async function run(def) {
  let backoff = 1000;
  while (!stopped) {
    try {
      const cp = await StreamCheckpoint.findById(def.name).lean();
      const opts = { ...def.options, ...(cp?.token ? { resumeAfter: cp.token } : {}) };
      const stream = def.model.watch(def.pipeline, opts);
      active.set(def.name, stream);
      logger.info(`[intelligence] change stream '${def.name}' opened${cp?.token ? ' (resumed)' : ''}`);
      backoff = 1000;
      for await (const change of stream) {
        try { await def.handler(change); }
        catch (e) { logger.error(`[intelligence] handler error on '${def.name}': ${e.message}`); }
        await StreamCheckpoint.updateOne({ _id: def.name }, { $set: { token: change._id } }, { upsert: true });
      }
    } catch (err) {
      if (stopped) return;
      // 286 = ChangeStreamHistoryLost, 260 = invalid resume -> drop token, restart fresh
      if ([286, 260].includes(err.code) || /resume/i.test(err.message)) await StreamCheckpoint.deleteOne({ _id: def.name });
      logger.error(`[intelligence] change stream '${def.name}' error: ${err.message}; retry in ${backoff}ms`);
      await sleep(backoff); backoff = Math.min(backoff * 2, 30000);
    }
  }
}

async function start() {
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) { logger.warn('[intelligence] not a replica set; Change Streams disabled (scheduled jobs still work)'); return false; }
  stopped = false;
  definitions().forEach((d) => { run(d); });
  return true;
}

async function stop() {
  stopped = true;
  await Promise.all([...active.values()].map((s) => s.close().catch(() => {})));
  active.clear();
}

module.exports = { start, stop, status: () => [...active.keys()] };