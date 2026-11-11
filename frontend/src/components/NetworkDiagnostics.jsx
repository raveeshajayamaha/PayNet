import { useLatencyDiagnostics } from '../hooks/useLatencyDiagnostics';

const milliseconds = (value) => value === null || value === undefined ? '—' : `${value.toFixed(2)} ms`;
export default function NetworkDiagnostics({ connected, pingLatency, reconnectAttempts }) {
  const diagnostics = useLatencyDiagnostics(connected);
  const statistics = diagnostics.statistics;
  const maximum = Math.max(1, ...diagnostics.samples);
  const point = (sample, index) => [48 + index * 60, 150 - (sample / maximum) * 115];
  return <section className="network-panel" aria-label="Network diagnostics">
    <div className="network-actions"><h2>Network diagnostics</h2>
      <button className="button" onClick={diagnostics.run} disabled={!connected || diagnostics.running || diagnostics.coolingDown}>
        {diagnostics.running ? 'Measuring latency…' : diagnostics.coolingDown ? 'Cooling down (10 seconds)' : 'Run Latency Test'}
      </button></div>
    <p>Ten application ping acknowledgments, spaced at least 650 ms apart on this socket. Measures round-trip latency, not one-way network delay. No browser load test runs.</p>
    <p>Wait for the test to finish before sending more requests. A ten-second cooldown keeps repeated runs within the development rate limit.</p>
    <div className="network-latency-stats">
      <div><span>Latest ping RTT</span><strong data-testid="ping-latency">{milliseconds(pingLatency)}</strong></div>
      <div><span>Reconnection attempts · this tab</span><strong data-testid="reconnect-attempts">{reconnectAttempts}</strong></div>
      {[['Minimum RTT', 'minMs'], ['Maximum RTT', 'maxMs'], ['Average RTT', 'averageMs'], ['Median RTT', 'medianMs'], ['95th percentile RTT', 'p95Ms']].map(([label, key]) =>
        <div key={key}><span>{label}</span><strong data-testid={`latency-${key}`}>{milliseconds(statistics?.[key])}</strong></div>)}
      <div><span>Successful samples</span><strong data-testid="latency-sample-count">{diagnostics.samples.length} / 10</strong></div>
    </div>
    <figure className="network-latency-chart"><svg viewBox="0 0 640 185" role="img" aria-label="Round-trip latency by sample, in milliseconds">
      <title>Application round-trip latency in milliseconds</title>
      <line x1="48" y1="150" x2="610" y2="150" stroke="#cbd5e1" /><line x1="48" y1="30" x2="48" y2="150" stroke="#cbd5e1" />
      <text x="4" y="30">{maximum.toFixed(1)}</text><text x="18" y="153">0</text><text x="7" y="80">ms</text>
      <text x="48" y="175">Sample 1</text><text x="548" y="175">Sample 10</text>
      <polyline points={diagnostics.samples.map((value, index) => point(value, index).join(',')).join(' ')} fill="none" stroke="#2563eb" strokeWidth="2.5" />
      {diagnostics.samples.map((value, index) => { const [x, y] = point(value, index); return <circle key={index} cx={x} cy={y} r="4" fill="#2563eb"><title>Sample {index + 1}: {milliseconds(value)}</title></circle>; })}
    </svg><figcaption>Current run only · nearest-rank p95 · successful samples only</figcaption></figure>
    <p data-testid="latency-result" aria-live="polite">{diagnostics.result}</p>
    {diagnostics.error && <p className="network-error" role="alert">{diagnostics.error}</p>}
  </section>;
}
