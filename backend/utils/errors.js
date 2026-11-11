class AppError extends Error {
  constructor(status, code, message, details) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || 500;
  let code = error.code;
  let message = error.message;
  if (!(error instanceof AppError)) {
    if (error.code === 11000) { status = 409; code = 'DUPLICATE_RESOURCE'; message = 'That record already exists.'; }
    else if (error.type === 'entity.parse.failed' || error.name === 'CastError' || error.name === 'ValidationError') {
      status = 400; code = 'INVALID_REQUEST'; message = 'Invalid request data.';
    } else if (error.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large.'; }
    else { status = 503; code = 'SERVICE_UNAVAILABLE'; message = 'Service unavailable. Please try again.'; }
  }
  return res.status(status).json({ success: false, error: { code, message, ...(error instanceof AppError && error.details ? { details: error.details } : {}) } });
}
module.exports = { AppError, errorHandler };
