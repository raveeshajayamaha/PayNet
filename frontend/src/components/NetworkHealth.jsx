export default function NetworkHealth({ network }) {
  return <section className="network-panel" aria-label="Network health">
    <div className="network-actions"><h2>Network health</h2><span className="network-tag">DEVELOPMENT DIAGNOSTICS</span></div>
    <div className="network-latency-stats">
      <div><span>Connection uptime</span><strong data-testid="connection-uptime">{Math.floor(network.uptimeMs / 1000)} s</strong></div>
      <div><span>Current transport</span><strong data-testid="current-transport">{network.transport || 'Unavailable'}</strong></div>
      <div><span>Retry state</span><strong data-testid="retry-status">{network.retryStatus}</strong></div>
    </div>
    <p data-testid="network-summary">{network.status === 'connected'
      ? 'Connected. Validated test events are available; financial delivery remains disabled until verified backend authentication and authorization are integrated.'
      : network.status === 'blocked' ? 'Access was rejected. Automatic retries are stopped; verify credentials before selecting Connect.'
        : network.retryStatus === 'exhausted' ? 'Retry budget exhausted. Restore the backend, then select Connect.'
          : 'Disconnected. Automatic recovery applies to temporary network failures; an explicit Disconnect pauses recovery.'}</p>
    <h3>Recent connection errors</h3>
    {network.recentErrors.length ? <ol className="network-log" data-testid="connection-errors">{network.recentErrors.map((item, index) =>
      <li key={`${item.time}-${index}`}><time dateTime={item.time}>{new Date(item.time).toLocaleTimeString()}</time><strong>{item.code}</strong> {item.message}</li>)}</ol>
      : <p>No recent connection errors.</p>}
    <p>Latest ten sanitized network errors · no credentials or private payloads are recorded.</p>
  </section>;
}
