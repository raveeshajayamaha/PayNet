import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCents, moneyCents, mapTransaction } from '../src/services/liveData.js';

test('connected amount parsing is exact and rejects coercion, excess precision and transfer overflow', () => {
  assert.equal(parseCents('0.29'), 29);
  assert.equal(parseCents('123.45'), 12345);
  assert.equal(parseCents('100000000.00'), 10000000000);
  for (const value of [0.29, '-1', '0', '0.001', '1e3', 'Infinity', '100000000.01']) assert.throws(() => parseCents(value));
});
test('monetary display preserves integer-string summary totals beyond the safe Number range', () => {
  assert.equal(moneyCents(29), 'LKR 0.29');
  assert.equal(moneyCents('900719925474099199'), 'LKR 9,007,199,254,740,991.99');
});
test('owned transaction adaptation preserves cents, server references and real-data labeling', () => {
  const mapped = mapTransaction({ id: 'database-id', referenceNumber: 'PN-reference', amountCents: 29, status: 'COMPLETED', type: 'TRANSFER', direction: 'incoming', sender: { fullName: 'Sender', email: 'sender@example.com' }, description: 'Lunch', createdAt: '2026-11-11T12:00:00.000Z' });
  assert.equal(mapped.amountCents, 29); assert.equal(mapped.name, 'Sender'); assert.equal(mapped.id, 'PN-reference');
  assert.equal(mapped.real, true); assert.equal(mapped.status, 'completed');
});
