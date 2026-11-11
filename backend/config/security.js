function readSecurityConfig(env = process.env, { strictProduction = false } = {}) {
  const environment = env.NODE_ENV || 'development';
  const frontendUrl = env.FRONTEND_URL || 'http://localhost:5173';
  const origin = new URL(frontendUrl);
  if (origin.origin !== frontendUrl || !['http:', 'https:'].includes(origin.protocol)) throw new Error('FRONTEND_URL must be an exact HTTP(S) origin.');
  const secret = env.JWT_SECRET || '';
  if (secret && Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes.');
  if (environment === 'production' && ((strictProduction && !secret) || (secret && origin.protocol !== 'https:'))) throw new Error('Production requires JWT_SECRET and an HTTPS frontend.');
  const lifetime = env.JWT_EXPIRES_IN || '1h';
  const match = /^(\d+)(s|m|h|d)$/.exec(lifetime);
  const seconds = match && Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 604800) throw new Error('JWT_EXPIRES_IN must be between 60s and 7d.');
  return {
    environment, frontendUrl, secret, seconds, cookieName: 'paynet_session',
    cookie: { httpOnly: true, secure: environment === 'production', sameSite: 'lax', path: '/' },
    demoFunding: ['development', 'test'].includes(environment) && env.DEMO_FUNDING_ENABLED === 'true',
  };
}
module.exports = { readSecurityConfig };
