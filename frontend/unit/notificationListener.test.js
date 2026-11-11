import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { subscribeNotifications, NOTIFICATION_EVENTS as E, isNotification } from '../src/services/notificationListener.js';
const notice = (id = 'notice-1') => ({ version: 1, id, type: 'test', message: 'No payment was made.', timestamp: '2026-11-11T10:00:00.000Z' });

test('subscribers share one listener, deduplicate IDs and clean up exact handlers', () => {
  const socket = new EventEmitter(); let a = 0, b = 0;
  const unrelated = () => {};
  socket.on(E.TEST_NOTIFICATION, unrelated);
  const stopA = subscribeNotifications(socket, () => a++), stopB = subscribeNotifications(socket, () => b++);
  assert.equal(socket.listenerCount(E.TEST_NOTIFICATION), 2);
  socket.emit(E.TEST_NOTIFICATION, notice()); socket.emit(E.TEST_NOTIFICATION, notice());
  assert.deepEqual([a, b], [1, 1]);
  stopA(); stopA(); socket.emit(E.TEST_NOTIFICATION, notice('notice-2'));
  assert.deepEqual([a, b], [1, 2]);
  stopB(); assert.deepEqual(socket.listeners(E.TEST_NOTIFICATION), [unrelated]);
});
test('disconnect/reconnect preserves a single subscription, remount cleans up', () => {
  const socket = new EventEmitter(); let count = 0;
  let stop = subscribeNotifications(socket, () => count++);
  socket.emit('disconnect'); socket.emit('connect'); socket.emit(E.TEST_NOTIFICATION, notice());
  assert.equal(count, 1); assert.equal(socket.listenerCount(E.TEST_NOTIFICATION), 1);
  stop(); assert.equal(socket.listenerCount(E.TEST_NOTIFICATION), 0);
  stop = subscribeNotifications(socket, () => count++);
  socket.emit(E.TEST_NOTIFICATION, notice('notice-2')); stop();
  assert.equal(count, 2); assert.equal(socket.listenerCount(E.TEST_NOTIFICATION), 0);
});
test('malformed payloads are ignored and unauthenticated listeners exclude financial events', () => {
  const socket = new EventEmitter(); let count = 0;
  const stop = subscribeNotifications(socket, () => count++);
  for (const payload of [null, {}, { ...notice(), version: 2 }, { ...notice(), transactionRef: 'tx1' }, { ...notice(), message: '<script>', recipientId: 'victim' }]) {
    assert.equal(isNotification(E.TEST_NOTIFICATION, payload), false);
    socket.emit(E.TEST_NOTIFICATION, payload);
  }
  assert.equal(socket.listenerCount(E.PAYMENT_COMPLETED), 0);
  socket.emit(E.PAYMENT_COMPLETED, { ...notice(), type: 'payment.completed' });
  assert.equal(count, 0); stop();
});
test('future authenticated adapter validates versioned financial events and removes all listeners', () => {
  const socket = new EventEmitter(); const received = [];
  const stop = subscribeNotifications(socket, (item, event) => received.push([item, event]), { authenticated: true });
  const payload = { ...notice(), type: 'payment.failed', transactionRef: 'tx-1' };
  socket.emit(E.PAYMENT_FAILED, payload);
  assert.deepEqual(received, [[payload, E.PAYMENT_FAILED]]);
  stop(); assert.equal(socket.eventNames().length, 0);
});
