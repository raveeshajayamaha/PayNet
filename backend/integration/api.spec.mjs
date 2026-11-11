import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { io } from 'socket.io-client';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import databaseModule from '../config/database.js';
import serverModule from '../server.js';
import adminModule from '../scripts/create-admin.js';
import migrationModule from '../scripts/migrate-money-fields.js';
const { createDatabase } = databaseModule;
const { createPayNetServer } = serverModule;
const origin = 'http://localhost:5173';
const secret = randomBytes(48).toString('hex');
const env = { NODE_ENV: 'test', FRONTEND_URL: origin, JWT_SECRET: secret, JWT_EXPIRES_IN: '1h', DEMO_FUNDING_ENABLED: 'true' };
const logger = { info() {}, warn() {} };
let replset, db, instance, url, sockets, failBeforeCommit;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ binary: { downloadDir: path.resolve('.mongodb-binaries') }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  db = createDatabase({ connection: mongoose.createConnection() });
  await db.connect({ MONGODB_URI: replset.getUri('paynet_api_tests') });
});
afterAll(async () => { await db?.disconnect(); await replset?.stop(); });
beforeEach(async () => {
  for (const model of Object.values(db.models)) await model.deleteMany({});
  sockets = []; failBeforeCommit = false;
  instance = createPayNetServer({ database: db, env, logger, beforePaymentCommit: () => { if (failBeforeCommit) throw new Error('Injected precommit failure'); } });
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  url = `http://127.0.0.1:${instance.server.address().port}`;
});
afterEach(async () => {
  sockets.forEach((socket) => { socket.removeAllListeners(); socket.disconnect(); });
  await new Promise((resolve) => instance.io.close(resolve));
});
const prepare = (query, actor, csrf = true, requestOrigin = origin) => {
  query.set('Origin', requestOrigin).set('X-PayNet-Request', '1');
  if (actor && csrf) query.set('X-CSRF-Token', actor.csrf);
  return query;
};
async function register(email = 'alice@example.com', fullName = 'Alice Test') {
  const agent = request.agent(url);
  const response = await prepare(agent.post('/api/auth/register')).send({ fullName, email, password: 'VirtualTest123!' });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return { agent, ...response.body, csrf: response.body.csrfToken, cookie: response.headers['set-cookie'][0].split(';')[0], response };
}
const fund = (actor, amountCents, key = randomUUID()) => prepare(actor.agent.post('/api/wallet/demo-fund'), actor).set('Idempotency-Key', key).send({ amountCents });
const send = (actor, recipientEmail, amountCents, key = randomUUID(), description = '') => prepare(actor.agent.post('/api/transfers/send'), actor).set('Idempotency-Key', key).send({ recipientEmail, amountCents, description });
async function balance(actor) { const response = await actor.agent.get('/api/wallet/balance'); expect(response.status).toBe(200); return response.body.balanceCents; }
async function socketFor(actor, options = {}) {
  const socket = io(url + '/payments', { autoConnect: false, reconnection: false, forceNew: true, extraHeaders: { Origin: origin, ...(actor ? { Cookie: actor.cookie } : {}) }, ...options });
  sockets.push(socket);
  const connected = once(socket, 'connect', { signal: AbortSignal.timeout(5000) });
  socket.connect(); await connected; return socket;
}

describe('authentication and ownership', () => {
  it('rolls back registration when wallet creation fails', async () => {
    const spy = vi.spyOn(db.models.Wallet, 'create').mockRejectedValueOnce(new Error('Injected wallet failure'));
    try {
      const response = await prepare(request(url).post('/api/auth/register')).send({ fullName: 'Atomic User', email: 'atomic@example.com', password: 'VirtualTest123!' });
      expect(response.status).toBe(503);
      expect(await db.models.User.countDocuments()).toBe(0); expect(await db.models.Session.countDocuments()).toBe(0);
    } finally { spy.mockRestore(); }
  });
  it('registers normalized users and a zero balance wallet atomically; returns only safe data', async () => {
    const a = await register(' ALICE@Example.com ');
    expect(a.user.email).toBe('alice@example.com'); expect(a.user.role).toBe('user');
    expect(a.wallet.balanceCents).toBe(0); expect(await db.models.Wallet.countDocuments()).toBe(1);
    expect(a.response.text).not.toMatch(/passwordHash|tokenHash|"token"/);
    expect(a.response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(a.response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    const stored = await db.models.User.findById(a.user.id).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[ab]\$12\$/); expect(stored.passwordHash).not.toContain('VirtualTest');
    expect((await a.agent.get('/api/auth/me')).body.user.id).toBe(a.user.id);
  });
  it('rejects duplicate normalized emails without creating extra wallets', async () => {
    await register();
    const result = await prepare(request(url).post('/api/auth/register')).send({ fullName: 'Other User', email: 'ALICE@example.com', password: 'VirtualTest123!' });
    expect(result.status).toBe(409); expect(await db.models.Wallet.countDocuments()).toBe(1);
  });
  it('rejects role and balance injection and malformed registration', async () => {
    for (const extra of [{ role: 'admin' }, { balanceCents: 900000 }, { email: { $ne: null } }, { password: 'short' }]) {
      const response = await prepare(request(url).post('/api/auth/register')).send({ fullName: 'Alice Test', email: 'alice@example.com', password: 'VirtualTest123!', ...extra });
      expect(response.status).toBe(400);
    }
    expect(await db.models.User.countDocuments()).toBe(0);
  });
  it('logs in with a secure session and rejects wrong passwords and NoSQL objects', async () => {
    await register();
    const agent = request.agent(url);
    const login = await prepare(agent.post('/api/auth/login')).send({ email: 'alice@example.com', password: 'VirtualTest123!' });
    expect(login.status).toBe(200); expect(login.headers['set-cookie'][0]).not.toContain('Expires=');
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const remembered = await prepare(agent.post('/api/auth/login')).send({ email: 'alice@example.com', password: 'VirtualTest123!', rememberMe: true });
    expect(remembered.headers['set-cookie'][0]).toContain('Expires=');
    expect((await prepare(request(url).post('/api/auth/login')).send({ email: 'alice@example.com', password: 'WrongPassword!' })).status).toBe(401);
    expect((await prepare(request(url).post('/api/auth/login')).send({ email: { $ne: null }, password: 'VirtualTest123!' })).status).toBe(400);
    expect((await request(url).get('/api/wallet')).status).toBe(401);
  });
  it('returns only the authenticated wallet even when a different user ID is supplied', async () => {
    const a = await register(); const b = await register('bob@example.com', 'Bob Test');
    await fund(a, 1000);
    const response = await b.agent.get('/api/wallet').query({ userId: a.user.id });
    expect(response.body.wallet.userId).toBe(b.user.id); expect(response.body.wallet.balanceCents).toBe(0);
  });
  it('requires exact origins, JSON and session-bound CSRF on mutations', async () => {
    const a = await register();
    expect((await a.agent.post('/api/wallet/demo-fund').send({ amountCents: 100 })).status).toBe(403);
    expect((await prepare(a.agent.post('/api/wallet/demo-fund'), a, false).send({ amountCents: 100 })).status).toBe(403);
    expect((await prepare(a.agent.patch('/api/users/profile'), a, true, 'https://evil.example').send({ fullName: 'Changed' })).status).toBe(403);
    expect(await balance(a)).toBe(0);
  });
  it('updates only profile names and persists the change', async () => {
    const a = await register();
    expect((await prepare(a.agent.patch('/api/users/profile'), a).send({ fullName: 'Alice Updated' })).status).toBe(200);
    expect((await a.agent.get('/api/users/profile')).body.user.fullName).toBe('Alice Updated');
    expect((await prepare(a.agent.patch('/api/users/profile'), a).send({ fullName: 'Admin', role: 'admin' })).status).toBe(400);
  });
  it('requires the current password, rotates the session, and invalidates old cookies', async () => {
    const a = await register();
    expect((await prepare(a.agent.patch('/api/users/change-password'), a).send({ currentPassword: 'wrong', newPassword: 'NewVirtual123!' })).status).toBe(401);
    const result = await prepare(a.agent.patch('/api/users/change-password'), a).send({ currentPassword: 'VirtualTest123!', newPassword: 'NewVirtual123!' });
    expect(result.status).toBe(200); expect(result.body.csrfToken).not.toBe(a.csrf);
    expect((await request(url).get('/api/auth/me').set('Cookie', a.cookie)).status).toBe(401);
    expect((await a.agent.get('/api/auth/me')).status).toBe(200);
  });
  it('logout revokes a captured JWT cookie, clears it and disconnects that session', async () => {
    const a = await register(); const socket = await socketFor(a);
    const disconnected = once(socket, 'disconnect', { signal: AbortSignal.timeout(5000) });
    const response = await prepare(a.agent.post('/api/auth/logout'), a).send({});
    expect(response.status).toBe(200); await disconnected;
    expect((await request(url).get('/api/auth/me').set('Cookie', a.cookie)).status).toBe(401);
  });
});

describe('atomic virtual payments and audit history', () => {
  it('publication failure cannot change a committed payment into an unsuccessful API response', async () => {
    const a = await register(); const b = await register('bob@example.com'); await fund(a, 1000);
    instance.runtime.publish = async () => { throw new Error('Injected transport outage'); };
    expect((await send(a, b.user.email, 100)).status).toBe(201);
    expect([await balance(a), await balance(b)]).toEqual([900, 100]);
    expect(await db.models.Notification.countDocuments({ userId: b.user.id })).toBe(1);
  });
  it('transfers exact integer cents and records matching owned history and summary', async () => {
    const a = await register(); const b = await register('bob@example.com', 'Bob Test');
    expect((await fund(a, 1000)).status).toBe(201);
    const response = await send(a, b.user.email, 29, randomUUID(), 'Lunch');
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.transaction.status).toBe('COMPLETED');
    expect([await balance(a), await balance(b)]).toEqual([971, 29]);
    const history = await b.agent.get('/api/transactions?type=incoming&status=COMPLETED&search=Lunch&limit=1');
    expect(history.body.items).toHaveLength(1); expect(history.body.items[0].sender.fullName).toBe('Alice Test');
    expect((await b.agent.get('/api/wallet/summary')).body.totalReceivedCents).toBe('29');
    expect((await a.agent.get('/api/transactions/summary')).body.totalSentCents).toBe('29');
  });
  it('records insufficient funds as a failed audit outcome without moving money', async () => {
    const a = await register(); const b = await register('bob@example.com');
    const key = randomUUID();
    const first = await send(a, b.user.email, 1, key); const retry = await send(a, b.user.email, 1, key);
    expect(first.status).toBe(409); expect(retry.status).toBe(409);
    expect(first.body.error.details.referenceNumber).toBe(retry.body.error.details.referenceNumber);
    expect([await balance(a), await balance(b)]).toEqual([0, 0]);
    expect(await db.models.Transaction.countDocuments({ type: 'TRANSFER', status: 'FAILED' })).toBe(1);
    expect(await db.models.Notification.countDocuments({ userId: b.user.id })).toBe(0);
  });
  it('rejects invalid amounts, same-account payments, unknown and inactive recipients', async () => {
    const a = await register(); const b = await register('bob@example.com'); await fund(a, 1000);
    for (const amount of [0, -1, 0.1, '100', null, Number.MAX_SAFE_INTEGER + 1]) expect((await send(a, b.user.email, amount)).status).toBe(400);
    expect((await send(a, a.user.email, 100)).status).toBe(400);
    expect((await send(a, 'missing@example.com', 100)).status).toBe(404);
    await db.models.User.updateOne({ _id: b.user.id }, { $set: { isActive: false } });
    expect((await send(a, b.user.email, 100)).status).toBe(404); expect(await balance(a)).toBe(1000);
  });
  it('replays successful idempotent requests without another debit and rejects changed payloads', async () => {
    const a = await register(); const b = await register('bob@example.com'); await fund(a, 1000);
    const key = randomUUID(); const first = await send(a, b.user.email, 100, key); const replay = await send(a, b.user.email, 100, key);
    expect([first.status, replay.status]).toEqual([201, 200]); expect(replay.body.replayed).toBe(true);
    expect(replay.body.transaction.id).toBe(first.body.transaction.id);
    expect((await send(a, b.user.email, 200, key)).status).toBe(409);
    expect([await balance(a), await balance(b)]).toEqual([900, 100]);
  });
  it('concurrent requests sharing a key perform exactly one transfer', async () => {
    const a = await register(); const b = await register('bob@example.com'); await fund(a, 1000);
    const key = randomUUID(); const results = await Promise.all(Array.from({ length: 8 }, () => send(a, b.user.email, 100, key)));
    expect(results.every((r) => [200, 201].includes(r.status)), JSON.stringify(results.map((r) => r.body))).toBe(true);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect([await balance(a), await balance(b)]).toEqual([900, 100]);
    expect(await db.models.Transaction.countDocuments({ idempotencyKey: key })).toBe(1);
  });
  it('simultaneous different transfers cannot overdraw a wallet', async () => {
    const a = await register(); const b = await register('bob@example.com'); await fund(a, 1000);
    const results = await Promise.all([send(a, b.user.email, 700), send(a, b.user.email, 700)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect([await balance(a), await balance(b)]).toEqual([300, 700]);
    expect(await db.models.Wallet.countDocuments({ balanceCents: { $lt: 0 } })).toBe(0);
  });
  it('rolls back debit, credit, ledger and notifications on a precommit failure; same-key retry is safe', async () => {
    const a = await register(); const b = await register('bob@example.com'); await fund(a, 1000);
    const socket = await socketFor(b); const events = []; socket.on('payment:received', (e) => events.push(e));
    failBeforeCommit = true; const key = randomUUID();
    expect((await send(a, b.user.email, 100, key)).status).toBe(503);
    expect([await balance(a), await balance(b)]).toEqual([1000, 0]);
    expect(await db.models.Transaction.countDocuments({ type: 'TRANSFER' })).toBe(0);
    expect(await db.models.Notification.countDocuments({ userId: b.user.id })).toBe(0); expect(events).toHaveLength(0);
    failBeforeCommit = false;
    expect((await send(a, b.user.email, 100, key)).status).toBe(201);
    expect([await balance(a), await balance(b)]).toEqual([900, 100]);
  });
  it('guards receiver overflow and rolls back the sender debit', async () => {
    const a = await register(); const b = await register('bob@example.com'); await fund(a, 1000);
    await db.models.Wallet.updateOne({ userId: b.user.id }, { $set: { balanceCents: 1000000000000 - 50 } });
    expect((await send(a, b.user.email, 100)).status).toBe(409);
    expect(await balance(a)).toBe(1000); expect(await balance(b)).toBe(1000000000000 - 50);
  });
  it('enforces lifetime demo funding limits even after funds are spent', async () => {
    const a = await register(); const b = await register('bob@example.com');
    expect((await fund(a, 1000000)).status).toBe(201); await send(a, b.user.email, 100);
    expect((await fund(a, 1)).status).toBe(409); expect(await balance(a)).toBe(999900);
  });
  it('prevents access to unrelated transaction and notification records', async () => {
    const a = await register(); const b = await register('bob@example.com'); await fund(a, 1000);
    const transfer = await send(a, b.user.email, 100); const c = await register('carol@example.com');
    expect((await c.agent.get('/api/transfers/' + transfer.body.transaction.id)).status).toBe(404);
    const notice = await db.models.Notification.findOne({ userId: b.user.id });
    expect((await prepare(c.agent.patch('/api/notifications/' + notice._id + '/read'), c).send({})).status).toBe(404);
    expect((await c.agent.get('/api/transactions')).body.total).toBe(0);
  });
  it('persists notification read markers and supports unread counts and mark-all', async () => {
    const a = await register(); await fund(a, 100);
    const list = await a.agent.get('/api/notifications'); expect(list.body.unreadCount).toBe(1);
    expect((await prepare(a.agent.patch('/api/notifications/' + list.body.items[0].id + '/read'), a).send({})).status).toBe(200);
    expect((await a.agent.get('/api/notifications/unread-count')).body.unreadCount).toBe(0);
    await fund(a, 100); expect((await prepare(a.agent.patch('/api/notifications/read-all'), a).send({})).status).toBe(200);
    expect((await a.agent.get('/api/notifications/unread-count')).body.unreadCount).toBe(0);
  });
});

describe('authenticated sockets, administration and operational safety', () => {
  it('disabled production funding stays disabled even if the demo flag is set', async () => {
    const a = await register();
    const production = createPayNetServer({ database: db, env: { ...env, NODE_ENV: 'production', FRONTEND_URL: 'https://paynet.example' }, logger });
    try {
      const response = await prepare(request(production.app).post('/api/wallet/demo-fund').set('Cookie', a.cookie), a, true, 'https://paynet.example')
        .set('Idempotency-Key', randomUUID()).send({ amountCents: 100 });
      expect(response.status).toBe(403); expect(response.body.error.code).toBe('DEMO_FUNDING_DISABLED'); expect(await balance(a)).toBe(0);
    } finally { await new Promise((resolve) => production.io.close(resolve)); }
  });
  it('secure initial-admin bootstrap requires development opt-in and refuses public-account promotion', async () => {
    await expect(adminModule.createInitialAdmin(db, { ...env, NODE_ENV: 'production', ALLOW_ADMIN_BOOTSTRAP: 'true' })).rejects.toThrow();
    await register();
    await expect(adminModule.createInitialAdmin(db, { ...env, NODE_ENV: 'development', ALLOW_ADMIN_BOOTSTRAP: 'true', ADMIN_EMAIL: 'alice@example.com', ADMIN_PASSWORD: 'PrivateAdmin123!' })).rejects.toThrow(/already registered/);
    await adminModule.createInitialAdmin(db, { ...env, NODE_ENV: 'development', ALLOW_ADMIN_BOOTSTRAP: 'true', ADMIN_EMAIL: 'private-admin@example.com', ADMIN_PASSWORD: 'PrivateAdmin123!' });
    expect((await db.models.User.findOne({ email: 'private-admin@example.com' })).role).toBe('admin');
  });
  it('legacy cents migrate without rescaling or losing balances', async () => {
    const userId = new mongoose.Types.ObjectId(), walletId = new mongoose.Types.ObjectId();
    await db.connection.db.collection('wallets').insertOne({ _id: walletId, userId, balance: 12345, currency: 'LKR' });
    await db.connection.db.collection('transactions').insertOne({ senderWalletId: walletId, amount: 29, status: 'completed', referenceNumber: 'LEGACY-TEST', createdAt: new Date() });
    const result = await migrationModule.migrateLegacyMoney(db.connection);
    expect(result).toEqual({ wallets: 1, transactions: 1 });
    const wallet = await db.models.Wallet.findById(walletId); expect(wallet.balanceCents).toBe(12345);
    const transaction = await db.models.Transaction.findOne({ referenceNumber: 'LEGACY-TEST' }); expect(transaction.amountCents).toBe(29); expect(transaction.status).toBe('COMPLETED');
  });
  it('rate-limits authenticated payment attempts without changing balances', async () => {
    const a = await register();
    const responses = await Promise.all(Array.from({ length: 65 }, () => send(a, 'nobody@example.com', 0)));
    expect(responses.some((r) => r.status === 429)).toBe(true); expect(await balance(a)).toBe(0);
  });
  it('rejects unauthenticated and impersonated socket handshakes', async () => {
    const socket = io(url + '/payments', { autoConnect: false, forceNew: true, reconnection: false, auth: { userId: 'admin', role: 'admin' }, extraHeaders: { Origin: origin } });
    sockets.push(socket); const rejected = once(socket, 'connect_error', { signal: AbortSignal.timeout(5000) }); socket.connect();
    expect((await rejected)[0].data.code).toBe('AUTH_REQUIRED');
  });
  it('notifies only the committed sender and receiver; refuses client room selection', async () => {
    const a = await register(); const b = await register('bob@example.com'); const c = await register('carol@example.com'); await fund(a, 1000);
    const sa = await socketFor(a), sb = await socketFor(b), sc = await socketFor(c);
    const leaked = []; sc.onAny((event) => leaked.push(event));
    const denied = await sc.timeout(2000).emitWithAck('join', { userId: b.user.id }); expect(denied.ok).toBe(false);
    const sent = once(sa, 'payment:sent', { signal: AbortSignal.timeout(5000) });
    const received = once(sb, 'payment:received', { signal: AbortSignal.timeout(5000) });
    const response = await send(a, b.user.email, 100);
    expect(response.status).toBe(201);
    expect((await sent)[0].referenceNumber).toBe(response.body.transaction.referenceNumber);
    expect((await received)[0].referenceNumber).toBe(response.body.transaction.referenceNumber);
    expect(leaked).toEqual([]);
  });
  it('recovers missed committed updates from persisted APIs after reconnecting', async () => {
    const a = await register(); const b = await register('bob@example.com'); await fund(a, 1000);
    const sb = await socketFor(b); sb.disconnect(); await send(a, b.user.email, 100);
    const connected = once(sb, 'connect', { signal: AbortSignal.timeout(5000) }); sb.connect(); await connected;
    expect(await balance(b)).toBe(100);
    const notices = await b.agent.get('/api/notifications'); expect(notices.body.items[0].type).toBe('PAYMENT_RECEIVED');
    expect((await b.agent.get('/api/transactions')).body.total).toBe(1);
  });
  it('enforces server-side admin roles and returns safe system statistics', async () => {
    const a = await register(); expect((await a.agent.get('/api/admin/dashboard')).status).toBe(403);
    await db.models.User.updateOne({ _id: a.user.id }, { $set: { role: 'admin' } });
    const response = await a.agent.get('/api/admin/dashboard'); expect(response.status).toBe(200); expect(response.body.totalWallets).toBe(1);
    expect((await a.agent.get('/api/admin/users')).text).not.toMatch(/passwordHash|tokenHash|authVersion/);
    expect((await a.agent.get('/api/admin/system-health')).body.database.transactionsSupported).toBe(true);
  });
  it('provides safe health aliases and security headers independently of authentication', async () => {
    const response = await request(url).get('/api/health'); expect(response.body.message).toBe('PayNet API is running');
    expect(response.headers['x-content-type-options']).toBe('nosniff'); expect(response.headers['x-powered-by']).toBeUndefined();
    expect((await request(url).get('/api/db-health')).body.database.ready).toBe(true);
    expect((await request(url).get('/api/transactions?search[$ne]=x')).status).toBe(401);
  });
});
