const env = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');
const inventory = require('./modules/inventory');

(async () => {
  try {
    await connectDB();
    if (env.enableJobs) inventory.startJobs();
    app.listen(env.port, () => console.log(`[server] http://localhost:${env.port}/api`));
  } catch (err) {
    console.error('[server] failed to start:', err.message);
    process.exit(1);
  }
})();
