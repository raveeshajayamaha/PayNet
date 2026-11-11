const { performance } = require('node:perf_hooks');
const POLICY = require('../../shared/network-policy.json');
function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function createEventLimiter({ now = () => performance.now() } = {}) {
  let timestamps = [];
  return {
    accept() {
      const current = now();
      timestamps = timestamps.filter((time) => current - time < POLICY.rateWindowMs);
      if (timestamps.length >= POLICY.eventsPerWindow) return false;
      timestamps.push(current); return true;
    },
    clear() { timestamps = []; },
  };
}
module.exports = { isPlainObject, createEventLimiter };
