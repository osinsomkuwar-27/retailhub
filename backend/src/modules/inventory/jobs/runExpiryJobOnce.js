// npm run job:expiry  → run the expiry check once (for demos)
const { connectDB, disconnectDB } = require('../../../config/db');
const { runExpiryCheck } = require('./expiry.job');

(async () => {
  await connectDB();
  await runExpiryCheck();
  await disconnectDB();
})();
