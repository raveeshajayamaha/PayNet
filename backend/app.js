const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { createApiRoutes } = require('./routes/api');
const { AppError, errorHandler } = require('./utils/errors');

function createApp(runtime, { logger = console } = {}) {
  const app = express();
  const { db, config } = runtime;
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.frontendUrl, credentials: true, exposedHeaders: ['RateLimit', 'Retry-After'] }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.once('finish', () => logger.info(`[http] ${req.method} ${res.statusCode}`));
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.get('/api/health', (req, res) => res.json({ success: true, message: 'PayNet API is running', database: db.status() }));
  app.get(['/api/db-health', '/api/health/database'], async (req, res) => {
    try {
      const health = await db.health();
      res.status(health.ready ? 200 : 503).json({ success: health.ready, database: health });
    } catch { res.status(503).json({ success: false, message: 'MongoDB health check failed' }); }
  });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('Origin') !== config.frontendUrl || req.get('X-PayNet-Request') !== '1') {
        return next(new AppError(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.'));
      }
      if (!req.is('application/json')) return next(new AppError(415, 'JSON_REQUIRED', 'Send an application/json request.'));
    }
    next();
  }, createApiRoutes(runtime));
  app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint not found.')));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
