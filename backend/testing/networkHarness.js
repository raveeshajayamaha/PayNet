const { io: createClient } = require('socket.io-client');
const { createPayNetServer } = require('../server');
const { performance } = require('node:perf_hooks');

function timeoutError(message) { return Object.assign(new Error(message), { code: 'TIMEOUT' }); }

function waitForEvent(emitter, event, { timeoutMs = 5000, predicate = () => true, signal } = {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); emitter.off(event, handler); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal.reason); };
    const handler = (...args) => { if (predicate(...args)) { cleanup(); resolve(args); } };
    const timer = setTimeout(() => { cleanup(); reject(timeoutError(`Timed out waiting for ${event}.`)); }, timeoutMs);
    emitter.on(event, handler);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

async function waitUntil(predicate, { timeoutMs = 5000 } = {}) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw timeoutError('Condition did not become true before deadline.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function connectClient(socket, { timeoutMs = 5000, signal } = {}) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer); socket.off('connect', connected); socket.off('connect_error', failed);
      signal?.removeEventListener('abort', abort);
    };
    const connected = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(Object.assign(new Error('Connection failed.'), { code: 'CONNECTION_FAILED' })); };
    const abort = () => { cleanup(); reject(signal.reason); };
    const timer = setTimeout(() => { cleanup(); reject(timeoutError('Connection timed out.')); }, timeoutMs);
    socket.on('connect', connected).on('connect_error', failed);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else socket.connect();
  });
}

function request(socket, event, payload = {}, { timeoutMs = 2000, signal } = {}) {
  if (!socket.connected) return Promise.reject(Object.assign(new Error('Socket is disconnected.'), { code: 'DISCONNECTED' }));
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal.reason); };
    const timer = setTimeout(() => { cleanup(); reject(timeoutError('Acknowledgment timed out.')); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    // Socket.IO's timeout also releases its internal acknowledgment callback.
    socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      cleanup();
      if (error) reject(timeoutError('Acknowledgment timed out.'));
      else resolve(response);
    });
  });
}

async function createNetworkHarness(options = {}) {
  const instance = createPayNetServer({ ...options, environment: 'test', logger: options.logger ?? { info() {}, warn() {} } });
  const sockets = new Set();
  const ready = waitForEvent(instance.server, 'listening');
  instance.server.listen(0, '127.0.0.1');
  await ready;
  const port = instance.server.address().port;
  const url = `http://127.0.0.1:${port}`;
  let closePromise;
  return {
    ...instance, url, port,
    client(options = {}) {
      const socket = createClient(url, { autoConnect: false, forceNew: true, reconnection: false, timeout: 5000, ...options });
      sockets.add(socket);
      return socket;
    },
    close() {
      closePromise ??= (async () => {
        for (const socket of sockets) {
          socket.disconnect(); socket.removeAllListeners(); socket.io.removeAllListeners();
        }
        sockets.clear();
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            instance.server.closeAllConnections();
            reject(timeoutError('Isolated server cleanup exceeded five seconds.'));
          }, 5000);
          instance.io.close(() => { clearTimeout(timer); resolve(); });
        });
      })();
      return closePromise;
    },
  };
}
module.exports = { createNetworkHarness, connectClient, request, waitForEvent, waitUntil, timeoutError };
