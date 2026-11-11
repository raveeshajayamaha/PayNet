const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const { createSocketConfig } = require('../socket/config');
const { createEventLimiter } = require('../socket/validation');
const { verifyWithDeadline } = require('../services/verificationDeadline');
const { validateNotification, EVENTS: N } = require('../services/notificationContracts');
const E = require('../socket/events');
const POLICY = require('../../shared/network-policy.json');
const { createNetworkHarness, connectClient, request, waitForEvent, waitUntil } = require('../testing/networkHarness');

test('origin configuration rejects wildcards, paths, credentials and empty allowlists', () => {
  for (const origin of ['*', 'https://*.example.com', 'null', '', 'https://example.com/path', 'https://user:password@example.com', 'http://localhost:5173/', 'not-a-url']) {
    assert.throws(() => createSocketConfig({ environment: 'test', allowedOrigins: origin }));
  }
  assert.throws(() => createSocketConfig({ environment: 'test', allowedOrigins: [] }));
  assert.equal(createSocketConfig({ environment: 'production', allowedOrigins: '*' }), null);
  assert.equal(createSocketConfig({ environment: 'staging', allowedOrigins: '*' }), null);
});

test('exact allowlist protects polling, websocket and CORS preflight', { timeout: 15000 }, async (t) => {
  const origins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const harness = await createNetworkHarness({ allowedOrigins: origins }); t.after(() => harness.close());
  for (const transport of ['polling', 'websocket']) {
    for (const origin of origins) {
      const socket = harness.client({ transports: [transport], extraHeaders: { Origin: origin } });
      await connectClient(socket); assert.equal((await request(socket, E.PING)).ok, true); socket.disconnect();
    }
    for (const origin of ['null', 'http://localhost:5173.evil.example', 'https://unapproved.example', 'http://localhost:5173/']) {
      const socket = harness.client({ transports: [transport], extraHeaders: { Origin: origin } });
      await assert.rejects(connectClient(socket), { code: 'CONNECTION_FAILED' }); socket.disconnect();
    }
  }
  for (const origin of [origins[0], 'https://unapproved.example']) {
    const response = await fetch(`${harness.url}/socket.io/?EIO=4&transport=polling`, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(response.headers.get('access-control-allow-origin'), origin === origins[0] ? origin : null);
    assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
  }
});

test('application byte limit safely rejects a large event and keeps other clients working', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const a = harness.client(), b = harness.client(); await Promise.all([connectClient(a), connectClient(b)]);
  const response = await request(a, E.MESSAGE, { message: 'x'.repeat(POLICY.maxEventBytes + 100) });
  assert.equal(response.error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(JSON.stringify(response).includes('xxx'), false);
  assert.equal((await request(a, E.PING)).ok, true);
  assert.equal((await request(b, E.PING)).ok, true);
});

for (const transport of ['polling', 'websocket']) {
  test(`${transport} oversized transport packet disconnects safely and releases server clients`, { timeout: 10000 }, async (t) => {
    const harness = await createNetworkHarness(); t.after(() => harness.close());
    const socket = harness.client({ transports: [transport] }); await connectClient(socket);
    const disconnected = waitForEvent(socket, 'disconnect');
    socket.emit(E.MESSAGE, { message: 'x'.repeat(POLICY.maxPacketBytes + 1024) });
    await disconnected;
    await waitUntil(() => harness.io.of('/').sockets.size === 0 && harness.io.engine.clientsCount === 0);
    assert.equal(socket.connected, false);
  });
}

test('sliding rate limit has bounded windows without a wall-clock boundary burst', () => {
  let now = 0; const limiter = createEventLimiter({ now: () => now });
  for (let i = 0; i < 10; i++) assert.equal(limiter.accept(), true);
  now = 5000;
  for (let i = 0; i < 10; i++) assert.equal(limiter.accept(), true);
  assert.equal(limiter.accept(), false);
  now = 10000;
  for (let i = 0; i < 10; i++) assert.equal(limiter.accept(), true);
  assert.equal(limiter.accept(), false);
  limiter.clear(); assert.equal(limiter.accept(), true);
});

test('per-socket rate limiting includes invalid traffic without affecting unrelated sockets', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const a = harness.client(), b = harness.client(); await Promise.all([connectClient(a), connectClient(b)]);
  for (let i = 0; i < POLICY.eventsPerWindow; i++) {
    assert.equal((await request(a, 'unsupported:event', {})).error.code, 'UNKNOWN_EVENT');
  }
  assert.equal((await request(a, E.PING)).error.code, 'RATE_LIMITED');
  assert.equal((await request(b, E.PING)).ok, true);
});

test('financial, private-room and count-spoofing attempts cannot change memberships or leak notices', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const a = harness.client({ auth: { userId: 'victim', authenticated: true } }), b = harness.client();
  await Promise.all([connectClient(a), connectClient(b)]);
  let notices = 0; b.on(N.TEST_NOTIFICATION, () => notices++);
  for (const event of ['join', 'join-room', 'room:join', 'subscribe', 'user:subscribe', E.COUNT]) {
    assert.equal((await request(a, event, { recipientId: b.id, room: b.id })).error.code, 'UNKNOWN_EVENT');
  }
  for (const event of [N.NOTIFICATION, N.PAYMENT_COMPLETED, N.PAYMENT_FAILED]) {
    assert.equal((await request(a, event, {})).error.code, 'FORBIDDEN_EVENT');
  }
  assert.deepEqual([...harness.io.of('/').sockets.get(a.id).rooms], [a.id]);
  assert.equal(harness.io.notificationPublisher.enabled, false);
  await request(a, N.TEST_REQUEST); await request(b, E.PING); assert.equal(notices, 0);
});

test('malformed and binary empty objects cannot bypass payload contracts', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const socket = harness.client(); await connectClient(socket);
  for (const payload of [null, [], '', 42, Buffer.alloc(0), { constructor: {} }]) {
    assert.equal((await request(socket, E.PING, payload)).error.code, 'INVALID_PAYLOAD');
  }
  const inherited = Object.create({ version: 1, id: 'n1', type: 'test', message: 'test', timestamp: new Date().toISOString() });
  assert.equal(validateNotification(N.TEST_NOTIFICATION, inherited), false);
});

test('application logging never records payloads, credentials, user IDs or raw socket errors', { timeout: 10000 }, async (t) => {
  const lines = [], logger = { info: (line) => lines.push(line), warn: (line) => lines.push(line) };
  const harness = await createNetworkHarness({ logger }); t.after(() => harness.close());
  const marker = 'private-marker-never-log';
  const socket = harness.client({ auth: { token: marker } }); await connectClient(socket);
  const serverSocket = harness.io.of('/').sockets.get(socket.id), id = socket.id;
  await request(socket, E.MESSAGE, { message: marker });
  serverSocket.emitReserved('error', new Error(marker)); socket.disconnect();
  await waitUntil(() => harness.io.of('/').sockets.size === 0);
  assert.equal(lines.some((line) => line.includes(marker) || line.includes(id)), false);
  assert.ok(lines.some((line) => line.includes('socket error')));
  assert.equal(serverSocket.listeners(E.PING).length, 0);
  assert.equal(serverSocket.listeners(E.MESSAGE).length, 0);
  assert.equal(serverSocket.listeners(N.TEST_REQUEST).length, 0);
  assert.equal(harness.io.of('/').adapter.rooms.size, 0);
});

test('verification deadline rejects unavailable providers and cancels their wait', async () => {
  let signal;
  await assert.rejects(verifyWithDeadline((value) => { signal = value; return new Promise(() => {}); }, 30), { code: 'VERIFICATION_TIMEOUT' });
  assert.equal(signal.aborted, true);
});

test('real authorization rejection stops frontend retries with a sanitized permanent error', { timeout: 10000 }, async (t) => {
  let attempts = 0;
  const harness = await createNetworkHarness({ authenticateSocket: async () => { attempts++; throw new Error('private-session-token'); }, authorizeNotification: async () => true });
  t.after(() => harness.close());
  const { createConnectionManager, CONNECTION_OPTIONS } = await import('../../frontend/src/services/connectionManager.js');
  const socket = createClient(harness.url, { ...CONNECTION_OPTIONS, forceNew: true });
  const manager = createConnectionManager(socket); t.after(() => manager.dispose());
  const error = waitForEvent(socket, 'connect_error'); const release = manager.retain(); t.after(release);
  const [failure] = await error;
  assert.deepEqual(failure.data, { code: 'AUTH_REQUIRED', retryable: false });
  assert.equal(manager.getSnapshot().status, 'blocked');
  assert.equal(manager.getSnapshot().error.code, 'AUTH_REQUIRED');
  assert.equal(JSON.stringify(manager.getSnapshot()).includes('private-session-token'), false);
  assert.equal(socket.active, false); assert.equal(socket.io.reconnection(), false); assert.equal(attempts, 1);
  const secondRelease = manager.retain(); secondRelease(); assert.equal(attempts, 1);
  assert.equal(harness.io.of('/').sockets.size, 0);
});

test('frontend timeout bounds, cancellation cleanup and safe responses work on real sockets', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const socket = harness.client(); await connectClient(socket);
  const { sendAcknowledged } = await import('../../frontend/src/services/socketRequest.js');
  for (const timeoutMs of [0, -1, Infinity, 5001]) await assert.rejects(sendAcknowledged(socket, E.PING, {}, { timeoutMs }), RangeError);
  await assert.rejects(sendAcknowledged(socket, 'connect', {}), { code: 'UNKNOWN_EVENT' });
  const serverSocket = harness.io.of('/').sockets.get(socket.id); serverSocket.removeAllListeners(E.PING);
  serverSocket.on(E.PING, (_, ack) => ack({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'private-key-never-show' } }));
  await assert.rejects(sendAcknowledged(socket, E.PING, {}), (error) => error.code === 'INVALID_PAYLOAD' && !error.message.includes('private-key'));
  serverSocket.removeAllListeners(E.PING); serverSocket.on(E.PING, () => {});
  const baseline = socket.listeners('disconnect').length;
  const controller = new AbortController(); const pending = sendAcknowledged(socket, E.PING, {}, { signal: controller.signal });
  controller.abort(new Error('Cancelled.')); await assert.rejects(pending, /Cancelled/);
  assert.equal(Object.keys(socket.acks).length, 0);
  assert.equal(socket.listeners('disconnect').length, baseline);
});

test('cancelling one request preserves another consumers pending acknowledgment', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const socket = harness.client(); await connectClient(socket);
  const { sendAcknowledged } = await import('../../frontend/src/services/socketRequest.js');
  const callbacks = [], serverSocket = harness.io.of('/').sockets.get(socket.id);
  serverSocket.removeAllListeners(E.PING); serverSocket.on(E.PING, (_, ack) => callbacks.push(ack));
  const controller = new AbortController();
  const a = sendAcknowledged(socket, E.PING, {}, { signal: controller.signal });
  const b = sendAcknowledged(socket, E.PING, {});
  await waitUntil(() => callbacks.length === 2);
  controller.abort(new Error('Cancelled one request.')); await assert.rejects(a, /Cancelled one request/);
  assert.equal(Object.keys(socket.acks).length, 1);
  callbacks[1]({ ok: true, message: 'pong' }); assert.equal((await b).message, 'pong');
  assert.equal(Object.keys(socket.acks).length, 0);
});

test('non-Error authentication failures still produce a safe permanent rejection', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness({ authenticateSocket: async () => { throw null; }, authorizeNotification: async () => true });
  t.after(() => harness.close());
  const socket = harness.client();
  const failed = waitForEvent(socket, 'connect_error'); socket.connect();
  const [error] = await failed;
  assert.equal(error.message, 'Authentication required.');
  assert.deepEqual(error.data, { code: 'AUTH_REQUIRED', retryable: false });
});

test('unavailable authentication adapter times out with a non-retrying public error', { timeout: 12000 }, async (t) => {
  let providerSignal;
  const harness = await createNetworkHarness({ authenticateSocket: async (_, { signal }) => {
    providerSignal = signal; return new Promise(() => {});
  }, authorizeNotification: async () => true });
  t.after(() => harness.close());
  const socket = harness.client();
  const failed = waitForEvent(socket, 'connect_error', { timeoutMs: 8000 }); socket.connect();
  const [error] = await failed;
  assert.equal(error.message, 'Authentication required.');
  assert.deepEqual(error.data, { code: 'AUTH_UNAVAILABLE', retryable: false });
  assert.equal(providerSignal.aborted, true);
});
