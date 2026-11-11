const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const mongoose = require('mongoose');
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server-core');
const { createDatabase } = require('../config/database');
const { withDatabaseTransaction } = require('../services/databaseTransaction');
const { startPayNetServer } = require('../server');

// Real isolated mongod processes on ephemeral ports. Never read the application's
// MONGODB_URI or write to a developer/Atlas database. Cache binaries in this workspace.
const binary = { downloadDir: path.join(__dirname, '..', '.mongodb-binaries') };
const logger = { info() {}, warn() {} };
const userData = (email) => ({ fullName: 'Integration Fixture', email, passwordHash: 'test-only-hash' });

test('real replica set: indexes, timestamps, session commit/rollback and database health', { timeout: 900000 }, async (t) => {
  const replset = await MongoMemoryReplSet.create({ binary, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  t.after(() => replset.stop());
  const connection = mongoose.createConnection();
  const db = createDatabase({ connection });
  t.after(() => db.disconnect());
  const instance = await startPayNetServer({
    database: db, env: { MONGODB_URI: replset.getUri('paynet_integration'), NODE_ENV: 'test' },
    logger, port: 0, host: '127.0.0.1',
  });
  t.after(() => instance.close());
  const url = `http://127.0.0.1:${instance.server.address().port}`;
  const { User, Wallet, Transaction } = db.models;
  const alice = await User.create(userData('Alice@Example.com'));
  const bob = await User.create(userData('bob@example.com'));
  const sender = await Wallet.create({ userId: alice._id });
  const receiver = await Wallet.create({ userId: bob._id });
  const record = { senderWalletId: sender._id, receiverWalletId: receiver._id, amount: 29, referenceNumber: 'TEST-UNIQUE-REF' };

  await t.test('unique indexes enforce normalized emails, wallet ownership and transaction references', async () => {
    await assert.rejects(User.create(userData(' ALICE@example.com ')), { code: 11000 });
    await assert.rejects(Wallet.create({ userId: alice._id }), { code: 11000 });
    const entry = await Transaction.create(record);
    await assert.rejects(Transaction.create(record), { code: 11000 });
    assert.equal(entry.amount, 29);
    assert.equal((await Wallet.findById(sender._id)).balance, 0);
    for (const doc of [alice, sender, entry]) {
      assert.ok(doc.createdAt instanceof Date);
      assert.ok(doc.updatedAt instanceof Date);
    }
    assert.equal((await User.findById(alice._id)).passwordHash, undefined);
    assert.equal((await User.findById(alice._id).select('+passwordHash')).passwordHash, 'test-only-hash');
    const indexes = await User.collection.indexes();
    assert.ok(indexes.some((index) => index.name === 'unique_user_email' && index.unique));
    assert.ok((await Transaction.collection.indexes()).some((index) => index.name === 'unique_transaction_reference' && index.unique));
  });

  await t.test('session commits related records together and ends after success', async () => {
    let usedSession;
    const userId = await withDatabaseTransaction(async (session, models) => {
      usedSession = session;
      const [user] = await models.User.create([userData('committed@example.com')], { session });
      await models.Wallet.create([{ userId: user._id }], { session });
      return user._id;
    }, db);
    assert.ok(usedSession.hasEnded);
    assert.ok(await User.findById(userId));
    assert.equal((await Wallet.findOne({ userId })).balance, 0);
  });

  await t.test('throwing rolls back every write and restores Mongoose document state', async () => {
    const draft = new User(userData('aborted@example.com'));
    let usedSession;
    await assert.rejects(withDatabaseTransaction(async (session) => {
      usedSession = session;
      await draft.save({ session });
      await Wallet.create([{ userId: draft._id }], { session });
      throw new Error('Intentional rollback');
    }, db), /Intentional rollback/);
    assert.ok(usedSession.hasEnded);
    assert.equal(draft.isNew, true);
    assert.equal(await User.countDocuments({ _id: draft._id }), 0);
    assert.equal(await Wallet.countDocuments({ userId: draft._id }), 0);
  });

  await t.test('duplicate reference aborts other writes within the same session', async () => {
    await assert.rejects(withDatabaseTransaction(async (session) => {
      await User.create([userData('duplicate-aborted@example.com')], { session });
      await Transaction.create([record], { session });
    }, db), { code: 11000 });
    assert.equal(await User.countDocuments({ email: 'duplicate-aborted@example.com' }), 0);
    assert.equal(await Transaction.countDocuments({ referenceNumber: record.referenceNumber }), 1);
  });

  await t.test('HTTP readiness reports a real working replica set', async () => {
    const response = await fetch(`${url}/api/health/database`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      database: { provider: 'mongodb', status: 'connected', initialized: true, ready: true, transactionsSupported: true },
    });
  });

  await t.test('connection check CLI reuses existing collections and indexes without changing records', async () => {
    const before = await User.countDocuments();
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [path.join(__dirname, '..', 'scripts', 'check-database.js')], {
      env: { ...process.env, MONGODB_URI: replset.getUri('paynet_integration') },
      timeout: 15000,
    });
    assert.equal(stderr, '');
    assert.equal(JSON.parse(stdout).transactionsSupported, true);
    assert.equal(JSON.parse(stdout).ready, true);
    assert.equal(await User.countDocuments(), before);
  });

  await t.test('database outage returns 503 while HTTP liveness remains available', async () => {
    await replset.stop();
    const response = await fetch(`${url}/api/health/database`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).success, false);
    const liveness = await fetch(`${url}/api/health`);
    assert.equal(liveness.status, 200);
    assert.equal((await liveness.json()).message, 'PayNet API is running');
  });
});

test('real standalone: connection is healthy but transaction callbacks are refused', { timeout: 900000 }, async (t) => {
  const mongod = await MongoMemoryServer.create({ binary });
  t.after(() => mongod.stop());
  const db = createDatabase({ connection: mongoose.createConnection() });
  t.after(() => db.disconnect());
  const health = await db.connect({ MONGODB_URI: mongod.getUri('paynet_standalone_integration') });
  assert.equal(health.ready, true);
  assert.equal(health.transactionsSupported, false);
  let called = false;
  await assert.rejects(withDatabaseTransaction(() => { called = true; }, db), /replica set/);
  assert.equal(called, false);
});
