// All values are application-level round-trip latency in milliseconds.
export function summarizeLatency(samples) {
  if (!Array.isArray(samples) || samples.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new TypeError('Latency samples must be finite nonnegative numbers.');
  }
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    count: sorted.length, minMs: sorted[0], maxMs: sorted.at(-1),
    averageMs: sorted.reduce((sum, n) => sum + n, 0) / sorted.length,
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal.reason); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function collectRoundTripSamples({ requestPing, count = 10, intervalMs = 650,
  timeoutMs = 15000, signal, onSample = () => {}, now = () => performance.now() }) {
  if (!Number.isInteger(count) || count < 1 || count > 10 ||
    !Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 2000 ||
    !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) {
    throw new RangeError('Latency tests support 1–10 samples and a maximum 15-second duration.');
  }
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error('Latency test duration limit reached.')), timeoutMs);
  const activeSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  const samples = [];
  try {
    for (let index = 0; index < count; index++) {
      activeSignal.throwIfAborted();
      const start = now();
      await requestPing(activeSignal);
      activeSignal.throwIfAborted();
      const elapsed = now() - start;
      samples.push(elapsed);
      onSample(elapsed, index);
      if (index + 1 < count) await abortableDelay(intervalMs, activeSignal);
    }
    return { samples, statistics: summarizeLatency(samples) };
  } finally { clearTimeout(timer); }
}
