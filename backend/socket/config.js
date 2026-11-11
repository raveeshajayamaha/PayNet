const POLICY = require('../../shared/network-policy.json');

function createSocketConfig({ environment, frontendUrl, allowedOrigins }) {
  if (!['development', 'test'].includes(environment)) return null;
  const configured = allowedOrigins ?? process.env.SOCKET_ALLOWED_ORIGINS ?? frontendUrl;
  const origins = Array.isArray(configured) ? configured : typeof configured === 'string' ? configured.split(',').map((s) => s.trim()) : [];
  if (!origins.length || origins.some((value) => {
    try {
      const url = new URL(value);
      return value.includes('*') || !['http:', 'https:'].includes(url.protocol) || url.origin !== value || Boolean(url.username || url.password);
    } catch { return true; }
  })) throw new Error('Socket.IO requires an explicit list of HTTP(S) origins without paths, credentials, or wildcards.');
  const allowlist = new Set(origins);
  return {
    cors: { origin: [...allowlist], methods: ['GET', 'POST'], credentials: false },
    // Native local clients omit Origin. Browser "null" and all unmatched origins fail.
    allowRequest: (req, callback) => callback(null,
      req.headers.origin === undefined || allowlist.has(req.headers.origin)),
    maxHttpBufferSize: POLICY.maxPacketBytes,
    connectTimeout: POLICY.verificationTimeoutMs + 1000,
    perMessageDeflate: false,
  };
}
module.exports = { createSocketConfig };
