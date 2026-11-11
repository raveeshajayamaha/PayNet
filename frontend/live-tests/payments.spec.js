import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const password = 'BrowserVirtual123!';
async function register(page, name) {
  const email = randomUUID() + '@example.com';
  await page.goto('/register');
  await page.getByLabel('Full name', { exact: true }).fill(name);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  return email;
}
const shownBalance = (page) => page.locator('.balance-card h2').first();
async function preparePayment(page, email, amount = '123.45') {
  await page.goto('/send-money');
  await page.getByLabel('Recipient email').fill(email);
  await page.getByLabel('Amount (LKR)', { exact: true }).fill(amount);
  await page.getByLabel("What's it for? (optional)").fill('Browser lunch');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
test('real registration, funding, two-user transfer, live balances, history, notifications, profiles and logout', async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  try {
    await register(a, 'Alice Live'); const recipient = await register(b, 'Bob Live');
    await a.getByRole('button', { name: 'Add demo funds', exact: true }).click();
    await expect(shownBalance(a)).toHaveText('LKR 1,000.00');
    await preparePayment(a, recipient);
    await a.getByRole('button', { name: 'Confirm virtual transfer' }).click();
    await expect(a.getByRole('status')).toContainText('Payment completed. Reference PN-');
    await expect(shownBalance(a)).toHaveText('LKR 876.55');
    await expect(shownBalance(b)).toHaveText('LKR 123.45');
    await b.goto('/transactions');
    await b.getByLabel('Search transactions').fill('Browser lunch');
    await expect(b.locator('tbody')).toContainText('Alice Live');
    await b.goto('/receive-money'); await expect(b.getByText(recipient, { exact: true })).toBeVisible();
    await b.goto('/notifications'); await expect(b.getByText('Payment received', { exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(b.getByRole('button', { name: 'Unread (0)' })).toBeVisible();
    await b.reload(); await expect(b.getByRole('button', { name: 'Unread (0)' })).toBeVisible();
    await b.goto('/dashboard'); await expect(shownBalance(b)).toHaveText('LKR 123.45');
    await cb.setOffline(true);
    await preparePayment(a, recipient, '5.00'); await a.getByRole('button', { name: 'Confirm virtual transfer' }).click();
    await expect(a.getByRole('status')).toContainText('Payment completed. Reference PN-');
    await cb.setOffline(false);
    await expect(shownBalance(b)).toHaveText('LKR 128.45', { timeout: 15000 });
    await a.goto('/profile');
    await a.getByLabel('Full name', { exact: true }).fill('Alice Updated');
    await a.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(a.getByRole('status').first()).toHaveText('Profile saved.');
    await a.reload(); await expect(a.getByRole('heading', { name: 'Alice Updated' })).toBeVisible();
    await a.getByLabel('Current password', { exact: true }).fill(password);
    await a.getByLabel('New password', { exact: true }).fill('ChangedBrowser123!');
    await a.getByLabel('Confirm new password', { exact: true }).fill('ChangedBrowser123!');
    await a.getByRole('button', { name: 'Change password', exact: true }).click();
    await expect(a.getByRole('status').filter({ hasText: 'Password changed.' })).toBeVisible();
    expect(await a.evaluate(() => localStorage.length)).toBe(0);
    const cookies = await ca.cookies('http://localhost:5002');
    expect(cookies.find((c) => c.name === 'paynet_session')?.httpOnly).toBe(true);
    await a.goto('/admin'); await expect(a).toHaveURL(/dashboard/);
    await a.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(a).toHaveURL(/login/); await a.goto('/dashboard'); await expect(a).toHaveURL(/login/);
  } finally { await ca.close(); await cb.close(); }
});

test('a lost successful response survives reload and retries the same payment without another debit', async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  try {
    await register(a, 'Retry Sender'); const recipient = await register(b, 'Retry Receiver');
    await a.getByRole('button', { name: 'Add demo funds', exact: true }).click();
    await expect(shownBalance(a)).toHaveText('LKR 1,000.00');
    await a.route('**/api/transfers/send', async (route) => { await route.fetch(); await route.abort('failed'); });
    await preparePayment(a, recipient, '10.00'); await a.getByRole('button', { name: 'Confirm virtual transfer' }).click();
    await expect(a.getByRole('status')).toContainText('Outcome unconfirmed');
    await expect(shownBalance(b)).toHaveText('LKR 10.00');
    await a.unroute('**/api/transfers/send'); await a.reload();
    await a.getByRole('button', { name: 'Retry pending transfer' }).click();
    await a.getByRole('button', { name: 'Retry same payment' }).click();
    await expect(a.getByRole('status')).toContainText('Payment completed. Reference PN-');
    await expect(shownBalance(a)).toHaveText('LKR 990.00'); await expect(shownBalance(b)).toHaveText('LKR 10.00');
  } finally { await ca.close(); await cb.close(); }
});

test('admin signs in through the existing UI and sees database-provided statistics', async ({ page }) => {
  const fixture = JSON.parse(await readFile(new URL('../../backend/.npm-cache/browser-fixture.json', import.meta.url), 'utf8'));
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(fixture.email);
  await page.getByLabel('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/admin/);
  await expect(page.getByText('Registered account directory')).toBeVisible();
  await expect(page.locator('.system-panel')).toContainText('Transactions supported');
  await expect(page.getByRole('cell', { name: fixture.email, exact: true })).toBeVisible();
});
