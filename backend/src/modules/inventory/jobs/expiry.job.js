// Scheduled background job: every day at 00:30 IST, flag expired batches.
const cron = require('node-cron');
const { markExpiredBatches } = require('../services/batch.service');

let task;

async function runExpiryCheck() {
  try {
    const { marked } = await markExpiredBatches();
    console.log(`[job:expiry] ${new Date().toISOString()} — ${marked} batch(es) marked expired`);
    return marked;
  } catch (err) {
    console.error('[job:expiry] failed:', err.message);
    return 0;
  }
}

function startExpiryJob(schedule = '30 0 * * *') {
  if (task) return task;
  task = cron.schedule(schedule, runExpiryCheck, { timezone: 'Asia/Kolkata' });
  runExpiryCheck(); // also run once at boot so state is fresh
  console.log(`[job:expiry] scheduled (${schedule} Asia/Kolkata)`);
  return task;
}

module.exports = { startExpiryJob, runExpiryCheck };
