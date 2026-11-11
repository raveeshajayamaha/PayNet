const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfiguration, runPerformance } = require('../scripts/network-performance');

test('performance runner rejects external targets, excess clients and unbounded samples', () => {
  for (const clients of [0, -1, 26, 100, 2.5, '25']) assert.throws(() => validateConfiguration({ clients }));
  for (const samples of [0, 11, Infinity]) assert.throws(() => validateConfiguration({ samples }));
  assert.throws(() => validateConfiguration({ url: 'https://example.com' }), /External endpoints/);
  assert.deepEqual(validateConfiguration({ clients: 25, samples: 10 }), { clients: 25, samples: 10 });
});
test('performance runner refuses production and unknown environments before connecting', () => {
  const original = process.env.NODE_ENV;
  try {
    for (const environment of ['production', 'staging']) {
      process.env.NODE_ENV = environment;
      assert.throws(() => validateConfiguration(), /development\/test only/);
    }
  } finally { if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original; }
});
test('small real performance run reports mutually exclusive totals and zero leaked sockets', { timeout: 10000 }, async () => {
  const report = await runPerformance({ clients: 2, samples: 1 });
  assert.equal(report.completed, true);
  for (const metric of [report.connections, report.acknowledgments]) {
    assert.deepEqual(metric, { attempted: 2, successful: 2, failed: 0, timedOut: 0 });
  }
  assert.equal(report.roundTripLatencyMs.count, 2);
  assert.equal(report.peakConnectedClients, 2);
  assert.equal(report.uniqueSocketIds, 2);
  assert.equal(report.unattemptedAcknowledgments, 0);
  assert.deepEqual(report.cleanup, { completed: true, remainingServerClients: 0 });
});
