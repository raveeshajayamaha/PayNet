import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLatency, collectRoundTripSamples, abortableDelay } from '../../shared/latency.mjs';

test('RTT statistics compute minimum, maximum, mean, even/odd median and nearest-rank p95', () => {
  const samples = [20, 1, 10, 5]; const original = [...samples];
  assert.deepEqual(summarizeLatency(samples), { count: 4, minMs: 1, maxMs: 20, averageMs: 9, medianMs: 7.5, p95Ms: 20 });
  assert.deepEqual(samples, original);
  assert.equal(summarizeLatency([8, 1, 3]).medianMs, 3);
  assert.equal(summarizeLatency(Array.from({ length: 20 }, (_, i) => i + 1)).p95Ms, 19);
  assert.equal(summarizeLatency([0]).minMs, 0);
  assert.equal(summarizeLatency([]), null);
  for (const value of [[NaN], [Infinity], [-1], ['2'], null]) assert.throws(() => summarizeLatency(value));
});
test('collector uses monotonic elapsed time, records all samples and enforces sample bounds', async () => {
  const times = [100, 105, 200, 210, 300, 315], seen = [];
  const result = await collectRoundTripSamples({ count: 3, intervalMs: 0, requestPing: async () => {},
    now: () => times.shift(), onSample: (value) => seen.push(value) });
  assert.deepEqual(result.samples, [5, 10, 15]); assert.deepEqual(seen, result.samples);
  assert.equal(result.statistics.averageMs, 10);
  for (const options of [{ count: 0 }, { count: 11 }, { timeoutMs: 16000 }]) {
    await assert.rejects(collectRoundTripSamples({ requestPing() {}, ...options }), RangeError);
  }
});
test('deadline aborts an in-flight RTT request without reporting a successful sample', async () => {
  const samples = [];
  await assert.rejects(collectRoundTripSamples({ timeoutMs: 30,
    requestPing: (signal) => abortableDelay(10000, signal), onSample: (value) => samples.push(value) }), /duration limit/);
  assert.deepEqual(samples, []);
});
test('cancellation stops further samples during pacing and rejects pre-aborted runs', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(collectRoundTripSamples({ signal: controller.signal,
    requestPing: async () => { calls++; }, onSample: () => controller.abort(new Error('Cancelled on disconnect.')) }), /Cancelled/);
  assert.equal(calls, 1);
  await assert.rejects(collectRoundTripSamples({ signal: controller.signal, requestPing: async () => { calls++; } }), /Cancelled/);
  assert.equal(calls, 1);
});
