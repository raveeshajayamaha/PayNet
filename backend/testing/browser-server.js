// Isolated browser-test backend. Never connects to the application's database.
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomBytes, randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');
const { createDatabase } = require('../config/database');
const { createPayNetServer } = require('../server');

async function main() {
  const live = process.argv.includes('--live');
  const port = live ? 5002 : 5003;
  const frontendUrl = live ? 'http://localhost:5174' : 'http://localhost:5175';
  let db, replset;
  const env = { NODE_ENV: 'test', FRONTEND_URL: frontendUrl, DEMO_FUNDING_ENABLED: 'true', ...(live ? { JWT_SECRET: randomBytes(48).toString('hex') } : {}) };
  if (live) {
    replset = await MongoMemoryReplSet.create({ binary: { downloadDir: path.join(__dirname, '..', '.mongodb-binaries') }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
    db = createDatabase({ connection: mongoose.createConnection() });
    await db.connect({ MONGODB_URI: replset.getUri('paynet_browser_tests') });
  }
  const instance = createPayNetServer({ ...(db ? { database: db } : {}), env, frontendUrl, allowedOrigins: [frontendUrl] });
  if (live) {
    const fixture = { email: 'admin-' + randomUUID() + '@example.com', password: randomBytes(24).toString('base64url') };
    await instance.runtime.auth.register({ fullName: 'Browser Test Administrator', ...fixture }, 'admin');
    const file = path.join(__dirname, '..', '.npm-cache', 'browser-fixture.json');
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(fixture));
  }
  instance.server.listen(port, '127.0.0.1', () => console.log('Isolated PayNet browser-test backend is ready.'));
  const close = async () => {
    await new Promise((resolve) => instance.io ? instance.io.close(resolve) : instance.server.close(resolve));
    await db?.disconnect(); await replset?.stop(); process.exit(0);
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close(); });
}
main().catch(() => { console.error('Isolated browser-test backend failed to start.'); process.exitCode = 1; });
