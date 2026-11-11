const { Server } = require('socket.io');
const EVENTS = require('./events');
const registerHandlers = require('./handlers');
const { createNotificationPublisher } = require('../services/notificationPublisher');
const { createSocketConfig } = require('./config');
module.exports = function initializeSocket(server, { environment, frontendUrl, allowedOrigins, logger = console, authenticateSocket, authorizeNotification }) {
  const config = createSocketConfig({ environment, frontendUrl, allowedOrigins });
  if (!config) return null;
  const io = new Server(server, config);
  io.notificationPublisher = createNotificationPublisher({ io, authenticateSocket, authorizeNotification });
  io.on('connection', (socket) => {
    const disposeHandlers = registerHandlers(socket, { environment });
    const report = (action) => {
      const count = io.of('/').sockets.size;
      logger.info(`[network] ${action}; connected clients: ${count}`);
      io.emit(EVENTS.COUNT, { count });
    };
    report('connected');
    const socketError = () => logger.warn('[network] socket error');
    socket.once('disconnect', () => {
      disposeHandlers(); socket.off('error', socketError); report('disconnected');
    });
    socket.on('error', socketError);
  });
  io.engine.on('connection_error', () => logger.warn('[network] connection rejected or failed'));
  return io;
};
