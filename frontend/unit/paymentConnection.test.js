import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPaymentConnection } from '../src/services/paymentConnection.js';
import { NOTIFICATION_EVENTS as E } from '../src/services/notificationListener.js';

function setup() {
  const socket = new EventEmitter(), engine = new EventEmitter(), eventTarget = new EventTarget();
  socket.connected = false; socket.active = false; socket.id = undefined;
  socket.io = new EventEmitter(); socket.io.engine = engine; engine.transport = { name: 'websocket' };
  let calls = 0, reconnect = true;
  socket.io.reconnection = (value) => value === undefined ? reconnect : (reconnect = value);
  socket.connect = () => { calls++; socket.active = true; };
  socket.disconnect = () => { const prior = socket.connected; socket.connected = false; socket.active = false; if (prior) socket.emit('disconnect', 'io client disconnect'); };
  return { socket, eventTarget, calls: () => calls, connected: () => { socket.connected = true; socket.active = true; socket.id = 's1'; socket.emit('connect'); } };
}
async function until(predicate) {
  const deadline = performance.now() + 2000;
  while (!predicate()) { if (performance.now() > deadline) throw new Error('Condition timeout'); await new Promise((r) => setTimeout(r, 5)); }
}
test('authenticated reconnection reconciles persisted state and duplicate notices produce one invalidation', async (t) => {
  const f = setup(); let reads = 0;
  const connection = createPaymentConnection({ ...f, reconcile: async () => { reads++; }, pollMs: 60000 }); t.after(() => connection.dispose());
  f.connected(); await until(() => reads === 1);
  const notice = { version: 1, id: 'notice-1', type: 'payment.completed', message: 'Persisted outcome available.', timestamp: new Date().toISOString(), transactionRef: 'tx1' };
  f.socket.emit(E.PAYMENT_COMPLETED, notice); f.socket.emit(E.PAYMENT_COMPLETED, notice);
  await until(() => reads === 2); assert.equal(f.socket.listenerCount(E.PAYMENT_COMPLETED), 1);
  f.socket.connected = false; f.socket.emit('disconnect', 'transport close');
  f.socket.io.emit('reconnect_attempt', 1); f.connected(); await until(() => reads >= 3);
  assert.equal(f.socket.listenerCount(E.PAYMENT_COMPLETED), 1);
  connection.dispose(); assert.equal(f.socket.listenerCount(E.PAYMENT_COMPLETED), 0); assert.equal(f.socket.io.listenerCount('reconnect_attempt'), 0);
});
test('focus and online never restart a permanently blocked or exhausted payment connection', async (t) => {
  const f = setup(); let reads = 0;
  const connection = createPaymentConnection({ ...f, reconcile: async () => { reads++; }, pollMs: 60000 }); t.after(() => connection.dispose());
  f.socket.emit('connect_error', { data: { code: 'AUTH_REQUIRED', retryable: false } });
  f.eventTarget.dispatchEvent(new Event('focus')); f.eventTarget.dispatchEvent(new Event('online'));
  await until(() => reads > 0); assert.equal(f.calls(), 1); assert.equal(connection.getSnapshot().status, 'blocked');
  connection.reconnect(); assert.equal(f.calls(), 2);
  f.socket.io.emit('reconnect_failed'); f.eventTarget.dispatchEvent(new Event('focus'));
  assert.equal(f.calls(), 2); assert.equal(connection.getSnapshot().retryStatus, 'exhausted');
});
