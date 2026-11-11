import EVENTS from '../../../shared/notification-events.json' with { type: 'json' };
export { EVENTS as NOTIFICATION_EVENTS };
const expectedTypes = new Map([
  [EVENTS.NOTIFICATION, 'info'], [EVENTS.PAYMENT_COMPLETED, 'payment.completed'],
  [EVENTS.PAYMENT_FAILED, 'payment.failed'], [EVENTS.TEST_NOTIFICATION, 'test'],
]);
export function isNotification(event, value) {
  const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
  const plain = value && typeof value === 'object' && [null, Object.prototype].includes(Object.getPrototypeOf(value));
  return Boolean(plain && ['version', 'id', 'type', 'message', 'timestamp'].every((key) => Object.hasOwn(value, key)) &&
    expectedTypes.has(event) && value.version === EVENTS.VERSION && id(value.id) &&
    value.type === expectedTypes.get(event) && typeof value.message === 'string' &&
    value.message.trim() && value.message.length <= 500 &&
    typeof value.timestamp === 'string' && Number.isFinite(Date.parse(value.timestamp)) &&
    new Date(value.timestamp).toISOString() === value.timestamp &&
    Object.keys(value).every((key) => ['version', 'id', 'type', 'message', 'timestamp', 'transactionRef'].includes(key)) &&
    (!('transactionRef' in value) || (event !== EVENTS.TEST_NOTIFICATION && id(value.transactionRef))));
}
const subscriptions = new WeakMap();
// Financial listening remains opt-in for future real authentication integration.
export function subscribeNotifications(socket, receive, { authenticated = false } = {}) {
  let entries = subscriptions.get(socket);
  if (!entries) { entries = new Map(); subscriptions.set(socket, entries); }
  const events = authenticated ? [...expectedTypes.keys()] : [EVENTS.TEST_NOTIFICATION];
  const releases = events.map((event) => {
    let entry = entries.get(event);
    if (!entry) {
      const callbacks = new Set(), seen = new Set();
      const handler = (value) => {
        if (!isNotification(event, value) || seen.has(value.id)) return;
        seen.add(value.id);
        if (seen.size > 200) seen.delete(seen.values().next().value);
        for (const callback of callbacks) callback(value, event);
      };
      entry = { callbacks, handler };
      entries.set(event, entry);
      socket.on(event, handler);
    }
    const callback = (...args) => receive(...args);
    entry.callbacks.add(callback);
    return () => {
      entry.callbacks.delete(callback);
      if (!entry.callbacks.size) { socket.off(event, entry.handler); entries.delete(event); }
    };
  });
  let released = false;
  return () => { if (!released) { released = true; releases.forEach((release) => release()); } };
}
