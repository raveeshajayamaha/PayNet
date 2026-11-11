const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');
const { createPayNetServer } = require('../server');
const E = require('../socket/events');
const logger = { info() {}, warn() {} };

async function start(t, options = {}) {
  const instance = createPayNetServer({ environment: 'test', logger, ...options });
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  t.after(() => new Promise((resolve) => instance.io ? instance.io.close(resolve) : instance.server.close(resolve)));
  return { ...instance, url: `http://127.0.0.1:${instance.server.address().port}` };
}
function client(t, url, options = {}) {
  const socket = connect(url, { autoConnect: false, forceNew: true, reconnection: false, ...options });
  t.after(() => socket.disconnect());
  return socket;
}
async function open(socket) {
  const ready = once(socket, 'connect', { signal: AbortSignal.timeout(5000) });
  socket.connect(); await ready;
}
const request = (socket, event, payload) => socket.timeout(2000).emitWithAck(event, payload);

test('HTTP health endpoint remains available independently of database', async (t) => {
  const { url } = await start(t);
  const response = await fetch(`${url}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: 'PayNet API is running' });
});
test('simultaneous clients receive count updates and disconnection updates', async (t) => {
  const { url, io } = await start(t);
  const a = client(t, url), b = client(t, url);
  const counts = [];
  a.on(E.COUNT, ({ count }) => counts.push(count));
  await open(a);
  const countTwo = new Promise((resolve) => a.on(E.COUNT, (p) => { if (p.count === 2) resolve(); }));
  await open(b); await countTwo;
  assert.equal(io.of('/').sockets.size, 2);
  const countOne = once(a, E.COUNT, { signal: AbortSignal.timeout(2000) });
  b.disconnect();
  assert.deepEqual((await countOne)[0], { count: 1 });
  assert.deepEqual(counts.slice(0, 2), [1, 2]);
});
test('ping and message acknowledgments are private and timestamped', async (t) => {
  const { url } = await start(t);
  const a = client(t, url), b = client(t, url);
  await Promise.all([open(a), open(b)]);
  let leaked = false;
  b.onAny((event) => { if (event !== E.COUNT) leaked = true; });
  const pong = await request(a, E.PING, {});
  assert.equal(pong.ok, true); assert.equal(pong.message, 'pong');
  assert.ok(Number.isFinite(Date.parse(pong.serverTime)));
  assert.equal((await request(a, E.MESSAGE, { message: ' hello ' })).message, 'hello');
  await request(b, E.PING, {});
  assert.equal(leaked, false);
});
test('invalid payloads, unknown events and missing acknowledgments are safe', async (t) => {
  const { url } = await start(t); const socket = client(t, url); await open(socket);
  for (const payload of [null, [], 'text', {}, { message: '' }, { message: ' ' }, { message: 1 }, { message: 'a'.repeat(501) }, { message: 'ok', balance: 999 }]) {
    assert.equal((await request(socket, E.MESSAGE, payload)).error.code, 'INVALID_PAYLOAD');
  }
  assert.equal((await request(socket, E.PING, { extra: true })).error.code, 'INVALID_PAYLOAD');
  assert.equal((await request(socket, 'balance:update', {})).error.code, 'UNKNOWN_EVENT');
  const error = once(socket, E.ERROR, { signal: AbortSignal.timeout(2000) });
  socket.emit(E.PING, {});
  assert.equal((await error)[0].code, 'INVALID_PAYLOAD');
  assert.equal((await request(socket, E.PING, {})).ok, true);
});
test('rate limit rejects excess requests', async (t) => {
  const { url } = await start(t); const socket = client(t, url); await open(socket);
  for (let i = 0; i < 20; i++) assert.equal((await request(socket, E.PING, {})).ok, true);
  assert.equal((await request(socket, E.PING, {})).error.code, 'RATE_LIMITED');
});
test('unapproved browser origins are rejected for polling and websocket', async (t) => {
  const { url } = await start(t);
  for (const transport of ['polling', 'websocket']) {
    const socket = client(t, url, { transports: [transport], extraHeaders: { Origin: 'https://unapproved.example' } });
    const failed = once(socket, 'connect_error', { signal: AbortSignal.timeout(3000) });
    socket.connect(); await failed; assert.equal(socket.connected, false);
  }
});
test('production and unknown environments expose no Socket.IO endpoint', async (t) => {
  for (const environment of ['production', 'staging']) {
    const { url, io } = await start(t, { environment });
    assert.equal(io, null);
    assert.equal((await fetch(`${url}/socket.io/?EIO=4&transport=polling`)).status, 404);
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
  }
});
test('client automatically reconnects after server restarts on the same port', async (t) => {
  const first = createPayNetServer({ environment: 'test', logger });
  first.server.listen(0, '127.0.0.1'); await once(first.server, 'listening');
  const port = first.server.address().port;
  const socket = client(t, `http://127.0.0.1:${port}`, {
    reconnection: true, reconnectionDelay: 50, reconnectionDelayMax: 100, randomizationFactor: 0,
  });
  try { await open(socket); } catch (error) { await new Promise((resolve) => first.io.close(resolve)); throw error; }
  const disconnected = once(socket, 'disconnect', { signal: AbortSignal.timeout(3000) });
  await new Promise((resolve) => first.io.close(resolve)); await disconnected;
  // Observe a failed retry while the server is actually unavailable.
  await once(socket, 'connect_error', { signal: AbortSignal.timeout(3000) });
  const second = createPayNetServer({ environment: 'test', logger });
  t.after(() => new Promise((resolve) => second.io.close(resolve)));
  const reconnected = once(socket, 'connect', { signal: AbortSignal.timeout(5000) });
  second.server.listen(port, '127.0.0.1'); await reconnected;
  assert.equal((await request(socket, E.PING, {})).message, 'pong');
});
