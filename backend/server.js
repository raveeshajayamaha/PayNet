const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { createServer } = require('node:http');
const initializeSocket = require('./socket');
require('dotenv').config({ path: path.join(__dirname, '.env') });

function createPayNetServer(options = {}) {
  const app = express();
  const FRONTEND_URL = options.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

  app.use(cors({ origin: FRONTEND_URL }));
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'PayNet API is running' });
  });

  const server = createServer(app);
  const io = initializeSocket(server, {
    environment: options.environment || process.env.NODE_ENV || 'development',
    frontendUrl: FRONTEND_URL, logger: options.logger,
    allowedOrigins: options.allowedOrigins,
    authenticateSocket: options.authenticateSocket,
    authorizeNotification: options.authorizeNotification,
  });
  return { app, server, io };
}

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  const { server, io } = createPayNetServer();
  server.listen(PORT, () => {
    console.log(`PayNet API is running at http://localhost:${PORT}`);
  }).on('error', (error) => {
    console.error('Could not start PayNet API:', error.message);
    process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      const stopped = () => process.exit(0);
      if (io) io.close(stopped);
      else server.close(stopped);
    });
  }
}
module.exports = { createPayNetServer };
