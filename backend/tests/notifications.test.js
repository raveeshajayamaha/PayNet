const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');
const { createPayNetServer } = require('../server');
const { EVENTS: E, validateNotification } = require('../services/notificationContracts');
const { createNotificationPublisher } = require('../services/notificationPublisher');
const registerHandlers = require('../socket/handlers');
const logger = { info() {}, warn() {} };
const notice = (type = 'test') => ({ version: 1, id: 'notice-1', type, message: 'Sample notice', timestamp: '2026-11-11T10:00:00.000Z' });
async function setup(t, options = {}) {
  const instance = createPayNetServer({ environment: 'test', logger, ...options });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  t.after(() => new Promise((resolve) => instance.io ? instance.io.close(resolve) : instance.server.close(resolve)));
  const url = `http://127.0.0.1:${instance.server.address().port}`;
  const client = async (extra = {}) => {
    const socket = connect(url, { autoConnect: false, forceNew: true, reconnection: false, ...extra });
    t.after(() => socket.disconnect());
    const ready = once(socket, 'connect', { signal: AbortSignal.timeout(3000) });
    socket.connect(); await ready; return socket;
  };
  return { ...instance, url, client };
}
const request = (socket, event, payload = {}) => socket.timeout(2000).emitWithAck(event, payload);

test('versioned notification contracts validate fields, types and limits', () => {
  assert.equal(validateNotification(E.TEST_NOTIFICATION, notice()), true);
  for (const event of [E.PAYMENT_COMPLETED, E.PAYMENT_FAILED, E.NOTIFICATION]) {
    const type = event === E.NOTIFICATION ? 'info' : event === E.PAYMENT_COMPLETED ? 'payment.completed' : 'payment.failed';
    assert.equal(validateNotification(event, { ...notice(type), transactionRef: 'tx-123' }), true);
  }
  for (const payload of [null, [], {}, { ...notice(), version: 2 }, { ...notice(), id: '../user' },
    { ...notice(), timestamp: 'yesterday' }, { ...notice(), message: ' ' }, { ...notice(), message: 'a'.repeat(501) },
    { ...notice(), type: 'payment.completed' }, { ...notice(), recipientId: 'victim' }, { ...notice(), transactionRef: 'tx-1' }]) {
    assert.equal(validateNotification(E.TEST_NOTIFICATION, payload), false);
  }
  assert.equal(validateNotification('unknown', notice()), false);
});
test('test notice is delivered only to its requesting socket and rejects recipient selection', async (t) => {
  const { client } = await setup(t);
  const a = await client(), b = await client(); let unrelated = 0;
  b.on(E.TEST_NOTIFICATION, () => unrelated++);
  const received = once(a, E.TEST_NOTIFICATION, { signal: AbortSignal.timeout(2000) });
  const ack = await request(a, E.TEST_REQUEST);
  const [payload] = await received;
  assert.equal(validateNotification(E.TEST_NOTIFICATION, payload), true);
  assert.match(payload.message, /No payment was made/);
  assert.equal(ack.notificationId, payload.id);
  assert.equal((await request(a, E.TEST_REQUEST, { recipientId: b.id })).error.code, 'INVALID_PAYLOAD');
  await request(b, 'network:ping'); assert.equal(unrelated, 0);
});
test('client-created financial notifications and user/room impersonation are rejected', async (t) => {
  const { client, io } = await setup(t);
  const socket = await client({ auth: { userId: 'victim', authenticated: true } });
  for (const event of [E.NOTIFICATION, E.PAYMENT_COMPLETED, E.PAYMENT_FAILED, E.TEST_NOTIFICATION]) {
    assert.equal((await request(socket, event, notice('payment.completed'))).error.code, 'FORBIDDEN_EVENT');
  }
  assert.equal((await request(socket, 'room:join', { userId: 'victim' })).error.code, 'UNKNOWN_EVENT');
  assert.equal(io.notificationPublisher.enabled, false);
  assert.deepEqual(await io.notificationPublisher.publishToUser('victim', E.PAYMENT_COMPLETED, notice('payment.completed')),
    { ok: false, code: 'FINANCIAL_NOTIFICATIONS_DISABLED' });
  assert.equal(createNotificationPublisher().enabled, false);
  assert.equal(createNotificationPublisher({ io, authenticateSocket() {} }).enabled, false);
});
test('trusted server adapters target verified users and reauthorize sessions', async (t) => {
  let identityIndex = 0, authorized = true;
  // Isolated server-side test stubs. Never exposed as an application login.
  const { client, io } = await setup(t, {
    authenticateSocket: async () => ({ userId: ++identityIndex <= 2 ? 'user-a' : 'user-b' }),
    authorizeNotification: async () => authorized,
  });
  const a = await client(), a2 = await client(), b = await client();
  let unrelated = 0; b.on(E.PAYMENT_COMPLETED, () => unrelated++);
  const deliveries = [a, a2].map((s) => once(s, E.PAYMENT_COMPLETED, { signal: AbortSignal.timeout(2000) }));
  const payload = notice('payment.completed');
  assert.deepEqual(await io.notificationPublisher.publishToUser('user-a', E.PAYMENT_COMPLETED, payload), { ok: true, delivered: 2 });
  await Promise.all(deliveries); await request(b, 'network:ping'); assert.equal(unrelated, 0);
  authorized = false;
  assert.deepEqual(await io.notificationPublisher.publishToUser('user-a', E.PAYMENT_COMPLETED, payload), { ok: true, delivered: 0 });
  assert.equal((await io.notificationPublisher.publishToUser('user-a', E.PAYMENT_COMPLETED, notice())).code, 'INVALID_NOTIFICATION');
  a.disconnect(); a2.disconnect();
});
test('authentication failure rejects connections without leaking provider errors', async (t) => {
  const { url } = await setup(t, {
    authenticateSocket: async () => { throw new Error('private database details'); }, authorizeNotification: async () => true,
  });
  const socket = connect(url, { autoConnect: false, reconnection: false });
  t.after(() => socket.disconnect());
  const failed = once(socket, 'connect_error', { signal: AbortSignal.timeout(2000) }); socket.connect();
  assert.equal((await failed)[0].message, 'Authentication required.');
});
test('test delivery works after disconnect/reconnect without duplicate events', async (t) => {
  const { client } = await setup(t); const socket = await client();
  let count = 0; socket.on(E.TEST_NOTIFICATION, () => count++);
  await request(socket, E.TEST_REQUEST);
  socket.disconnect();
  const ready = once(socket, 'connect', { signal: AbortSignal.timeout(2000) }); socket.connect(); await ready;
  await request(socket, E.TEST_REQUEST); assert.equal(count, 2);
});
test('production exposes no test transport and handler independently refuses test requests', async (t) => {
  const { url, io } = await setup(t, { environment: 'production' });
  assert.equal(io, null);
  assert.equal((await fetch(`${url}/socket.io/?EIO=4&transport=polling`)).status, 404);
  let middleware;
  registerHandlers({ use(fn) { middleware = fn; }, on() {}, emit() {} }, { environment: 'production' });
  let response, accepted = false;
  middleware([E.TEST_REQUEST, {}, (value) => { response = value; }], () => { accepted = true; });
  assert.equal(accepted, false); assert.equal(response.error.code, 'TEST_NOTIFICATIONS_DISABLED');
});
