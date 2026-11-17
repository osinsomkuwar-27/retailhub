
const mongoose = require('mongoose');
const { models, logger } = require('../../utils/intelligence/shared');
const StreamCheckpoint = require('../../models/intelligence/StreamCheckpoint');
const anomalySvc = require('./anomaly.service');
const alertSvc = require('./alert.service');
const salesSync = require('./salesSync.service');

let stopped = true;
const active = new Map();
const workers = new Map();

const MAX_RETRIES = 10;
const INITIAL_BACKOFF = 1000;
const MAX_BACKOFF = 30000;

const definitions = () => [
  {
    name: 'inventory_logs',
    model: models.InventoryLog,
    pipeline: [{ $match: { operationType: 'insert' } }],
    options: {},
    handler: async (c) => {
      await anomalySvc.evaluateLog(c.fullDocument);
    },
  },
  {
    name: 'inventory',
    model: models.Inventory,
    pipeline: [{
      $match: {
        $or: [
          { operationType: { $in: ['insert', 'replace'] } },
          {
            operationType: 'update',
            'updateDescription.updatedFields.quantity': { $exists: true },
          },
        ],
      },
    }],
    options: { fullDocument: 'updateLookup' },
    handler: async (c) => {
      const d = c.fullDocument;
      if (!d) return;

      await alertSvc.evaluateStock(d.product, d.warehouse);
      await alertSvc.evaluatePrediction(d.product);
    },
  },
  {
    name: 'orders',
    model: models.Order,
    pipeline: [{
      $match: {
        $or: [
          { operationType: 'insert' },
          {
            operationType: 'update',
            'updateDescription.updatedFields.status': { $exists: true },
          },
        ],
      },
    }],
    options: { fullDocument: 'updateLookup' },
    handler: async (c) => {
      const o = c.fullDocument;
      if (!o) return;

      if (c.operationType === 'insert') {
        if (o.status !== 'CANCELLED') {
          await salesSync.recordOrder(o);
        }
      } else if (o.status === 'CANCELLED') {
        await salesSync.recordOrder(o, { kind: 'CANCELLATION' });
        await anomalySvc.evaluateCancellations(o.customer);
      }
    },
  },
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run(def) {
  let backoff = INITIAL_BACKOFF;
  let retries = 0;

  while (!stopped) {
    let stream;

    try {
      const cp = await StreamCheckpoint.findById(def.name).lean();

      const opts = {
        ...def.options,
        ...(cp?.token ? { resumeAfter: cp.token } : {}),
      };

      stream = def.model.watch(def.pipeline, opts);
      active.set(def.name, stream);

      logger.info(`[intelligence] change stream '${def.name}' opened`);

      let processing = Promise.resolve();
      let streamError = null;

      const ended = new Promise((resolve) => {
        stream.once('error', (err) => {
          streamError = err;
          resolve();
        });

        stream.once('close', resolve);
      });

      stream.on('change', (change) => {
        processing = processing.then(async () => {
          if (stopped || streamError) return;

          await def.handler(change);

          await StreamCheckpoint.updateOne(
            { _id: def.name },
            { $set: { token: change._id } },
            { upsert: true }
          );
        }).catch((err) => {
          streamError = err;
          logger.error(
            `[intelligence] handler error on '${def.name}': ${err.message}`
          );
          stream.close().catch(() => {});
        });
      });

      await ended;
      await processing;

      if (stopped) break;

      if (streamError) throw streamError;

      throw new Error('Change stream closed unexpectedly');

    } catch (err) {
      if (stopped) break;

      // Resume history lost: start fresh.
      if (err.code === 286 || err.code === 260) {
        await StreamCheckpoint.deleteOne({ _id: def.name });
      }

      retries++;

      logger.error(
        `[intelligence] stream '${def.name}' failed: ${err.message}`
      );

      if (retries >= MAX_RETRIES) {
        logger.error(
          `[intelligence] stream '${def.name}' stopped after ${MAX_RETRIES} retries`
        );
        break;
      }

      logger.warn(
        `[intelligence] retry ${retries}/${MAX_RETRIES} in ${backoff}ms`
      );

      await delay(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);

    } finally {
      if (stream) {
        active.delete(def.name);
        await stream.close().catch(() => {});
      }
    }
  }

  workers.delete(def.name);
}

async function start() {
  if (workers.size) return true;

  const info = await mongoose.connection.db.admin().command({ hello: 1 });

  if (!info.setName) {
    logger.warn('[intelligence] not a replica set; Change Streams disabled');
    return false;
  }

  stopped = false;

  for (const def of definitions()) {
    const worker = run(def).catch(err => {
      logger.error(`[intelligence] worker '${def.name}' failed: ${err.message}`);
    });

    workers.set(def.name, worker);
  }

  return true;
}

async function stop() {
  stopped = true;

  await Promise.all(
    [...active.values()].map(stream => stream.close().catch(() => {}))
  );

  await Promise.all([...workers.values()]);

  active.clear();
  workers.clear();
}

module.exports = {
  start,
  stop,
  status: () => [...active.keys()],
};