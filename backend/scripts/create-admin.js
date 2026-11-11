const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { database } = require('../config/database');
const { readSecurityConfig } = require('../config/security');
const { createAuthentication } = require('../services/authentication');
const { schemas, parse } = require('../middleware/validation');

async function createInitialAdmin(db, env) {
  if (env.NODE_ENV !== 'development' || env.ALLOW_ADMIN_BOOTSTRAP !== 'true') throw new Error('Admin bootstrap requires explicit development opt-in.');
  const config = readSecurityConfig(env);
  if (!config.secret) throw new Error('Configure JWT_SECRET first.');
  const input = parse(schemas.register, { fullName: env.ADMIN_FULL_NAME || 'PayNet Administrator', email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  if (await db.models.User.exists({ role: 'admin' })) throw new Error('An admin already exists. Bootstrap is only for the initial account.');
  if (await db.models.User.exists({ email: input.email })) throw new Error('That email is already registered. Bootstrap never promotes an existing account.');
  await createAuthentication(db, config).register(input, 'admin');
}
if (require.main === module) {
  (async () => {
    try {
      if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_ADMIN_BOOTSTRAP !== 'true') throw new Error('Development opt-in required.');
      await database.connect(); await createInitialAdmin(database, process.env);
      console.log('Initial administrator and wallet created. No credentials were logged.');
    } catch { console.error('Admin bootstrap failed. Check development opt-in, environment values and existing accounts.'); process.exitCode = 1; }
    finally { await database.disconnect(); }
  })().catch(() => { process.exitCode = 1; });
}
module.exports = { createInitialAdmin };
