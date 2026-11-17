require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { startIntelligence, stopIntelligence } = require('./intelligence');

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/retailhub_db';

let server = null;

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: process.env.DB_NAME || 'retailhub_db',
    });
    console.log(`[database] Connected to MongoDB: ${mongoose.connection.name}`);

    // Attempt to start Person 3 jobs if enabled
    try {
      if (process.env.START_INTELLIGENCE !== 'false') {
        await startIntelligence();
      }
    } catch (err) {
      console.warn(`[intelligence] Deferred startup: ${err.message}`);
    }

    server = app.listen(PORT, () => {
      console.log(`[server] RetailSync Backend running on port ${PORT}`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[server] ${signal} received. Initiating graceful shutdown...`);
      try {
        await stopIntelligence();
      } catch (_) {}
      if (server) {
        server.close(() => {
          console.log('[server] HTTP server closed.');
        });
      }
      await mongoose.disconnect();
      console.log('[database] MongoDB connection closed.');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error(`[server] Startup failed:`, err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
