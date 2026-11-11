const { performance } = require('node:perf_hooks');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../socket/events');
const { createNetworkHarness, connectClient, request, timeoutError } = require('../testing/networkHarness');

function validateConfiguration(options = {}) {
  if (Object.keys(options).some((key) => !['clients', 'samples', 'signal'].includes(key))) {
    throw new Error('Only clients, samples, and a cancellation signal are supported. External endpoints are forbidden.');
  }
  const { clients = 25, samples = 10 } = options;
  if (!Number.isInteger(clients) || clients < 1 || clients > 25) throw new RangeError('Client count must be 1–25.');
  if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new RangeError('Samples per client must be 1–10.');
  if (!['development', 'test', undefined, ''].includes(process.env.NODE_ENV)) throw new Error('Performance testing is development/test only.');
  return { clients, samples };
}

async function runPerformance(options = {}) {
  const { clients, samples } = validateConfiguration(options);
  const { summarizeLatency, abortableDelay } = await import('../../shared/latency.mjs');
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(timeoutError('15-second workload limit reached.')), 15000);
  const signal = options.signal ? AbortSignal.any([deadline.signal, options.signal]) : deadline.signal;
  const started = performance.now();
  const metrics = () => ({ attempted: 0, successful: 0, failed: 0, timedOut: 0 });
  const report = {
    timestamp: new Date().toISOString(), kind: 'isolated-local-development-test',
    environment: { node: process.version, platform: os.platform(), arch: os.arch(), logicalCpus: os.cpus().length },
    limits: { maxClients: 25, workloadMs: 15000, cleanupMs: 5000, intervalMs: 650, connectionTimeoutMs: 5000, acknowledgmentTimeoutMs: 2000 },
    configuredClients: clients, samplesPerClient: samples, connections: metrics(), acknowledgments: metrics(),
    peakConnectedClients: 0, uniqueSocketIds: 0, finalTransports: {},
    connectionLatencyMs: null, roundTripLatencyMs: null, roundTripSamplesMs: [],
    errors: [], completed: false, cleanup: { completed: false, remainingServerClients: null },
  };
  const connectionSamples = [];
  const recordFailure = (metric, error) => {
    metric[error.code === 'TIMEOUT' ? 'timedOut' : 'failed']++;
    if (report.errors.length < 10) report.errors.push(error.code || 'FAILED');
  };
  let harness;
  try {
    signal.throwIfAborted();
    // No URL input or existing server: bind a fresh server to numeric IPv4 loopback.
    harness = await createNetworkHarness();
    const target = new URL(harness.url);
    if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('Only isolated IPv4 localhost targets are allowed.');
    report.target = harness.url;
    const sockets = Array.from({ length: clients }, () => harness.client());
    await Promise.all(sockets.map(async (socket) => {
      report.connections.attempted++; const start = performance.now();
      try {
        await connectClient(socket, { signal });
        report.connections.successful++; connectionSamples.push(performance.now() - start);
      } catch (error) { recordFailure(report.connections, error); socket.disconnect(); }
    }));
    const active = sockets.filter((socket) => socket.connected);
    report.peakConnectedClients = harness.io.of('/').sockets.size;
    report.uniqueSocketIds = new Set(active.map((socket) => socket.id)).size;
    for (let round = 0; round < samples && active.length; round++) {
      signal.throwIfAborted();
      await Promise.all(active.map(async (socket) => {
        report.acknowledgments.attempted++; const start = performance.now();
        try {
          const ack = await request(socket, E.PING, {}, { signal });
          if (!ack?.ok || ack.message !== 'pong') throw Object.assign(new Error('Ping rejected.'), { code: ack?.error?.code || 'INVALID_ACK' });
          report.acknowledgments.successful++; report.roundTripSamplesMs.push(performance.now() - start);
        } catch (error) { recordFailure(report.acknowledgments, error); }
      }));
      if (round + 1 < samples) await abortableDelay(650, signal);
    }
    for (const socket of active) {
      const transport = socket.io.engine?.transport.name || 'disconnected';
      report.finalTransports[transport] = (report.finalTransports[transport] || 0) + 1;
    }
    report.completed = !signal.aborted && report.connections.successful === clients &&
      report.uniqueSocketIds === clients && report.peakConnectedClients === clients &&
      report.acknowledgments.successful === clients * samples;
  } catch (error) { report.errors.push(error.code || error.message); }
  finally {
    clearTimeout(timer);
    if (harness) {
      try {
        await harness.close();
        const remaining = harness.io.of('/').sockets.size;
        const cleaned = remaining === 0 && harness.io.engine.clientsCount === 0;
        report.cleanup = { completed: cleaned, remainingServerClients: remaining };
        if (!cleaned) { report.completed = false; report.errors.push('CLEANUP_FAILED'); }
      } catch (error) { report.completed = false; report.errors.push(error.code || 'CLEANUP_FAILED'); }
    }
    report.connectionLatencyMs = summarizeLatency(connectionSamples);
    report.roundTripLatencyMs = summarizeLatency(report.roundTripSamplesMs);
    report.durationMs = performance.now() - started;
    report.unattemptedAcknowledgments = clients * samples - report.acknowledgments.attempted;
  }
  return report;
}

async function main() {
  const options = {}; let writeReport = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--write-report') writeReport = true;
    else if (/^--(clients|samples)=\d+$/.test(arg)) {
      const [key, value] = arg.slice(2).split('='); options[key] = Number(value);
    } else throw new Error(`Unsupported option: ${arg}. No external endpoints are permitted.`);
  }
  const cancel = new AbortController();
  const interrupt = () => cancel.abort(Object.assign(new Error('Test interrupted.'), { code: 'ABORTED' }));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    const report = await runPerformance({ ...options, signal: cancel.signal });
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (writeReport) fs.writeFileSync(path.join(__dirname, '../../docs/network-performance-results.json'), json);
    // Full-precision raw samples stay in the optional report; keep terminal output readable.
    const { roundTripSamplesMs, ...summary } = report;
    console.log(JSON.stringify({ ...summary, recordedRoundTripSamples: roundTripSamplesMs.length }, null, 2));
    if (!report.completed || !report.cleanup.completed) process.exitCode = 1;
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { runPerformance, validateConfiguration };
