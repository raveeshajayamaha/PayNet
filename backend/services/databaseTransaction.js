const { database } = require('../config/database');

// Infrastructure only: this helper does not debit, credit, or create payments.
// Pass the session explicitly to EVERY operation. Await operations sequentially.
// Callbacks may be retried: publish notifications only after this promise resolves.
async function withDatabaseTransaction(work, db = database) {
  if (typeof work !== 'function') throw new TypeError('A transaction callback is required.');
  const health = await db.health();
  if (!health.ready) throw new Error('MongoDB is not ready.');
  if (!health.transactionsSupported) throw new Error('MongoDB transactions require a replica set or sharded cluster.');

  // Mongoose wraps session.withTransaction(), restores document state on abort,
  // retries transient transaction/commit errors and ends the session in finally.
  return db.connection.transaction((session) => work(session, db.models), {
    readPreference: 'primary',
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    maxCommitTimeMS: 5000,
  });
}

module.exports = { withDatabaseTransaction };
