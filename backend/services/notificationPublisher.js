const { EVENTS, validateNotification, validId } = require('./notificationContracts');
const { verifyWithDeadline } = require('./verificationDeadline');

// Only trusted server code supplies these adapters. No client event calls publishToUser.
// Defaults fail closed, even if handshake.auth contains a plausible user ID.
function createNotificationPublisher({ io, namespace = io?.of('/'), authenticateSocket, authorizeNotification } = {}) {
  const enabled = Boolean(namespace && typeof authenticateSocket === 'function' && typeof authorizeNotification === 'function');
  const identities = new WeakMap();
  if (enabled) {
    namespace.use(async (socket, next) => {
      try {
        const identity = await verifyWithDeadline((signal) => authenticateSocket(socket, { signal }));
        if (!identity || !validId(identity.userId)) throw new Error('Authentication required.');
        identities.set(socket, Object.freeze({ userId: identity.userId }));
        socket.once('disconnect', () => identities.delete(socket));
        next();
      } catch (failure) {
        const error = new Error('Authentication required.');
        error.data = { code: failure?.code === 'VERIFICATION_TIMEOUT' ? 'AUTH_UNAVAILABLE' : 'AUTH_REQUIRED', retryable: false };
        next(error);
      }
    });
  }
  return Object.freeze({
    enabled,
    async publishToUser(userId, event, payload) {
      if (!enabled) return { ok: false, code: 'FINANCIAL_NOTIFICATIONS_DISABLED' };
      if (!validId(userId) || event === EVENTS.TEST_NOTIFICATION || !validateNotification(event, payload)) {
        return { ok: false, code: 'INVALID_NOTIFICATION' };
      }
      // Snapshot validated values before awaiting authorization.
      const notification = Object.freeze({ ...payload });
      let delivered = 0;
      try {
        // Reauthorize each live session at delivery time, including after reconnect.
        // Never use client-provided rooms or socket.data for trusted identity.
        for (const socket of namespace.sockets.values()) {
          const identity = identities.get(socket);
          if (identity?.userId !== userId || !socket.connected) continue;
          if (await verifyWithDeadline((signal) => authorizeNotification({ socket, userId, event, notification, signal })) !== true) continue;
          if (!socket.connected) continue;
          socket.emit(event, notification);
          delivered += 1;
        }
        return { ok: true, delivered };
      } catch { return { ok: false, code: 'AUTHORIZATION_FAILED', delivered }; }
    },
  });
}
module.exports = { createNotificationPublisher };
