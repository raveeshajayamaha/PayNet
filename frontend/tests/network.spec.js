import { test, expect } from '@playwright/test';

test('network demo connects, acknowledges, disconnects and clears logs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/network-demo');
  await expect(page.getByRole('heading', { name: 'Every connection counts.' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('● connected');
  // The development server may also have the developer's browser tabs connected.
  await expect(page.getByTestId('client-count')).toHaveText(/^[1-9]\d*$/);
  await expect(page.getByTestId('socket-id')).not.toHaveText('No active connection');
  await page.getByRole('button', { name: 'Ping server' }).click();
  await expect(page.locator('pre')).toContainText('pong');
  await page.getByLabel('Test message (maximum 500 characters)').fill('Browser test');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('pre')).toContainText('Browser test');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('● disconnected');
  await expect(page.getByRole('button', { name: 'Ping server' })).toBeDisabled();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('● connected');
  await page.getByRole('button', { name: 'Clear log' }).click();
  await expect(page.locator('.network-log li')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/');
  await page.goto('/network-demo');
  await expect(page.getByTestId('client-count')).toHaveText(/^[1-9]\d*$/);
  expect(errors).toEqual([]);
});
