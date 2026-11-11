import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readPending, executePendingPayment, isConfirmedPaymentFailure } from '../src/services/pendingPayments.js';

const storage = new Map();
globalThis.sessionStorage = { getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
beforeEach(() => storage.clear());
const attempt = () => ({ key: 'stable-unconfirmed-key', input: { amountCents: 100, recipientEmail: 'fixture@example.com' } });
// Contract fixtures only; actual balance/idempotency behavior is tested against MongoDB separately.
const completed = { success: true, transaction: { id: '1234567890abcdef12345678', status: 'COMPLETED', referenceNumber: 'PN-unit-reference' } };

for (const kind of ['transfer', 'fund']) {
  test(`${kind}: lost response then 401/429/403/409/timeout retains the same key through reauthentication`, async () => {
    const value = attempt(), keys = [];
    for (const status of [undefined, 401, 429, 403, 409, 503]) {
      await assert.rejects(executePendingPayment(kind, 'owner-a', value, async (_, key) => {
        keys.push(key); throw Object.assign(new Error('Unconfirmed.'), { status });
      }));
      assert.deepEqual(readPending(kind, 'owner-a'), value);
      assert.equal(readPending(kind, 'owner-b'), null);
    }
    // Reauthentication/reload reads the same account-scoped request, not a new key.
    await executePendingPayment(kind, 'owner-a', readPending(kind, 'owner-a'), async (_, key) => { keys.push(key); return completed; });
    assert.equal(new Set(keys).size, 1); assert.equal(readPending(kind, 'owner-a'), null);
  });
  test(`${kind}: only explicit confirmed failed outcomes clear pending state`, async () => {
    const value = attempt();
    const failed = Object.assign(new Error('Insufficient funds.'), { status: 409, code: 'INSUFFICIENT_FUNDS', details: { status: 'FAILED', referenceNumber: 'PN-persisted-reference' } });
    await assert.rejects(executePendingPayment(kind, 'owner-a', value, async () => { throw failed; }));
    assert.equal(readPending(kind, 'owner-a'), null);
    assert.equal(isConfirmedPaymentFailure({ code: 'INSUFFICIENT_FUNDS', status: 409 }), false);
    assert.equal(isConfirmedPaymentFailure({ code: 'AUTH_REQUIRED', details: failed.details }), false);
  });
}
test('unconfirmed or malformed successful responses cannot release an unresolved request', async () => {
  for (const response of [{}, { success: true, transaction: { status: 'PENDING' } }, { success: true, transaction: { status: 'COMPLETED' } }]) {
    await assert.rejects(executePendingPayment('transfer', 'owner-a', attempt(), async () => response), { code: 'PAYMENT_OUTCOME_UNKNOWN' });
    assert.equal(readPending('transfer', 'owner-a').key, attempt().key);
  }
});
test('storage failure prevents emission instead of sending a request with an unpersisted key', async () => {
  const original = sessionStorage.setItem; let emitted = false;
  sessionStorage.setItem = () => { throw new Error('Storage unavailable.'); };
  try {
    await assert.rejects(executePendingPayment('transfer', 'owner-a', attempt(), async () => { emitted = true; }), /Storage unavailable/);
    assert.equal(emitted, false);
  } finally { sessionStorage.setItem = original; }
});
