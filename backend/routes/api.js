const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { schemas, validate, parse, id, idempotencyKey } = require('../middleware/validation');
const { createAuthMiddleware } = require('../middleware/auth');
const { AppError } = require('../utils/errors');

function createApiRoutes(runtime) {
  const router = express.Router();
  const { db, auth, queries, payments, config } = runtime;
  const { authenticated, csrf, admin } = createAuthMiddleware(runtime);
  const limiter = (limit, windowMs) => rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } }),
  });
  const authLimit = limiter(40, 15 * 60 * 1000), paymentLimit = limiter(60, 60000);
  const sendSession = (res, result, status = 200) => {
    const { token, persistent, ...data } = result;
    res.cookie(config.cookieName, token, { ...config.cookie, ...(persistent ? { maxAge: config.seconds * 1000 } : {}) });
    res.status(status).json({ success: true, ...data });
  };
  router.use((req, res, next) => {
    if (!db.status().initialized) return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'Database unavailable. Please try again.'));
    if (!config.secret) return next(new AppError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured.'));
    next();
  });
  router.post('/auth/register', authLimit, validate(schemas.register), async (req, res) => sendSession(res, await auth.register(req.input), 201));
  router.post('/auth/login', authLimit, validate(schemas.login), async (req, res) => sendSession(res, await auth.login(req.input)));
  router.get('/auth/me', authenticated, async (req, res) => res.json({ success: true, ...await auth.snapshot(req.identity.user, req.identity.sessionId) }));
  router.post('/auth/logout', authenticated, csrf, async (req, res) => {
    await db.models.Session.deleteOne({ _id: req.identity.sessionId, userId: req.identity.user._id });
    runtime.disconnectSession(req.identity.sessionId);
    res.clearCookie(config.cookieName, config.cookie).json({ success: true });
  });
  router.use(authenticated);
  router.get('/wallet', async (req, res) => res.json({ success: true, wallet: queries.walletDto(await queries.walletFor(req.identity.user._id)) }));
  router.get('/wallet/balance', async (req, res) => {
    const wallet = await queries.walletFor(req.identity.user._id);
    res.json({ success: true, balanceCents: wallet.balanceCents, currency: wallet.currency });
  });
  router.get(['/wallet/summary', '/transactions/summary'], async (req, res) => res.json({ success: true, demoFundingEnabled: config.demoFunding, ...await queries.summary(req.identity.user._id) }));
  const payment = (funding) => async (req, res) => {
    if (funding && !config.demoFunding) throw new AppError(403, 'DEMO_FUNDING_DISABLED', 'Demo funding is disabled.');
    const key = parse(idempotencyKey, req.get('Idempotency-Key'));
    const result = await payments[funding ? 'fund' : 'send'](req.identity.user._id, req.input, key);
    const transaction = await queries.transaction(req.identity.user._id, String(result.transaction._id));
    res.status(result.replayed ? 200 : 201).json({ success: true, transaction, replayed: result.replayed });
  };
  router.post('/wallet/demo-fund', paymentLimit, csrf, validate(schemas.fund), payment(true));
  router.post('/transfers/send', paymentLimit, csrf, validate(schemas.transfer), payment(false));
  router.get('/transactions', async (req, res) => res.json({ success: true, ...await queries.listTransactions(req.identity.user._id, parse(schemas.list, req.query)) }));
  router.get(['/transactions/:id', '/transfers/:id'], async (req, res) => res.json({ success: true, transaction: await queries.transaction(req.identity.user._id, parse(id, req.params.id)) }));
  router.get('/notifications', async (req, res) => res.json({ success: true, ...await queries.notifications(req.identity.user._id, parse(schemas.list, req.query)) }));
  router.get('/notifications/unread-count', async (req, res) => res.json({ success: true, unreadCount: await db.models.Notification.countDocuments({ userId: req.identity.user._id, isRead: false }) }));
  router.patch('/notifications/read-all', csrf, async (req, res) => {
    await db.models.Notification.updateMany({ userId: req.identity.user._id, isRead: false }, { $set: { isRead: true } });
    res.json({ success: true });
  });
  router.patch('/notifications/:id/read', csrf, async (req, res) => {
    const notification = await db.models.Notification.findOneAndUpdate({ _id: parse(id, req.params.id), userId: req.identity.user._id }, { $set: { isRead: true } }, { returnDocument: 'after' });
    if (!notification) throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
    res.json({ success: true, notification: queries.notificationDto(notification) });
  });
  router.get('/users/profile', async (req, res) => res.json({ success: true, ...await auth.snapshot(req.identity.user, req.identity.sessionId) }));
  router.patch('/users/profile', csrf, validate(schemas.profile), async (req, res) => {
    const user = await db.models.User.findByIdAndUpdate(req.identity.user._id, { $set: { fullName: req.input.fullName } }, { returnDocument: 'after', runValidators: true });
    res.json({ success: true, user: queries.userDto(user) });
  });
  router.patch('/users/change-password', authLimit, csrf, validate(schemas.password), async (req, res) => {
    const result = await auth.changePassword(req.identity, req.input);
    runtime.disconnectUser(String(req.identity.user._id));
    sendSession(res, result);
  });
  router.use('/admin', admin);
  router.get('/admin/dashboard', async (req, res) => res.json({ success: true, ...await queries.adminDashboard() }));
  router.get('/admin/users', async (req, res) => {
    const options = parse(schemas.list, req.query);
    const regex = options.search ? new RegExp(options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const filter = regex ? { $or: [{ email: regex }, { fullName: regex }] } : {};
    const [records, total] = await Promise.all([db.models.User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((options.page - 1) * options.limit).limit(options.limit), db.models.User.countDocuments(filter)]);
    res.json({ success: true, items: records.map(queries.userDto), total, page: options.page, pages: Math.max(1, Math.ceil(total / options.limit)) });
  });
  router.get('/admin/transactions', async (req, res) => res.json({ success: true, ...await queries.listTransactions(null, parse(schemas.list, req.query), true) }));
  router.get('/admin/system-health', async (req, res) => res.json({ success: true, api: 'running', uptimeSeconds: Math.floor(process.uptime()), database: await db.health(), sockets: runtime.socketCount(), demoFundingEnabled: config.demoFunding }));
  return router;
}
module.exports = { createApiRoutes };
