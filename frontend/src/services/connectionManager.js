import POLICY from '../../../shared/network-policy.json' with { type: 'json' };
import ERRORS from '../../../shared/network-errors.json' with { type: 'json' };
export const CONNECTION_OPTIONS = Object.freeze({
  autoConnect: false, reconnection: true, reconnectionAttempts: POLICY.reconnectionAttempts,
  reconnectionDelay: POLICY.reconnectionDelayMs, reconnectionDelayMax: POLICY.reconnectionDelayMaxMs,
  randomizationFactor: 0.5, timeout: POLICY.acknowledgmentTimeoutMs,
});
export function safeNetworkError(value, fallback = 'INTERNAL_ERROR') {
  const code = typeof value?.code === 'string' && Object.hasOwn(ERRORS, value.code) ? value.code : fallback;
  return { code, message: ERRORS[code] };
}

// Pure lifecycle owner: no credentials, user IDs, rooms, or financial state.
export function createConnectionManager(socket, { now = () => performance.now(), date = () => new Date().toISOString() } = {}) {
  let snapshot = Object.freeze({ status: 'disconnected', socketId: '', clientCount: null, transport: null,
    connectedSince: null, attempts: 0, retryStatus: 'idle', error: null, recentErrors: [] });
  const subscribers = new Set();
  let consumers = 0, manualStop = false, blocked = false, disposed = false;
  let detachTransport = () => {};
  const update = (values) => {
    if (disposed) return;
    snapshot = Object.freeze({ ...snapshot, ...values });
    subscribers.forEach((notify) => notify());
  };
  const remember = (error) => ({ error, recentErrors: [{ ...error, time: date() }, ...snapshot.recentErrors].slice(0, 10) });
  const cleared = { socketId: '', clientCount: null, transport: null, connectedSince: null };
  const connected = () => {
    blocked = false;
    detachTransport();
    const engine = socket.io.engine;
    const upgrade = () => update({ transport: engine.transport?.name || null });
    engine?.on('upgrade', upgrade);
    detachTransport = () => engine?.off('upgrade', upgrade);
    update({ status: 'connected', socketId: socket.id, connectedSince: now(),
      transport: engine?.transport?.name || null, retryStatus: 'connected', error: null });
  };
  const disconnected = (reason) => {
    detachTransport();
    if (reason === 'io server disconnect') { blocked = true; socket.io.reconnection(false); }
    const retrying = !manualStop && !blocked && socket.active;
    update({ ...cleared, status: blocked ? 'blocked' : 'disconnected',
      retryStatus: blocked ? 'authorization-required' : retrying ? 'waiting-to-retry' : 'idle',
      ...(reason === 'io server disconnect' ? remember(safeNetworkError(null, 'CONNECTION_REJECTED')) : {}) });
  };
  const failed = (failure) => {
    const permanent = ['AUTH_REQUIRED', 'AUTH_UNAVAILABLE', 'FORBIDDEN', 'UNAUTHORIZED'].includes(failure?.data?.code) || failure?.data?.retryable === false;
    if (permanent || !socket.active) {
      blocked = true;
      socket.io.reconnection(false); socket.disconnect();
      const fallback = failure?.data?.code === 'AUTH_UNAVAILABLE' ? 'AUTH_UNAVAILABLE' : permanent ? 'AUTH_REQUIRED' : 'CONNECTION_REJECTED';
      update({ ...cleared, status: 'blocked', retryStatus: 'authorization-required', ...remember(safeNetworkError(null, fallback)) });
    } else update({ ...cleared, status: 'disconnected', retryStatus: 'waiting-to-retry', ...remember(safeNetworkError(null, 'CONNECTION_FAILED')) });
  };
  const retry = () => update({ status: 'reconnecting', retryStatus: 'retrying', attempts: snapshot.attempts + 1 });
  const exhausted = () => update({ ...cleared, status: 'disconnected', retryStatus: 'exhausted', ...remember(safeNetworkError(null, 'RETRY_EXHAUSTED')) });
  const clients = (value) => {
    if (socket.connected && Number.isSafeInteger(value?.count) && value.count >= 0) update({ clientCount: value.count });
  };
  const serverError = (value) => update(remember(safeNetworkError(value)));
  socket.on('connect', connected).on('disconnect', disconnected).on('connect_error', failed)
    .on('network:clients', clients).on('network:error', serverError);
  socket.io.on('reconnect_attempt', retry).on('reconnect_failed', exhausted);
  if (socket.connected) connected();
  const connect = () => {
    if (disposed || socket.connected) return;
    manualStop = false; blocked = false; socket.io.reconnection(true);
    update({ status: 'connecting', retryStatus: 'connecting', error: null }); socket.connect();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(notify) { subscribers.add(notify); return () => subscribers.delete(notify); },
    connect,
    disconnect() {
      manualStop = true; socket.disconnect();
      update({ ...cleared, status: 'disconnected', retryStatus: 'idle', error: null });
    },
    retain() {
      if (disposed) throw new Error('Connection manager is disposed.');
      consumers++;
      if (!manualStop && !blocked && snapshot.retryStatus !== 'exhausted' && !socket.active && !socket.connected) connect();
      let released = false;
      return () => {
        if (released || disposed) return;
        released = true;
        if (--consumers === 0) {
          socket.disconnect();
          update({ ...cleared, status: blocked ? 'blocked' : 'disconnected', retryStatus: blocked ? 'authorization-required' : 'idle' });
        }
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true; consumers = 0; detachTransport();
      socket.off('connect', connected).off('disconnect', disconnected).off('connect_error', failed)
        .off('network:clients', clients).off('network:error', serverError);
      socket.io.off('reconnect_attempt', retry).off('reconnect_failed', exhausted);
      subscribers.clear(); socket.disconnect();
    },
  };
}
