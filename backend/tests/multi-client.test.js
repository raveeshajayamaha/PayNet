const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../socket/events');
const N = require('../../shared/notification-events.json');
const { createNetworkHarness, connectClient, request, waitUntil } = require('../testing/networkHarness');

for (const count of [2, 5, 10, 25]) {
  test(`${count} independent clients: counts, acknowledgments, private notices, clean disconnect`, { timeout: 15000 }, async (t) => {
    const harness = await createNetworkHarness(); t.after(() => harness.close());
    const baseline = harness.io.of('/').sockets.size;
    assert.equal(baseline, 0);
    const clients = Array.from({ length: count }, () => harness.client());
    const latestCounts = new Map(), deliveries = clients.map(() => []);
    clients.forEach((socket, index) => {
      socket.on(E.COUNT, ({ count: value }) => latestCounts.set(socket, value));
      socket.on(N.TEST_NOTIFICATION, (payload) => deliveries[index].push(payload.id));
    });
    await Promise.all(clients.map((socket) => connectClient(socket)));
    assert.equal(new Set(clients.map((socket) => socket.id)).size, count);
    assert.equal(new Set(clients.map((socket) => socket.io.engine.id)).size, count);
    await waitUntil(() => latestCounts.size === count && clients.every((s) => latestCounts.get(s) === baseline + count));
    assert.equal(harness.io.of('/').sockets.size, baseline + count);
    // Each client acknowledges ping/message and requests exactly one private test notice.
    const ids = await Promise.all(clients.map(async (socket, index) => {
      assert.equal((await request(socket, E.PING)).message, 'pong');
      assert.equal((await request(socket, E.MESSAGE, { message: `client-${index}` })).message, `client-${index}`);
      const ack = await request(socket, N.TEST_REQUEST);
      assert.equal(ack.ok, true); return ack.notificationId;
    }));
    // Ping responses form a protocol ordering barrier on every client, not a sleep.
    await Promise.all(clients.map((socket) => request(socket, E.PING)));
    clients.forEach((socket, index) => assert.deepEqual(deliveries[index], [ids[index]]));
    assert.equal(new Set(ids).size, count);
    // Keep one observer connected while the rest disconnect, then verify zero on server.
    clients.slice(1).forEach((socket) => socket.disconnect());
    await waitUntil(() => harness.io.of('/').sockets.size === 1 && latestCounts.get(clients[0]) === 1);
    clients[0].disconnect();
    await waitUntil(() => harness.io.of('/').sockets.size === baseline && harness.io.engine.clientsCount === 0);
    assert.equal(clients.every((socket) => !socket.connected), true);
    assert.equal(harness.io.engine.clientsCount, 0);
  });
}
