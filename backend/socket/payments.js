const cookieParser = require('cookie-parser');
const { verifyWithDeadline } = require('../services/verificationDeadline');
const { notificationDto } = require('../services/queries');
const { createEventLimiter } = require('./validation');

function initializePaymentSockets(io, runtime, { logger = console } = {}) {
  const namespace = io.of('/payments');
  const identities = new WeakMap();
  const userRoom = (id) => `verified-user:${id}`;
  const sessionRoom = (id) => `verified-session:${id}`;
  namespace.use(async (socket, next) => {
    try {
      if (socket.handshake.headers.origin !== runtime.config.frontendUrl) throw new Error('Origin rejected');
      cookieParser()(socket.request, {}, () => {});
      const identity = await verifyWithDeadline(() => runtime.auth.verify(socket.request.cookies[runtime.config.cookieName]));
      identities.set(socket, identity);
      next();
    } catch {
      const error = new Error('Authentication required.');
      error.data = { code: 'AUTH_REQUIRED', retryable: false }; next(error);
    }
  });
  namespace.on('connection', (socket) => {
    const identity = identities.get(socket);
    socket.join(userRoom(String(identity.user._id)));
    socket.join(sessionRoom(identity.sessionId));
    const limiter = createEventLimiter();
    // No incoming payment/write/join events exist. All mutations use the CSRF-protected API.
    socket.onAny((event, ...args) => {
      if (!limiter.accept()) { socket.disconnect(true); return; }
      const ack = args.at(-1);
      if (typeof ack === 'function') ack({ ok: false, error: { code: 'FORBIDDEN_EVENT', message: 'Use the authenticated HTTP API.' } });
    });
    const remaining = identity.expiresAt.getTime() - Date.now();
    const expires = setTimeout(() => socket.disconnect(true), Math.max(0, remaining));
    expires.unref();
    logger.info('[payments] authenticated client connected');
    socket.once('disconnect', () => { clearTimeout(expires); limiter.clear(); identities.delete(socket); logger.info('[payments] client disconnected'); });
  });
  runtime.disconnectSession = (id) => namespace.in(sessionRoom(id)).disconnectSockets(true);
  runtime.disconnectUser = (id) => namespace.in(userRoom(id)).disconnectSockets(true);
  runtime.socketCount = () => namespace.sockets.size;
  runtime.publish = async ({ transaction, notifications }) => {
    for (const notification of notifications) {
      const userId = String(notification.userId);
      const sockets = await namespace.in(userRoom(userId)).fetchSockets();
      const wallet = await runtime.db.models.Wallet.findOne({ userId });
      const payload = { ...notificationDto(notification), referenceNumber: transaction.referenceNumber };
      for (const socket of sockets) {
        // Recheck session revocation, expiry and account activation at delivery time.
        try { await verifyWithDeadline(() => runtime.auth.verify(identities.get(socket)?.token)); }
        catch { socket.disconnect(true); continue; }
        if (!socket.connected) continue;
        socket.emit('notification:new', payload);
        socket.emit('transaction:updated', { id: String(transaction._id), referenceNumber: transaction.referenceNumber, status: transaction.status });
        if (transaction.status === 'COMPLETED') {
          socket.emit('wallet:updated', { walletId: String(wallet._id), balanceCents: wallet.balanceCents, currency: wallet.currency });
          if (notification.type === 'PAYMENT_SENT') socket.emit('payment:sent', payload);
          if (notification.type === 'PAYMENT_RECEIVED') socket.emit('payment:received', payload);
        }
      }
    }
  };
  return namespace;
}
module.exports = { initializePaymentSockets };
