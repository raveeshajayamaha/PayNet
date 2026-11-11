import { io } from 'socket.io-client';
import { createConnectionManager, CONNECTION_OPTIONS } from './connectionManager.js';
import { subscribeNotifications } from './notificationListener.js';

// One authenticated connection per account lifecycle. Socket events are validated
// invalidations; balances/history are always reconciled through authenticated APIs.
export function createPaymentConnection({ url, socket: suppliedSocket, reconcile, onState = () => {},
  eventTarget = globalThis.window, pollMs = 20000 }) {
  const socket = suppliedSocket || io(url.replace(/\/$/, '') + '/payments', {
    ...CONNECTION_OPTIONS, withCredentials: true, forceNew: true,
  });
  const manager = createConnectionManager(socket);
  let refreshTimer, disposed = false, lastStatus = manager.getSnapshot().status;
  const refresh = () => { if (!disposed) void Promise.resolve().then(() => !disposed && reconcile()).catch(() => {}); };
  const changed = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 80); };
  const unsubscribe = subscribeNotifications(socket, changed, { authenticated: true });
  const sync = () => {
    const state = manager.getSnapshot(); onState(state);
    if (state.status !== lastStatus && ['connected', 'disconnected', 'blocked'].includes(state.status)) refresh();
    lastStatus = state.status;
  };
  const unsubscribeState = manager.subscribe(sync);
  const release = manager.retain();
  const timer = setInterval(refresh, pollMs);
  // Focus/online reconcile APIs, but never override a permanent auth block or retry budget.
  eventTarget?.addEventListener('online', refresh); eventTarget?.addEventListener('focus', refresh);
  return {
    getSnapshot: manager.getSnapshot,
    reconnect: () => manager.connect(),
    dispose() {
      if (disposed) return;
      disposed = true; clearInterval(timer); clearTimeout(refreshTimer);
      eventTarget?.removeEventListener('online', refresh); eventTarget?.removeEventListener('focus', refresh);
      unsubscribe(); unsubscribeState(); release(); manager.dispose();
    },
  };
}
