import { useEffect, useRef, useState } from 'react';
import { collectRoundTripSamples, summarizeLatency } from '../../../shared/latency.mjs';
import { getNetworkSocket, NETWORK_EVENTS, requestNetwork } from '../services/socket';

export function useLatencyDiagnostics(connected) {
  const active = useRef(null);
  const cooldownUntil = useRef(0);
  const [running, setRunning] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const [samples, setSamples] = useState([]);
  const [result, setResult] = useState('Ready. No diagnostic test has run.');
  const [error, setError] = useState('');
  useEffect(() => () => { active.current?.abort(new Error('Latency test cancelled after leaving the page.')); active.current = null; }, []);
  useEffect(() => {
    if (!connected) active.current?.abort(new Error('Connection lost. Reconnect before running another latency test.'));
  }, [connected]);
  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), Math.max(0, cooldownUntil.current - performance.now()));
    return () => clearTimeout(timer);
  }, [coolingDown]);
  const run = async () => {
    if (active.current || performance.now() < cooldownUntil.current) return;
    if (!connected) { setError('Connect before running diagnostics.'); return; }
    const controller = new AbortController(); active.current = controller;
    const socket = getNetworkSocket(), connectionId = socket.id;
    setRunning(true); setSamples([]); setError(''); setResult('Running: 0 / 10 round-trip samples.');
    try {
      await collectRoundTripSamples({
        signal: controller.signal,
        requestPing: async (signal) => {
          if (!socket.connected || socket.id !== connectionId) throw new Error('Connection changed. Run a fresh latency test.');
          const response = await requestNetwork(NETWORK_EVENTS.PING, {}, { signal });
          if (response.message !== 'pong' || socket.id !== connectionId) throw new Error('Ping response or connection changed.');
        },
        onSample: (value, index) => {
          if (active.current !== controller) return;
          setSamples((values) => [...values, value]);
          setResult(`Running: ${index + 1} / 10 round-trip samples.`);
        },
      });
      if (active.current === controller) setResult('Passed: 10 / 10 round-trip samples acknowledged.');
    } catch (failure) {
      if (active.current === controller) { setError(failure.message); setResult('Stopped. Statistics include successful samples only.'); }
    } finally {
      if (active.current === controller) {
        active.current = null; setRunning(false);
        cooldownUntil.current = performance.now() + 10000; setCoolingDown(true);
      }
    }
  };
  return { run, running, coolingDown, samples, statistics: summarizeLatency(samples), result, error };
}
