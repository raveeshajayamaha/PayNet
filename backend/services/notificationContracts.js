const EVENTS = require('../../shared/notification-events.json');
const { isPlainObject } = require('../socket/validation');
const TYPES = new Map([
  [EVENTS.NOTIFICATION, 'info'],
  [EVENTS.PAYMENT_COMPLETED, 'payment.completed'],
  [EVENTS.PAYMENT_FAILED, 'payment.failed'],
  [EVENTS.TEST_NOTIFICATION, 'test'],
]);
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
function validateNotification(event, payload) {
  if (!isPlainObject(payload) || !TYPES.has(event)) return false;
  if (!['version', 'id', 'type', 'message', 'timestamp'].every((key) => Object.hasOwn(payload, key))) return false;
  const keys = ['version', 'id', 'type', 'message', 'timestamp', 'transactionRef'];
  if (Object.keys(payload).some((key) => !keys.includes(key))) return false;
  if (payload.version !== EVENTS.VERSION || !validId(payload.id) || payload.type !== TYPES.get(event)) return false;
  if (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 500) return false;
  if (typeof payload.timestamp !== 'string' || !Number.isFinite(Date.parse(payload.timestamp)) ||
    new Date(payload.timestamp).toISOString() !== payload.timestamp) return false;
  if ('transactionRef' in payload && !validId(payload.transactionRef)) return false;
  if (event === EVENTS.TEST_NOTIFICATION && 'transactionRef' in payload) return false;
  return true;
}
module.exports = { EVENTS, validateNotification, validId };
