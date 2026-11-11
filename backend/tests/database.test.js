const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const mongoose = require('mongoose');
const { User, Wallet, Transaction } = require('../models');
const { createDatabase, readDatabaseConfig, supportsTransactions } = require('../config/database');
const { withDatabaseTransaction } = require('../services/databaseTransaction');
const { createPayNetServer, startPayNetServer } = require('../server');
const { MAX_CENTS, assertCents, parseLkrToCents, formatLkrCents } = require('../utils/money');
const logger = { info() {}, warn() {} };

test('decimal LKR conversion preserves cents exactly, including the safe integer boundary', () => {
  for (const [text, expected] of [['0', 0], ['0.10', 10], ['0.29', 29], ['10.5', 1050], ['90071992547409.91', MAX_CENTS]]) {
    assert.equal(parseLkrToCents(text), expected);
    assert.equal(parseLkrToCents(formatLkrCents(expected)), expected);
  }
  assert.equal(parseLkrToCents('0.10') + parseLkrToCents('0.20'), 30);
  for (const value of [0.29, '', '-1', '0.001', '1e2', 'Infinity', ' 1.00', '01', '90071992547409.92']) {
    assert.throws(() => parseLkrToCents(value));
  }
  for (const value of [-1, 1.5, NaN, Infinity, MAX_CENTS + 1, '10']) {
    assert.throws(() => assertCents(value));
  }
});

test('monetary schemas reject fractional, negative, nonfinite and unsafe amounts', async () => {
  const userId = new mongoose.Types.ObjectId();
  const transaction = { senderWalletId: userId, receiverWalletId: new mongoose.Types.ObjectId(), referenceNumber: 'TEST-REF' };
  for (const value of [-1, 0.29, NaN, Infinity, MAX_CENTS + 1, true, '29', '9007199254740991.1']) {
    await assert.rejects(new Wallet({ userId, balanceCents: value }).validate(), (error) => Boolean(error.errors.balanceCents));
    await assert.rejects(new Transaction({ ...transaction, amountCents: value }).validate(), (error) => Boolean(error.errors.amountCents));
  }
  await assert.rejects(new Transaction({ ...transaction, amountCents: 0 }).validate(), (error) => Boolean(error.errors.amountCents));
  await new Wallet({ userId, balance: MAX_CENTS }).validate();
  await new Transaction({ ...transaction, amount: MAX_CENTS }).validate();
  const wallet = new Wallet({ userId });
  assert.equal(wallet.balance, 0);
  assert.equal(wallet.currency, 'LKR');
  await assert.rejects(new Wallet({ userId, currency: 'USD' }).validate(), (error) => Boolean(error.errors.currency));
});

test('user normalization, required fields and role validation do not implement authentication', async () => {
  const user = new User({ fullName: ' Test User ', email: ' Alice@Example.com ', passwordHash: 'test-only-hash' });
  await user.validate();
  assert.equal(user.email, 'alice@example.com');
  assert.equal(user.fullName, 'Test User');
  assert.equal(user.role, 'user');
  await assert.rejects(new User({ fullName: 'Test', email: 'invalid', role: 'owner' }).validate(), (error) => Boolean(error.errors.passwordHash));
  await assert.rejects(new User({ ...user.toObject(), role: 'owner' }).validate(), (error) => Boolean(error.errors.role));
});

test('database configuration validates environment values without exposing a URI', () => {
  const uri = 'mongodb://localhost:27017/paynet?replicaSet=rs0';
  assert.equal(readDatabaseConfig({ MONGODB_URI: uri }).uri, uri);
  assert.equal(readDatabaseConfig({ MONGODB_URI: uri, MONGODB_SERVER_SELECTION_TIMEOUT_MS: '1000' }).options.serverSelectionTimeoutMS, 1000);
  for (const env of [{}, { MONGODB_URI: 'postgres://private:secret@db/paynet' }, { MONGODB_URI: uri, MONGODB_SERVER_SELECTION_TIMEOUT_MS: '0' }, { MONGODB_URI: uri, MONGODB_SERVER_SELECTION_TIMEOUT_MS: 'NaN' }]) {
    assert.throws(() => readDatabaseConfig(env), (error) => !error.message.includes('secret'));
  }
  assert.equal(supportsTransactions({ setName: 'rs0', logicalSessionTimeoutMinutes: 30, maxWireVersion: 7 }), true);
  assert.equal(supportsTransactions({ msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30, maxWireVersion: 8 }), true);
  assert.equal(supportsTransactions({ logicalSessionTimeoutMinutes: 30, maxWireVersion: 25 }), false);
  assert.equal(supportsTransactions({ setName: 'rs0', maxWireVersion: 25 }), false);
});

function fakeDatabase({ failIndexes = false, failPing = false } = {}) {
  const events = [];
  const connection = new EventEmitter();
  connection.readyState = 0;
  connection.openUri = async () => { events.push('open'); connection.readyState = 1; };
  connection.close = async () => { events.push('close'); connection.readyState = 0; };
  connection.db = {
    command: async () => { if (failPing) throw new Error('private credential'); return { ok: 1 }; },
    admin: () => ({ command: async () => ({ setName: 'rs0', logicalSessionTimeoutMinutes: 30, maxWireVersion: 25 }) }),
  };
  const models = { Test: {
    createCollection: async () => { events.push('collection'); },
    createIndexes: async () => { events.push('indexes'); if (failIndexes) throw new Error('duplicate private email'); },
  } };
  return { db: createDatabase({ connection, models }), events };
}

test('database readiness waits for indexes and a real ping; failed initialization closes the connection', async () => {
  const env = { MONGODB_URI: 'mongodb://localhost/paynet' };
  const { db, events } = fakeDatabase();
  assert.equal((await db.health()).ready, false);
  assert.equal((await db.connect(env)).transactionsSupported, true);
  assert.deepEqual(events, ['open', 'collection', 'indexes']);
  assert.equal((await db.health()).ready, true);
  await db.disconnect();
  assert.equal((await db.health()).ready, false);
  for (const options of [{ failIndexes: true }, { failPing: true }]) {
    const failing = fakeDatabase(options);
    await assert.rejects(failing.db.connect(env), (error) => !error.message.includes('private'));
    assert.equal(failing.events.at(-1), 'close');
    assert.equal((await failing.db.health()).ready, false);
  }
});

test('transaction infrastructure refuses unavailable databases and standalone servers before invoking work', async () => {
  let invoked = false;
  const work = () => { invoked = true; };
  await assert.rejects(withDatabaseTransaction(work, { health: async () => ({ ready: false }) }), /not ready/);
  await assert.rejects(withDatabaseTransaction(work, { health: async () => ({ ready: true, transactionsSupported: false }) }), /replica set/);
  assert.equal(invoked, false);
});

test('HTTP liveness stays compatible while database readiness uses 503 and sanitized failures', async (t) => {
  const db = fakeDatabase().db;
  const instance = createPayNetServer({ environment: 'test', logger, database: db });
  t.after(() => new Promise((resolve) => instance.io.close(resolve)));
  instance.server.listen(0, '127.0.0.1');
  await once(instance.server, 'listening');
  const url = `http://127.0.0.1:${instance.server.address().port}`;
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
  let response = await fetch(`${url}/api/health/database`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).success, false);
  await db.connect({ MONGODB_URI: 'mongodb://localhost/paynet' });
  response = await fetch(`${url}/api/health/database`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).database.transactionsSupported, true);
  db.health = async () => { throw new Error('mongodb://user:password@private/'); };
  response = await fetch(`${url}/api/health/database`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { success: false, message: 'MongoDB health check failed' });
});

test('startup initializes MongoDB before listening and shuts down its connection', async () => {
  const { db, events } = fakeDatabase();
  const instance = await startPayNetServer({ env: { MONGODB_URI: 'mongodb://localhost/paynet' }, database: db, logger, port: 0, host: '127.0.0.1' });
  assert.deepEqual(events, ['open', 'collection', 'indexes']);
  assert.equal(instance.server.listening, true);
  await instance.close();
  await instance.close();
  assert.equal(events.at(-1), 'close');
  assert.equal(instance.server.listening, false);
});

test('startup rejects missing production configuration but keeps health available when database initialization fails', async () => {
  await assert.rejects(startPayNetServer({ env: { NODE_ENV: 'production' }, database: fakeDatabase().db, logger, port: 0 }), /MONGODB_URI is required/);
  const { db, events } = fakeDatabase({ failIndexes: true });
  const instance = await startPayNetServer({ env: { MONGODB_URI: 'mongodb://localhost/paynet' }, database: db, logger, port: 0, host: '127.0.0.1' });
  assert.equal(instance.server.listening, true);
  assert.equal(db.status().initialized, false);
  await instance.close();
  assert.equal(events.at(-1), 'close');
});
