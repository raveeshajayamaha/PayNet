import { io } from 'socket.io-client';
import { sendAcknowledged } from './socketRequest';
import { createConnectionManager, CONNECTION_OPTIONS } from './connectionManager';

// Mirrors backend/socket/events.js; all supported events are server-defined.
export const NETWORK_EVENTS = Object.freeze({
  PING: 'network:ping', MESSAGE: 'network:message', COUNT: 'network:clients', ERROR: 'network:error',
});
let socket;
let manager;
export function getNetworkClientCount() { return manager?.getSnapshot().clientCount ?? null; }
export function getNetworkSocket() {
  if (!import.meta.env.DEV) throw new Error('Networking demo is development only.');
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', { ...CONNECTION_OPTIONS });
    manager = createConnectionManager(socket);
  }
  return socket;
}
export function retainNetworkSocket() {
  return getNetworkConnectionManager().retain();
}
export function getNetworkConnectionManager() { getNetworkSocket(); return manager; }
export function requestNetwork(event, payload, options) {
  return sendAcknowledged(getNetworkSocket(), event, payload, options);
}
if (import.meta.hot) import.meta.hot.dispose(() => { manager?.dispose(); });
