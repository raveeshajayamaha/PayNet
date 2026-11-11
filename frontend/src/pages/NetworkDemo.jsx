import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNetwork } from '../hooks/useNetwork';
import { NETWORK_EVENTS as EVENTS } from '../services/socket';
import './NetworkDemo.css';
import { NOTIFICATION_EVENTS } from '../services/notificationListener';
import { useApp } from '../context/useApp';
import NetworkDiagnostics from '../components/NetworkDiagnostics';
import NetworkHealth from '../components/NetworkHealth';

export default function NetworkDemo() {
  const network = useNetwork();
  const { testNotifications } = useApp();
  const [message, setMessage] = useState('Hello PayNet');
  const connected = network.status === 'connected';
  return <main className="network-demo">
    <header><Link to="/" className="logo">PayNet<span> / Network lab</span></Link><span className="network-tag">DEVELOPMENT / TEST ONLY</span></header>
    <section className="network-intro"><p>MEMBER 3 · SOCKET.IO NETWORKING</p><h1>Every connection counts.</h1>
      <p>Inspect real-time communication with the PayNet server. This is a development test page, not a live payment system. Use sample text only.</p>
      <aside className="network-guide" aria-label="Demonstration guide"><strong>Start here · networking demonstration</strong>
        <ol><li>Open two tabs to compare socket IDs and the live client count.</li>
          <li>Ping the server, send sample text, then run the ten-sample latency test.</li>
          <li>Send a private test notification and check that the other tab receives nothing.</li>
          <li>Briefly stop and restart the backend to demonstrate automatic recovery.</li></ol>
        <p>Authentication and payment integration are not enabled. No money moves.</p>
      </aside></section>
    <section className="network-grid" aria-label="Connection details">
      <article><h2>Connection status</h2><p role="status" className={connected ? 'network-online' : ''}>● {network.status}</p></article>
      <article><h2>Connected clients · sockets / tabs</h2><p data-testid="client-count">{network.count ?? '—'}</p></article>
      <article><h2>Socket ID · debug</h2><code data-testid="socket-id">{network.socketId || 'No active connection'}</code></article>
    </section>
    <section className="network-panel"><h2>Test the connection</h2><div className="network-actions">
      <button className="button" onClick={network.connect} disabled={connected}>Connect</button>
      <button className="button" onClick={network.disconnect} disabled={network.status === 'disconnected'}>Disconnect</button>
      <button className="button" onClick={() => network.send(EVENTS.PING, {})} disabled={!connected}>Ping server</button></div>
      <p>Disconnect pauses retries until you select Connect. A temporary server outage retries automatically, up to eight attempts; after exhaustion select Connect to try again.</p>
      <form onSubmit={(event) => { event.preventDefault(); network.send(EVENTS.MESSAGE, { message }); }}>
        <label htmlFor="network-message">Test message (maximum 500 characters)</label>
        <div className="network-actions"><input id="network-message" value={message} maxLength={500} onChange={(event) => setMessage(event.target.value)} />
          <button className="button" disabled={!connected || !message.trim()}>Send message</button></div></form>
      {network.error && <p role="alert" className="network-error">{network.error}</p>}
      <h3>Last server acknowledgment</h3><pre aria-live="polite">{network.ack ? JSON.stringify(network.ack, null, 2) : 'Send a ping or message to see the acknowledgment.'}</pre>
      <p className="network-note">The last successful response stays visible for inspection after a disconnect or failed request. An acknowledgment is not proof of payment.</p>
    </section>
    <NetworkHealth network={network} />
    <NetworkDiagnostics connected={connected} pingLatency={network.pingLatency} reconnectAttempts={network.reconnectAttempts} />
    <section className="network-panel"><h2>Nonfinancial notification test</h2>
      <p>Development only. Sends a fixed test notice to this socket only. No payment is completed.</p>
      <div className="network-actions"><button className="button" disabled={!connected} onClick={() => network.send(NOTIFICATION_EVENTS.TEST_REQUEST, {})}>Send test notification</button>
        <Link to="/notifications" className="text-button">View notifications</Link></div>
      <p data-testid="test-notification-count">Received test notifications: {testNotifications.length}</p>
    </section>
    <section className="network-panel"><div className="network-actions"><h2>Network event log</h2><button className="button" onClick={network.clearLog}>Clear log</button></div>
      <p>Latest 100 events · timestamps shown in your local time</p><ol className="network-log">{network.log.map((entry, index) => <li key={`${entry.time}-${index}`}><time dateTime={entry.time}>{new Date(entry.time).toLocaleTimeString()}</time> {entry.message}</li>)}</ol>
    </section>
  </main>;
}
