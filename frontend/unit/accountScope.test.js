import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountScope } from '../src/services/accountScope.js';

test('logout/account switching aborts every old request and rejects delayed responses even if abort is ignored', async () => {
  const scope = createAccountScope(); scope.change('account-a');
  const pagination = scope.capture(), refresh = scope.capture();
  assert.equal(pagination.isCurrent(), true);
  scope.change(null); assert.equal(pagination.signal.aborted, true); assert.equal(refresh.signal.aborted, true);
  scope.change('account-b'); const current = scope.capture();
  let notices = ['account-b-notice'];
  await Promise.resolve(); // delayed A response may resolve after the account change
  if (pagination.isCurrent()) notices.push('account-a-private-notice');
  assert.deepEqual(notices, ['account-b-notice']); assert.equal(current.isCurrent(), true);
  pagination.release(); refresh.release(); current.release();
});
test('returning to the same user cannot revive a request from a prior session generation', () => {
  const scope = createAccountScope(); scope.change('account-a'); const prior = scope.capture();
  scope.change('account-b'); scope.change('account-a');
  assert.equal(prior.isCurrent(), false); assert.equal(scope.capture().isCurrent(), true);
});
test('cancelled pagination is invalid while releasing a completed request does not break queued guarded updates', () => {
  const scope = createAccountScope(); scope.change('account-a'); const first = scope.capture();
  first.cancel(); first.release(); assert.equal(first.isCurrent(), false);
  const completed = scope.capture(); completed.release(); assert.equal(completed.isCurrent(), true);
  scope.change(null); assert.equal(completed.isCurrent(), false); assert.equal(scope.capture().isCurrent(), false);
});
