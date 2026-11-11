// Server-defined protocol; no financial or room-subscription events.
module.exports = Object.freeze({ PING: 'network:ping', MESSAGE: 'network:message', COUNT: 'network:clients', ERROR: 'network:error' });
