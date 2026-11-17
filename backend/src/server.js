
const env = require('./config/env');
const { connectDB } = require('./config/db');
const mongoose = require('mongoose');
const app = require('./app');

const inventory = require('./modules/inventory');
const { startIntelligence, stopIntelligence } = require('./intelligence');

let server = null;

async function startServer() {
  try {
    await connectDB();

    console.log(`[database] Connected to MongoDB: ${mongoose.connection.name}`);

    // Start Person 1 inventory jobs
    if (env.enableJobs) {
      inventory.startJobs();
    }

    // Start Person 3 intelligence jobs
    if (process.env.START_INTELLIGENCE !== 'false') {
      try {
        await startIntelligence();
      } catch (err) {
        console.warn(`[intelligence] Deferred startup: ${err.message}`);
      }
    }

    server = app.listen(env.port, () => {
      console.log(`[server] RetailSync Backend running on port ${env.port}`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[server] ${signal} received. Shutting down...`);

      try {
        await stopIntelligence();
      } catch (err) {
        console.warn('[intelligence] Shutdown warning:', err.message);
      }

      if (server) {
        server.close();
      }

      await mongoose.disconnect();
      console.log('[database] MongoDB connection closed.');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[server] Startup failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
