import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const password = 'IntegrationVirtual123!';
const api = 'http://localhost:5002';
async function register(page, name) {
  const email = randomUUID() + '@example.com';
  await page.goto('/register');
  await page.getByLabel('Full name', { exact: true }).fill(name);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/); return email;
}
async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}

for (const status of [401, 429]) {
  for (const kind of ['transfer', 'fund']) {
    test(`${kind}: lost committed response then ${status}, recovery and same-key retry cannot duplicate the payment`, async ({ browser }) => {
      const ca = await browser.newContext(), cb = await browser.newContext();
      const a = await ca.newPage(), b = await cb.newPage();
      try {
        const email = await register(a, 'Uncertainty Sender');
        let recipient;
        if (kind === 'transfer') {
          recipient = await register(b, 'Uncertainty Receiver');
          await a.getByRole('button', { name: 'Add demo funds', exact: true }).click();
          await expect(a.locator('.balance-card h2')).toHaveText('LKR 1,000.00');
        }
        const keys = []; let original;
        const pattern = kind === 'transfer' ? '**/api/transfers/send' : '**/api/wallet/demo-fund';
        await a.route(pattern, async (route) => {
          keys.push(route.request().headers()['idempotency-key']);
          if (keys.length === 1) {
            const response = await route.fetch(); expect(response.status()).toBe(201);
            original = await response.json(); await route.abort('failed');
          } else if (keys.length === 2) {
            await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false,
              error: { code: status === 401 ? 'AUTH_REQUIRED' : 'RATE_LIMITED', message: 'Injected retry rejection; original outcome is unresolved.' } }) });
          } else await route.continue();
        });
        async function retry() {
          if (kind === 'fund') await a.getByRole('button', { name: 'Retry demo funding', exact: true }).click();
          else {
            await a.getByRole('button', { name: 'Retry pending transfer', exact: true }).click();
            await a.getByRole('button', { name: 'Retry same payment', exact: true }).click();
          }
        }
        if (kind === 'fund') await a.getByRole('button', { name: 'Add demo funds', exact: true }).click();
        else {
          await a.goto('/send-money'); await a.getByLabel('Recipient email').fill(recipient);
          await a.getByLabel('Amount (LKR)', { exact: true }).fill('10.00');
          await a.getByRole('button', { name: 'Review transfer', exact: true }).click();
          await a.getByRole('button', { name: 'Confirm virtual transfer', exact: true }).click();
        }
        await expect(a.getByRole('status').filter({ hasText: 'Outcome unconfirmed' })).toBeVisible();
        await retry();
        await expect(a.getByRole('status').filter({ hasText: 'Injected retry rejection' })).toBeVisible();
        const pending = await a.evaluate(({ kind, userId }) => JSON.parse(sessionStorage.getItem(`paynet:pending:${kind}:${userId}`)),
          { kind, userId: original.transaction.sender?.id || (await (await a.request.get(api + '/api/auth/me')).json()).user.id });
        expect(pending.key).toBe(keys[0]);
        if (status === 401) {
          await a.getByRole('button', { name: 'Log out', exact: true }).click();
          await login(a, email); // actual server authentication, no token/session bypass
          if (kind === 'transfer') await a.goto('/send-money');
        } else await a.reload();
        await retry();
        await expect(a.getByRole('status').filter({ hasText: kind === 'fund' ? 'Demo funds added.' : 'Payment completed.' })).toBeVisible();
        expect(keys).toHaveLength(3); expect(new Set(keys).size).toBe(1);
        const record = await (await a.request.get(api + '/api/transactions/' + original.transaction.id)).json();
        expect(record.transaction.referenceNumber).toBe(original.transaction.referenceNumber);
        const history = await (await a.request.get(api + '/api/transactions')).json();
        expect(history.items.filter((entry) => entry.id === original.transaction.id)).toHaveLength(1);
        expect((await (await a.request.get(api + '/api/wallet/balance')).json()).balanceCents).toBe(kind === 'fund' ? 100000 : 99000);
        if (kind === 'transfer') expect((await (await b.request.get(api + '/api/wallet/balance')).json()).balanceCents).toBe(1000);
      } finally { await ca.close(); await cb.close(); }
    });
  }
}

test('old-account pagination is cancelled and cannot expose persisted notices after logout and another account login', async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage(); let release = () => {};
  try {
    await register(a, 'Pagination Account A'); const emailB = await register(b, 'Pagination Account B');
    const owner = (await (await a.request.get(api + '/api/auth/me')).json()).user.id;
    const fixture = JSON.parse(await readFile(new URL('../../backend/.npm-cache/browser-fixture.json', import.meta.url), 'utf8'));
    const target = new URL(fixture.databaseUri);
    expect(target.protocol).toBe('mongodb:'); expect(target.hostname).toBe('127.0.0.1'); expect(target.pathname).toBe('/paynet_browser_tests');
    const require = createRequire(new URL('../../backend/package.json', import.meta.url));
    const mongoose = require('mongoose'), { getModels } = require('./models');
    const db = await mongoose.createConnection(fixture.databaseUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
    try {
      // Nonfinancial test notices, only in the disposable browser-test database.
      await getModels(db).Notification.insertMany(Array.from({ length: 51 }, (_, index) => ({
        userId: owner, type: 'SYSTEM', title: 'Account A fixture', message: `A-only-private-fixture-${index}`,
      })));
    } finally { await db.close(); }
    await a.goto('/notifications');
    await expect(a.getByRole('button', { name: 'Load more notifications', exact: true })).toBeVisible();
    let intercepted; const pending = new Promise((resolve) => { intercepted = resolve; });
    const hold = new Promise((resolve) => { release = resolve; });
    await a.route('**/api/notifications?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('page') !== '2') { await route.continue(); return; }
      const response = await route.fetch(); intercepted(); await hold;
      try { await route.fulfill({ response }); } catch { /* Cancellation is expected. */ }
    });
    await a.getByRole('button', { name: 'Load more notifications', exact: true }).click(); await pending;
    await a.getByRole('button', { name: 'Log out', exact: true }).click(); await login(a, emailB);
    await a.goto('/notifications'); release();
    await expect(a.getByText(/A-only-private-fixture/)).toHaveCount(0);
    await expect(a.getByRole('button', { name: 'Load more notifications', exact: true })).toHaveCount(0);
    await expect(a.getByRole('button', { name: 'Unread (0)', exact: true })).toBeVisible();
  } finally { release(); await ca.close(); await cb.close(); }
});
