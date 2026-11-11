const cookieParser = require('cookie-parser');
const { verifyWithDeadline } = require('../services/verificationDeadline');
const { createEventLimiter } = require('./validation');
const { createNotificationPublisher } = require('../services/notificationPublisher');
const { EVENTS, validateNotification } = require('../services/notificationContracts');
const POLICY = require('../../shared/network-policy.json');

function initializePaymentSockets(io, runtime, { logger = console } = {}) {
  const namespace = io.of('/payments');
  const identities = new WeakMap();
  const userRoom = (id) => `verified-user:${id}`;
  const sessionRoom = (id) => `verified-session:${id}`;
  // The existing publisher is the single validated financial publication path,
  // scoped to this authenticated namespace rather than the development namespace.
  const publisher = createNotificationPublisher({ namespace,
    authenticateSocket: async (socket) => {
      if (socket.handshake.headers.origin !== runtime.config.frontendUrl) throw new Error('Origin rejected');
      cookieParser()(socket.request, {}, () => {});
      const identity = await verifyWithDeadline(() => runtime.auth.verify(socket.request.cookies[runtime.config.cookieName]));
      identities.set(socket, identity);
      return { userId: String(identity.user._id) };
    },
    authorizeNotification: async ({ socket, userId, notification }) => {
      let current;
      try { current = await runtime.auth.verify(identities.get(socket)?.token); }
      catch { socket.disconnect(true); return false; }
      if (String(current.user._id) !== userId) { socket.disconnect(true); return false; }
      // Neither client room selection nor a known transaction ID grants ownership.
      return Boolean(await runtime.db.models.Notification.exists({
        _id: notification.id, userId, transactionId: notification.transactionRef,
      }));
    },
  });
  namespace.notificationPublisher = publisher;
  namespace.on('connection', (socket) => {
    const identity = identities.get(socket);
    socket.join(userRoom(String(identity.user._id)));
    socket.join(sessionRoom(identity.sessionId));
    const limiter = createEventLimiter();
    // No incoming payment/write/join events exist. All mutations use the CSRF-protected API.
    const denyIncoming = (event, ...args) => {
      if (!limiter.accept()) { socket.disconnect(true); return; }
      const ack = args.at(-1);
      let tooLarge = false;
      try { tooLarge = Buffer.byteLength(JSON.stringify([event, ...args.filter((arg) => typeof arg !== 'function')])) > POLICY.maxEventBytes; }
      catch { socket.disconnect(true); return; }
      if (typeof ack === 'function') ack({ ok: false, error: tooLarge
        ? { code: 'PAYLOAD_TOO_LARGE', message: 'Event exceeds the 4096-byte limit.' }
        : { code: 'FORBIDDEN_EVENT', message: 'Use the authenticated HTTP API.' } });
    };
    socket.onAny(denyIncoming);
    const remaining = identity.expiresAt.getTime() - Date.now();
    const expires = setTimeout(() => socket.disconnect(true), Math.max(0, remaining));
    expires.unref();
    logger.info('[payments] authenticated client connected');
    socket.once('disconnect', () => { clearTimeout(expires); limiter.clear(); socket.offAny(denyIncoming); identities.delete(socket); logger.info('[payments] client disconnected'); });
  });
  runtime.disconnectSession = (id) => namespace.in(sessionRoom(id)).disconnectSockets(true);
  runtime.disconnectUser = (id) => namespace.in(userRoom(id)).disconnectSockets(true);
  runtime.socketCount = () => namespace.sockets.size;
  runtime.publish = async ({ transaction, notifications }) => {
    for (const notification of notifications) {
      const failed = transaction.status === 'FAILED';
      if (!failed && transaction.status !== 'COMPLETED') throw new Error('Cannot publish an unconfirmed outcome.');
      const info = !failed && notification.type === 'SYSTEM';
      const event = failed ? EVENTS.PAYMENT_FAILED : info ? EVENTS.NOTIFICATION : EVENTS.PAYMENT_COMPLETED;
      const payload = { version: EVENTS.VERSION, id: String(notification._id),
        type: failed ? 'payment.failed' : info ? 'info' : 'payment.completed',
        message: notification.message, timestamp: notification.createdAt.toISOString(), transactionRef: String(transaction._id) };
      if (!validateNotification(event, payload)) throw new Error('Invalid committed notification.');
      const result = await publisher.publishToUser(String(notification.userId), event, payload);
      if (!result.ok) throw new Error('Live delivery unavailable. Persisted state remains authoritative.');
    }
  };
  return namespace;
}
module.exports = { initializePaymentSockets };
