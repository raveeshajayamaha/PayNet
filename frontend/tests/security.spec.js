import { test, expect } from '@playwright/test';

async function socketModule(page) {
  return page.evaluate(() => performance.getEntriesByType('resource')
    .filter((entry) => new URL(entry.name).pathname === '/src/services/socket.js').at(-1)?.name);
}

test('development health shows synchronized transport, uptime and manual disconnect state', async ({ page }) => {
  await page.goto('/network-demo');
  await expect(page.getByRole('button', { name: 'Ping server' })).toBeEnabled();
  await expect(page.getByTestId('current-transport')).toHaveText(/^(polling|websocket)$/);
  await expect(page.getByTestId('retry-status')).toHaveText('connected');
  await expect(page.getByTestId('connection-uptime')).toHaveText(/^[1-9]\d* s$/, { timeout: 5000 });
  await expect(page.getByTestId('network-summary')).toContainText('financial delivery remains disabled');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByTestId('current-transport')).toHaveText('Unavailable');
  await expect(page.getByTestId('connection-uptime')).toHaveText('0 s');
  await expect(page.getByTestId('socket-id')).toHaveText('No active connection');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByTestId('retry-status')).toHaveText('connected');
});

test('health renders safe error history and blocks permanent rejection without automatic retries', async ({ page }) => {
  await page.goto('/network-demo');
  await expect(page.getByRole('button', { name: 'Ping server' })).toBeEnabled();
  const url = await socketModule(page);
  // Local UI fault injection only; no authentication token or backend identity is created.
  await page.evaluate(async (moduleUrl) => {
    const { getNetworkSocket } = await import(moduleUrl);
    getNetworkSocket().emitReserved('connect_error', { message: 'SECRET-NEVER-RENDER', data: { code: 'AUTH_REQUIRED', retryable: false } });
  }, url);
  await expect(page.getByTestId('retry-status')).toHaveText('authorization-required');
  await expect(page.getByTestId('connection-errors')).toContainText('AUTH_REQUIRED');
  await expect(page.getByTestId('network-summary')).toContainText('Automatic retries are stopped');
  await expect(page.locator('body')).not.toContainText('SECRET-NEVER-RENDER');
  await expect(page.getByRole('button', { name: 'Ping server' })).toBeDisabled();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByTestId('retry-status')).toHaveText('connected');
});
