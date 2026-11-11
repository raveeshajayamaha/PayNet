const mongoose = require('mongoose');
const { getModels } = require('../models');

function readDatabaseConfig(env = process.env) {
  const uri = env.MONGODB_URI?.trim();
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new Error('Set MONGODB_URI to a valid MongoDB connection string.');
  }
  const serverSelectionTimeoutMS = Number(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000);
  if (!Number.isSafeInteger(serverSelectionTimeoutMS) || serverSelectionTimeoutMS < 100 || serverSelectionTimeoutMS > 60000) {
    throw new Error('MONGODB_SERVER_SELECTION_TIMEOUT_MS must be an integer from 100 to 60000.');
  }
  return {
    uri,
    options: {
      serverSelectionTimeoutMS, connectTimeoutMS: serverSelectionTimeoutMS,
      socketTimeoutMS: 10000, maxPoolSize: 10,
      autoIndex: false, autoCreate: false,
    },
  };
}

function supportsTransactions(hello) {
  return hello.logicalSessionTimeoutMinutes != null && (
    (Boolean(hello.setName) && hello.maxWireVersion >= 7) ||
    (hello.msg === 'isdbgrid' && hello.maxWireVersion >= 8)
  );
}

function createDatabase({ connection = mongoose.connection, models = getModels(connection) } = {}) {
  // Avoid unhandled Mongoose error events, without exposing credentials in logs.
  connection.on('error', () => {});
  let initialized = false;

  function status() {
    const state = ['disconnected', 'connected', 'connecting', 'disconnecting'][connection.readyState] || 'unknown';
    return { provider: 'mongodb', status: state, initialized: initialized && state === 'connected' };
  }

  async function health() {
    if (connection.readyState !== 1) return { ...status(), ready: false, transactionsSupported: null };
    try {
      // timeoutMS bounds server selection AND execution, including a lost connection.
      await connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
      const hello = await connection.db.admin().command({ hello: 1 }, { timeoutMS: 2000 });
      return { ...status(), ready: initialized, transactionsSupported: supportsTransactions(hello) };
    } catch {
      return { ...status(), status: 'unavailable', ready: false, transactionsSupported: null };
    }
  }

  async function connect(env = process.env) {
    const { uri, options } = readDatabaseConfig(env);
    initialized = false;
    try {
      await connection.openUri(uri, options);
      // Create collections before transactions. createIndexes adds indexes, never drops them.
      // Always await unique indexes: `unique` in a schema is not a validation rule.
      for (const model of Object.values(models)) {
        await model.createCollection();
        await model.createIndexes();
      }
      // Never silently hydrate a legacy balance as the new field's zero default.
      if (models.Wallet && await models.Wallet.collection.countDocuments({ balance: { $exists: true } })) throw new Error('Legacy money fields require migration.');
      if (models.Transaction && await models.Transaction.collection.countDocuments({ amount: { $exists: true } })) throw new Error('Legacy money fields require migration.');
      initialized = true;
      const result = await health();
      if (!result.ready) throw new Error('Database readiness check failed.');
      return result;
    } catch {
      initialized = false;
      await connection.close().catch(() => {});
      throw new Error('MongoDB initialization failed. Check connectivity, credentials, permissions and unique indexes.');
    }
  }

  async function disconnect() {
    initialized = false;
    await connection.close();
  }

  return { connection, models, connect, disconnect, status, health };
}

const database = createDatabase();
module.exports = { database, createDatabase, readDatabaseConfig, supportsTransactions };
