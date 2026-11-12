const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('node:path');
const { createServer } = require('node:http');
const initializeSocket = require('./socket');
const { database } = require('./config/database');
const { readSecurityConfig } = require('./config/security');
const { createApp } = require('./app');
const { createRuntime } = require('./services/runtime');
const { initializePaymentSockets } = require('./socket/payments');
require('dotenv').config({ path: path.join(__dirname, '.env') });

function createPayNetServer(options = {}) {
  const db = options.database || database;
  const env = options.env || process.env;
  const environment = options.environment || env.NODE_ENV || 'development';
  const FRONTEND_URL = options.frontendUrl || env.FRONTEND_URL || 'http://localhost:5173';
  const config = readSecurityConfig({ ...env, NODE_ENV: environment, FRONTEND_URL });
  const runtime = createRuntime(db, config, options);
  const app = createApp(runtime, options);

  const server = createServer(app);
  const io = initializeSocket(server, {
    environment,
    frontendUrl: FRONTEND_URL, logger: options.logger,
    allowedOrigins: options.allowedOrigins,
    authenticateSocket: options.authenticateSocket,
    authorizeNotification: options.authorizeNotification,
    paymentsEnabled: Boolean(config.secret),
  });
  const paymentSockets = io && config.secret ? initializePaymentSockets(io, runtime, options) : null;
  return { app, server, io, runtime, paymentSockets };
}

async function startPayNetServer(options = {}) {
  const env = options.env || process.env;
  const db = options.database || database;
  const logger = options.logger || console;
  const environment = options.environment || env.NODE_ENV || 'development';
  const port = options.port ?? env.PORT ?? 5000;
  let instance;
  let connecting = false;
  let connectionAttempt = Promise.resolve();
  let reconnectTimer;
  const connect = () => {
    if (connecting || db.status().initialized) return connectionAttempt;
    connecting = true;
    connectionAttempt = (async () => { try {
      const health = await db.connect(env);
      logger.info('MongoDB connected; collections and indexes are ready.');
      if (!health.transactionsSupported) logger.warn('MongoDB transactions are unavailable; configure a replica set or Atlas.');
    } catch { logger.warn('MongoDB unavailable. API health remains available; database operations are disabled.'); }
    finally { connecting = false; } })();
    return connectionAttempt;
  };
  try {
    if (env.MONGODB_URI) {
      await connect();
    } else if (environment === 'development' || environment === 'test') {
      // Preserve the existing UI/network demo when a database is not configured.
      logger.warn('MONGODB_URI is unset; running the UI/network demo without a database.');
    } else {
      throw new Error('MONGODB_URI is required outside development/test.');
    }
    readSecurityConfig({ ...env, NODE_ENV: environment }, { strictProduction: true });
    instance = createPayNetServer({ ...options, env, database: db, environment, frontendUrl: options.frontendUrl || env.FRONTEND_URL });
    await new Promise((resolve, reject) => {
      const failed = (error) => reject(error);
      instance.server.once('error', failed);
      instance.server.listen(port, options.host, () => {
        instance.server.off('error', failed);
        resolve();
      });
    });
  } catch (error) {
    if (instance?.io) await new Promise((resolve) => instance.io.close(resolve));
    await db.disconnect();
    throw error;
  }
  if (env.MONGODB_URI) { reconnectTimer = setInterval(() => { void connect(); }, 10000); reconnectTimer.unref(); }
  let closePromise;
  const close = () => {
    closePromise ??= (async () => {
      clearInterval(reconnectTimer);
      await new Promise((resolve) => {
        if (instance.io) instance.io.close(resolve);
        else instance.server.close(resolve);
      });
      await connectionAttempt;
      await db.disconnect();
    })();
    return closePromise;
  };
  logger.info(`PayNet API is running at http://localhost:${instance.server.address().port}`);
  return { ...instance, close };
}

if (require.main === module) {
  startPayNetServer().then(({ close }) => {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        const deadline = setTimeout(() => process.exit(1), 10000);
        deadline.unref();
        close().then(() => process.exit(0), () => process.exit(1));
      });
    }
  }).catch(() => {
    // Driver errors may contain the URI/password. Never print the raw exception.
    console.error('Could not start PayNet API. Check MongoDB configuration, connectivity, indexes and the HTTP port.');
    process.exitCode = 1;
  });
}
module.exports = { createPayNetServer, startPayNetServer };
