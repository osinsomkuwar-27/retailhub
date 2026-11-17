const mongoose = require('mongoose');

/**
 * Runs `fn(session)` inside a multi-document ACID transaction.
 * - If the caller already has a session (e.g. Person 2's order transaction),
 *   we join it instead of starting a new one, so the whole business
 *   operation commits or rolls back together.
 * - session.withTransaction() automatically retries on TransientTransactionError
 *   (write conflicts between concurrent transactions).
 */
async function runInTransaction(fn, existingSession) {
  if (existingSession) return fn(existingSession);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(
      async () => { result = await fn(session); },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
    );
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { runInTransaction };
