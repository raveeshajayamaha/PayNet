import POLICY from '../../../shared/network-policy.json' with { type: 'json' };
import { safeNetworkError } from './connectionManager.js';
import NOTIFICATIONS from '../../../shared/notification-events.json' with { type: 'json' };
// Environment-independent request helper, also exercised with real sockets in tests.
export function sendAcknowledged(socket, event, payload, { timeoutMs = 5000, signal } = {}) {
  if (!['network:ping', 'network:message', NOTIFICATIONS.TEST_REQUEST].includes(event)) return Promise.reject(Object.assign(new Error('Unsupported networking event.'), { code: 'UNKNOWN_EVENT' }));
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > POLICY.acknowledgmentTimeoutMs) return Promise.reject(new RangeError('Acknowledgment timeout must be 1–5000 ms.'));
  if (!socket.connected) return Promise.reject(Object.assign(new Error('Connect to the server before sending.'), { code: 'DISCONNECTED' }));
  return new Promise((resolve, reject) => {
    let settled = false;
    // Capture this request's ID before emitting; Socket.IO's timed callback owns its timer.
    const acknowledgmentId = socket.ids;
    const cleanup = () => { signal?.removeEventListener('abort', abort); socket.off('disconnect', disconnected); };
    const finish = (error, response) => {
      if (settled) return;
      settled = true; cleanup();
      if (error) reject(error); else resolve(response);
    };
    const discard = () => {
      // Socket.IO 4.x interoperability: remove only this request, never another consumer's work.
      for (let index = (socket.sendBuffer?.length || 0) - 1; index >= 0; index--) {
        if (socket.sendBuffer[index].id === acknowledgmentId) socket.sendBuffer.splice(index, 1);
      }
      const callback = socket.acks?.[acknowledgmentId];
      if (callback) { delete socket.acks[acknowledgmentId]; callback(new Error('Cancelled.')); }
    };
    const abort = () => {
      finish(signal.reason || Object.assign(new Error('Request cancelled.'), { code: 'ABORTED' })); discard();
    };
    const disconnected = () => { finish(Object.assign(new Error('Connection interrupted.'), { code: 'DISCONNECTED' })); discard(); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    socket.on('disconnect', disconnected);
    try { socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      if (signal?.aborted) { finish(signal.reason || new Error('Request cancelled.')); return; }
      if (error) finish(Object.assign(new Error('Server acknowledgment timed out or connection was interrupted.'), { code: 'ACK_TIMEOUT' }));
      else if (response?.ok !== true) {
        const safe = safeNetworkError(response?.error, 'INVALID_ACK');
        finish(Object.assign(new Error(safe.message), { code: safe.code }));
      } else finish(null, response);
    }); } catch {
      const safe = safeNetworkError(null, 'INVALID_PAYLOAD');
      finish(Object.assign(new Error(safe.message), { code: safe.code })); discard();
    }
  });
}
