const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPayNetServer } = require('../server');
const E = require('../socket/events');
const N = require('../../shared/notification-events.json');
const { createNetworkHarness, connectClient, request, waitForEvent, waitUntil } = require('../testing/networkHarness');

test('temporary transport loss automatically reconnects with one notification delivery', { timeout: 15000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const socket = harness.client({ reconnection: true, reconnectionDelay: 50, reconnectionDelayMax: 100, randomizationFactor: 0 });
  const { subscribeNotifications } = await import('../../frontend/src/services/notificationListener.js');
  const notices = [];
  const stop = subscribeNotifications(socket, (notice) => notices.push(notice.id)); t.after(stop);
  await connectClient(socket);
  const oldId = socket.id;
  const disconnected = waitForEvent(socket, 'disconnect');
  const reconnecting = waitForEvent(socket.io, 'reconnect_attempt');
  const connected = waitForEvent(socket, 'connect');
  harness.io.of('/').sockets.get(oldId).conn.close();
  await Promise.all([disconnected, reconnecting, connected]);
  assert.notEqual(socket.id, oldId);
  await waitUntil(() => harness.io.of('/').sockets.size === 1);
  const ack = await request(socket, N.TEST_REQUEST);
  await request(socket, E.PING);
  assert.deepEqual(notices, [ack.notificationId]);
  assert.equal(socket.listeners(N.TEST_NOTIFICATION).length, 1);
  stop(); assert.equal(socket.listeners(N.TEST_NOTIFICATION).length, 0);
});

test('server shutdown, failed retry and restart recover without queued/duplicate notices', { timeout: 15000 }, async (t) => {
  const first = await createNetworkHarness(); t.after(() => first.close());
  const socket = first.client({ reconnection: true, reconnectionDelay: 50, reconnectionDelayMax: 100, randomizationFactor: 0 });
  await connectClient(socket);
  let deliveries = 0; socket.on(N.TEST_NOTIFICATION, () => deliveries++);
  await request(socket, N.TEST_REQUEST);
  const disconnected = waitForEvent(socket, 'disconnect');
  const failedRetry = waitForEvent(socket, 'connect_error');
  await new Promise((resolve) => first.io.close(resolve));
  await Promise.all([disconnected, failedRetry]);
  await assert.rejects(request(socket, E.PING), { code: 'DISCONNECTED' });
  const second = createPayNetServer({ environment: 'test', logger: { info() {}, warn() {} } });
  t.after(() => new Promise((resolve) => second.io.close(resolve)));
  const connected = waitForEvent(socket, 'connect');
  second.server.listen(first.port, '127.0.0.1');
  await connected;
  await request(socket, N.TEST_REQUEST); await request(socket, E.PING);
  assert.equal(deliveries, 2);
  assert.equal(second.io.of('/').sockets.size, 1);
});

test('missing acknowledgment times out, releases callbacks and allows subsequent requests', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const socket = harness.client(); await connectClient(socket);
  const serverSocket = harness.io.of('/').sockets.get(socket.id);
  const handlers = serverSocket.listeners(E.PING);
  // Fault injection is confined to this isolated test server, never a public event.
  serverSocket.removeAllListeners(E.PING); serverSocket.on(E.PING, () => {});
  await assert.rejects(request(socket, E.PING, {}, { timeoutMs: 250 }), { code: 'TIMEOUT' });
  await waitUntil(() => Object.keys(socket.acks).length === 0);
  serverSocket.removeAllListeners(E.PING); handlers.forEach((handler) => serverSocket.on(E.PING, handler));
  assert.equal((await request(socket, E.PING)).message, 'pong');
});

test('ten rapid connect/disconnect cycles retain no server clients or duplicate listeners', { timeout: 15000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const socket = harness.client(); const notices = [];
  const { subscribeNotifications } = await import('../../frontend/src/services/notificationListener.js');
  const stop = subscribeNotifications(socket, (notice) => notices.push(notice.id)); t.after(stop);
  for (let cycle = 0; cycle < 10; cycle++) {
    await connectClient(socket);
    assert.equal(harness.io.of('/').sockets.size, 1);
    const ack = await request(socket, N.TEST_REQUEST); await request(socket, E.PING);
    assert.equal(notices.at(-1), ack.notificationId);
    assert.equal(notices.length, cycle + 1);
    assert.equal(socket.listeners(N.TEST_NOTIFICATION).length, 1);
    socket.disconnect();
    await waitUntil(() => harness.io.of('/').sockets.size === 0 && harness.io.engine.clientsCount === 0);
    assert.equal(socket.active, false);
  }
  stop(); assert.equal(socket.listeners(N.TEST_NOTIFICATION).length, 0);
  assert.equal(new Set(notices).size, 10);
});

test('invalid requests from five clients do not disrupt valid acknowledgments', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const clients = Array.from({ length: 5 }, () => harness.client());
  await Promise.all(clients.map((socket) => connectClient(socket)));
  await Promise.all(clients.map(async (socket) => {
    assert.equal((await request(socket, E.PING, { invalid: true })).error.code, 'INVALID_PAYLOAD');
    assert.equal((await request(socket, N.TEST_REQUEST, { recipientId: 'other' })).error.code, 'INVALID_PAYLOAD');
    assert.equal((await request(socket, E.PING)).ok, true);
  }));
  assert.equal(harness.io.of('/').sockets.size, 5);
});

test('frontend request helper handles real acknowledgment timeout, cancellation and disconnected state', { timeout: 10000 }, async (t) => {
  const harness = await createNetworkHarness(); t.after(() => harness.close());
  const socket = harness.client(); await connectClient(socket);
  const { sendAcknowledged } = await import('../../frontend/src/services/socketRequest.js');
  assert.equal((await sendAcknowledged(socket, E.PING, {})).message, 'pong');
  await assert.rejects(sendAcknowledged(socket, E.PING, { invalid: true }), { code: 'INVALID_PAYLOAD' });
  const serverSocket = harness.io.of('/').sockets.get(socket.id);
  serverSocket.removeAllListeners(E.PING); serverSocket.on(E.PING, () => {});
  await assert.rejects(sendAcknowledged(socket, E.PING, {}, { timeoutMs: 250 }), { code: 'ACK_TIMEOUT' });
  const controller = new AbortController();
  const pending = sendAcknowledged(socket, E.PING, {}, { signal: controller.signal });
  controller.abort(new Error('Page left.'));
  await assert.rejects(pending, /Page left/);
  assert.equal(require('node:events').getEventListeners(controller.signal, 'abort').length, 0);
  socket.disconnect();
  await assert.rejects(sendAcknowledged(socket, E.PING, {}), { code: 'DISCONNECTED' });
  assert.equal(socket.sendBuffer.length, 0);
  assert.equal(Object.keys(socket.acks).length, 0);
});
