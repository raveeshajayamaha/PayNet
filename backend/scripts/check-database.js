const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { database } = require('../config/database');

async function check() {
  try {
    const health = await database.connect();
    console.log(JSON.stringify(health, null, 2));
    if (!health.transactionsSupported) console.warn('Connection works. Configure a replica set or Atlas before using transactions.');
  } catch {
    console.error('MongoDB check failed. Check MONGODB_URI, connectivity, credentials, permissions and indexes.');
    process.exitCode = 1;
  } finally {
    await database.disconnect();
  }
}

check().catch(() => { process.exitCode = 1; });
