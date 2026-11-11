import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getNetworkSocket, getNetworkConnectionManager, retainNetworkSocket, requestNetwork } from '../services/socket';
import { NETWORK_EVENTS as EVENTS } from '../services/socket';
import { subscribeNotifications } from '../services/notificationListener';

export function useNetwork() {
  const manager = getNetworkConnectionManager();
  const connection = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const [error, setError] = useState('');
  const [ack, setAck] = useState(null);
  const [pingLatency, setPingLatency] = useState(null);
  const [now, setNow] = useState(() => performance.now());
  const [log, setLog] = useState(() => [{ time: new Date().toISOString(), message: `Connection: ${connection.status}` }]);
  const previousConnection = useRef(null);
  const addLog = (message) => setLog((items) => [{ time: new Date().toISOString(), message }, ...items].slice(0, 100));
  useEffect(() => {
    const socket = getNetworkSocket();
    previousConnection.current = manager.getSnapshot();
    const unsubscribeState = manager.subscribe(() => {
      const current = manager.getSnapshot();
      const previous = previousConnection.current;
      if (current.status !== previous.status) {
        addLog(`Connection: ${current.status}`);
        if (current.status === 'connected') setError('');
      }
      if (current.attempts !== previous.attempts) addLog(`Reconnecting: attempt ${current.attempts}`);
      if (current.clientCount !== previous.clientCount && current.clientCount !== null) addLog(`Connected clients: ${current.clientCount}`);
      if (current.error && current.error !== previous.error) addLog(`Network error: ${current.error.code}`);
      previousConnection.current = current;
    });
    const unsubscribeNotices = subscribeNotifications(socket, (value) => addLog(`Nonfinancial test notification received: ${value.id}`));
    const release = retainNetworkSocket();
    return () => {
      unsubscribeState();
      unsubscribeNotices();
      release();
    };
  }, [manager]);
  useEffect(() => {
    if (connection.status !== 'connected') return;
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [connection.status]);
  const send = async (event, payload) => {
    setError('');
    const start = performance.now();
    try {
      const response = await requestNetwork(event, payload);
      const elapsed = performance.now() - start;
      setAck({ ...response, roundTripMs: Math.round(elapsed * 100) / 100 });
      if (event === EVENTS.PING) setPingLatency(elapsed);
      addLog(`Acknowledged ${event}`);
    } catch (failure) { setError(failure.message); addLog(`Request failed: ${failure.message}`); }
  };
  return { status: connection.status, socketId: connection.socketId, count: connection.clientCount,
    error: error || connection.error?.message || '', ack, log, send, pingLatency,
    reconnectAttempts: connection.attempts, transport: connection.transport, retryStatus: connection.retryStatus,
    recentErrors: connection.recentErrors, uptimeMs: connection.connectedSince === null ? 0 : Math.max(0, now - connection.connectedSince),
    connect: manager.connect, disconnect: manager.disconnect,
    clearLog: () => setLog([]) };
}
