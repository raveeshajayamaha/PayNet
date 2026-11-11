import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createConnectionManager, CONNECTION_OPTIONS, safeNetworkError } from '../src/services/connectionManager.js';

function fixture() {
  const socket = new EventEmitter(), engine = new EventEmitter();
  socket.connected = false; socket.active = false; socket.id = undefined;
  socket.io = new EventEmitter(); socket.io.engine = engine; engine.transport = { name: 'polling' };
  let reconnect = true, calls = 0;
  socket.io.reconnection = (value) => value === undefined ? reconnect : (reconnect = value);
  socket.connect = () => { calls++; socket.active = true; };
  socket.disconnect = () => {
    const wasConnected = socket.connected; socket.connected = false; socket.active = false;
    if (wasConnected) socket.emit('disconnect', 'io client disconnect');
  };
  const establish = (id = 'socket-1') => { socket.connected = true; socket.active = true; socket.id = id; socket.emit('connect'); };
  return { socket, engine, establish, calls: () => calls };
}

test('shared consumers create one connection and idempotent releases preserve active consumers', () => {
  const f = fixture(), manager = createConnectionManager(f.socket);
  const a = manager.retain(), b = manager.retain();
  assert.equal(f.calls(), 1); f.establish();
  assert.equal(manager.getSnapshot().status, 'connected');
  a(); a(); assert.equal(f.socket.connected, true);
  b(); assert.equal(f.socket.connected, false);
  assert.equal(manager.getSnapshot().socketId, '');
  manager.dispose();
});

test('transport upgrades, count validation, retry state and monotonic uptime origin stay synchronized', () => {
  const f = fixture(); let now = 100;
  const manager = createConnectionManager(f.socket, { now: () => now });
  const release = manager.retain(); f.establish();
  f.socket.emit('network:clients', { count: 2 });
  assert.equal(manager.getSnapshot().clientCount, 2);
  f.socket.emit('network:clients', { count: -1 }); assert.equal(manager.getSnapshot().clientCount, 2);
  assert.equal(manager.getSnapshot().connectedSince, 100);
  f.engine.transport.name = 'websocket'; f.engine.emit('upgrade');
  assert.equal(manager.getSnapshot().transport, 'websocket');
  f.socket.connected = false; f.socket.emit('disconnect', 'transport close');
  assert.equal(manager.getSnapshot().retryStatus, 'waiting-to-retry');
  assert.equal(manager.getSnapshot().transport, null);
  assert.equal(f.engine.listenerCount('upgrade'), 0);
  f.socket.io.emit('reconnect_attempt', 1); assert.equal(manager.getSnapshot().attempts, 1);
  now = 500; f.establish('socket-2');
  assert.equal(manager.getSnapshot().connectedSince, 500); assert.equal(f.engine.listenerCount('upgrade'), 1);
  release(); manager.dispose();
});

test('permanent authorization failures stop retries and consumers cannot silently override them', () => {
  const f = fixture(), manager = createConnectionManager(f.socket);
  const release = manager.retain();
  f.socket.emit('connect_error', { message: 'private-token', data: { code: 'AUTH_REQUIRED', retryable: false } });
  assert.equal(manager.getSnapshot().status, 'blocked');
  assert.equal(f.socket.io.reconnection(), false); assert.equal(f.socket.active, false);
  const extraRelease = manager.retain(); extraRelease(); assert.equal(f.calls(), 1);
  assert.equal(JSON.stringify(manager.getSnapshot()).includes('private-token'), false);
  manager.connect(); assert.equal(f.calls(), 2); assert.equal(f.socket.io.reconnection(), true);
  release(); manager.dispose();
});

test('temporary errors are sanitized, bounded, and cleared after recovery; retry exhaustion needs manual action', () => {
  const f = fixture(), manager = createConnectionManager(f.socket);
  const release = manager.retain();
  for (let i = 0; i < 15; i++) f.socket.emit('connect_error', { message: 'secret-provider-details' });
  assert.equal(manager.getSnapshot().recentErrors.length, 10);
  assert.equal(manager.getSnapshot().retryStatus, 'waiting-to-retry');
  assert.equal(JSON.stringify(manager.getSnapshot()).includes('secret-provider'), false);
  f.socket.io.emit('reconnect_failed');
  assert.equal(manager.getSnapshot().retryStatus, 'exhausted');
  f.socket.active = false;
  const extra = manager.retain(); extra(); assert.equal(f.calls(), 1);
  manager.connect(); f.establish(); assert.equal(manager.getSnapshot().error, null);
  assert.equal(manager.getSnapshot().recentErrors.length, 10);
  release(); manager.dispose();
});

test('dispose removes exact lifecycle/manager/transport listeners without removing unrelated listeners', () => {
  const f = fixture(), unrelated = () => {};
  f.socket.on('connect', unrelated); f.socket.io.on('reconnect_attempt', unrelated); f.engine.on('upgrade', unrelated);
  const manager = createConnectionManager(f.socket); let notifications = 0;
  const unsubscribe = manager.subscribe(() => notifications++);
  const release = manager.retain(); f.establish();
  assert.equal(f.socket.listenerCount('connect'), 2);
  unsubscribe(); const before = notifications;
  manager.dispose(); manager.dispose(); release();
  assert.deepEqual(f.socket.listeners('connect'), [unrelated]);
  assert.deepEqual(f.socket.io.listeners('reconnect_attempt'), [unrelated]);
  assert.deepEqual(f.engine.listeners('upgrade'), [unrelated]);
  assert.equal(f.socket.listenerCount('network:clients'), 0);
  assert.equal(notifications, before);
});

test('server-directed disconnect stops retries and explicit disconnect persists across consumers', () => {
  const f = fixture(), manager = createConnectionManager(f.socket);
  const release = manager.retain(); f.establish();
  f.socket.connected = false; f.socket.active = false; f.socket.emit('disconnect', 'io server disconnect');
  assert.equal(manager.getSnapshot().status, 'blocked'); assert.equal(f.socket.io.reconnection(), false);
  manager.connect(); f.establish(); manager.disconnect();
  const extra = manager.retain(); assert.equal(f.calls(), 2);
  extra(); release(); manager.dispose();
});

test('reconnection policy is finite and errors never echo untrusted server messages', () => {
  assert.equal(CONNECTION_OPTIONS.reconnectionAttempts, 8);
  assert.equal(CONNECTION_OPTIONS.reconnectionDelay, 500);
  assert.equal(CONNECTION_OPTIONS.reconnectionDelayMax, 5000);
  assert.equal(CONNECTION_OPTIONS.randomizationFactor, 0.5);
  assert.equal(safeNetworkError({ code: 'INVALID_PAYLOAD', message: 'secret' }).message, 'Invalid event payload.');
  assert.equal(safeNetworkError({ code: '__proto__', message: 'secret' }).code, 'INTERNAL_ERROR');
});
