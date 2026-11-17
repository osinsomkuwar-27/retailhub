const router = require('./routes/intelligence.routes');
const jobs = require('./jobs/intelligence.jobs');
const streams = require('./services/intelligence/changeStream.service');
const SalesHistory = require('./models/intelligence/SalesHistory');
const { logger } = require('./utils/intelligence/shared');
const cfg = require('./config/intelligence.config');

async function startIntelligence() {
  await SalesHistory.init(); // creates the time-series collection if missing
  if (cfg.jobs.changeStreamsEnabled) await streams.start();
  jobs.start();
  logger.info('[intelligence] module started');
}
async function stopIntelligence() { jobs.stop(); await streams.stop(); }

module.exports = { intelligenceRouter: router, startIntelligence, stopIntelligence };