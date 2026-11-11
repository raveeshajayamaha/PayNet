const EVENTS = require('./events');
const { randomUUID } = require('node:crypto');
const { EVENTS: NOTIFICATIONS, validateNotification } = require('../services/notificationContracts');
const { isPlainObject, createEventLimiter } = require('./validation');
const POLICY = require('../../shared/network-policy.json');
const ERRORS = require('../../shared/network-errors.json');
module.exports = function registerHandlers(socket, { environment } = {}) {
  const limiter = createEventLimiter();
  const handlers = [];
  let closed = false;
  socket.use(([event, ...args], next) => {
    if (closed) return;
    const ack = typeof args.at(-1) === 'function' ? args.at(-1) : null;
    const fail = (code) => {
      const error = { code, message: ERRORS[code] };
      if (ack) ack({ ok: false, error });
      else socket.emit(EVENTS.ERROR, error);
    };
    if (!limiter.accept()) { fail('RATE_LIMITED'); return; }
    try {
      if (Buffer.byteLength(JSON.stringify([event, ...args.filter((arg) => typeof arg !== 'function')]), 'utf8') > POLICY.maxEventBytes) {
        fail('PAYLOAD_TOO_LARGE'); return;
      }
    } catch { fail('INVALID_PAYLOAD'); return; }
    if ([NOTIFICATIONS.NOTIFICATION, NOTIFICATIONS.PAYMENT_COMPLETED, NOTIFICATIONS.PAYMENT_FAILED, NOTIFICATIONS.TEST_NOTIFICATION].includes(event)) {
      fail('FORBIDDEN_EVENT', 'Notifications can only be published by the server.'); return;
    }
    if (event === NOTIFICATIONS.TEST_REQUEST && !['development', 'test'].includes(environment)) {
      fail('TEST_NOTIFICATIONS_DISABLED', 'Test notifications are development only.'); return;
    }
    if (![EVENTS.PING, EVENTS.MESSAGE, NOTIFICATIONS.TEST_REQUEST].includes(event)) { fail('UNKNOWN_EVENT', 'Unsupported networking event.'); return; }
    if (!ack || args.length !== 2) { fail('INVALID_PAYLOAD', 'A payload and acknowledgment are required.'); return; }
    next();
  });
  const register = (event, validate, respond) => {
    const handler = (payload, ack) => {
    try {
      if (!validate(payload)) { ack({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid event payload.' } }); return; }
      ack({ ok: true, ...respond(payload), serverTime: new Date().toISOString() });
    } catch {
      ack({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' } });
    }
    };
    handlers.push([event, handler]); socket.on(event, handler);
  };
  const object = isPlainObject;
  register(EVENTS.PING, (p) => object(p) && Object.keys(p).length === 0, () => ({ message: 'pong' }));
  register(NOTIFICATIONS.TEST_REQUEST, (p) => object(p) && Object.keys(p).length === 0, () => {
    const notification = {
      version: NOTIFICATIONS.VERSION, id: randomUUID(), type: 'test',
      message: 'Development test notification. No payment was made.', timestamp: new Date().toISOString(),
    };
    if (!validateNotification(NOTIFICATIONS.TEST_NOTIFICATION, notification)) throw new Error('Invalid notification');
    socket.emit(NOTIFICATIONS.TEST_NOTIFICATION, notification);
    return { notificationId: notification.id, message: 'Nonfinancial test notification sent to this connection only.' };
  });
  register(EVENTS.MESSAGE, (p) => object(p) && Object.keys(p).length === 1 &&
    typeof p.message === 'string' && p.message.trim().length > 0 && p.message.length <= 500,
  (p) => ({ message: p.message.trim() }));
  return () => {
    closed = true; limiter.clear();
    handlers.forEach(([event, handler]) => socket.off(event, handler));
    handlers.length = 0;
  };
};
