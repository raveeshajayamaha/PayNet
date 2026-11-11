const { AppError } = require('../utils/errors');
function createAuthMiddleware(runtime) {
  const authenticated = async (req, res, next) => {
    try {
      if (!runtime.config.secret) throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured.');
      req.identity = await runtime.auth.verify(req.cookies[runtime.config.cookieName]);
      next();
    } catch (error) { next(error); }
  };
  const csrf = (req, res, next) => {
    if (!runtime.auth.checkCsrf(req.get('X-CSRF-Token'), req.identity.sessionId)) return next(new AppError(403, 'CSRF_FAILED', 'Please refresh your session and try again.'));
    next();
  };
  const admin = (req, res, next) => req.identity.user.role === 'admin' ? next() : next(new AppError(403, 'FORBIDDEN', 'Administrator access is required.'));
  return { authenticated, csrf, admin };
}
module.exports = { createAuthMiddleware };
