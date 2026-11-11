import { test, expect } from '@playwright/test';

test('diagnostics measure ten RTT samples on one socket and display a chart', async ({ page }) => {
  await page.goto('/network-demo');
  await expect(page.getByRole('button', { name: 'Ping server' })).toBeEnabled();
  const socketId = await page.getByTestId('socket-id').textContent();
  await page.getByRole('button', { name: 'Ping server' }).click();
  await expect(page.getByTestId('ping-latency')).toHaveText(/^\d+\.\d{2} ms$/);
  await page.getByRole('button', { name: 'Run Latency Test', exact: true }).click();
  await expect(page.getByTestId('latency-result')).toHaveText('Passed: 10 / 10 round-trip samples acknowledged.', { timeout: 20000 });
  await expect(page.getByTestId('latency-sample-count')).toHaveText('10 / 10');
  await expect(page.getByTestId('socket-id')).toHaveText(socketId);
  const region = page.getByRole('region', { name: 'Network diagnostics' });
  await expect(region.locator('svg circle')).toHaveCount(10);
  for (const key of ['minMs', 'maxMs', 'averageMs', 'medianMs', 'p95Ms']) {
    await expect(page.getByTestId(`latency-${key}`)).toHaveText(/^\d+\.\d{2} ms$/);
  }
  // For ten samples, nearest-rank p95 is the maximum.
  await expect(page.getByTestId('latency-p95Ms')).toHaveText(await page.getByTestId('latency-maxMs').textContent());
  await expect(page.getByRole('button', { name: 'Cooling down (10 seconds)' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('disconnect cancels diagnostics and navigation removes the old run', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/network-demo');
  const run = page.getByRole('button', { name: 'Run Latency Test', exact: true });
  await expect(run).toBeEnabled(); await run.click();
  await expect(page.getByTestId('latency-sample-count')).not.toHaveText('0 / 10');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByTestId('latency-result')).toContainText('Stopped.');
  await expect(page.getByRole('alert')).toContainText('Connection lost.');
  await page.getByRole('link', { name: 'PayNet / Network lab' }).click();
  await expect(page).toHaveURL(new URL('/', test.info().project.use.baseURL).href);
  // Wait for the lazy destination to mount before navigating back.
  await expect(page.getByTestId('latency-result')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByTestId('latency-result')).toHaveText('Ready. No diagnostic test has run.');
  expect(errors).toEqual([]);
});

test('transport interruption updates reconnect attempts and recovers the shared client', async ({ page }) => {
  await page.goto('/network-demo');
  await expect(page.getByRole('button', { name: 'Ping server' })).toBeEnabled();
  const oldId = await page.getByTestId('socket-id').textContent();
  // Close only this browser's real transport; no public fault-injection endpoint exists.
  await page.evaluate(async () => {
    // Use the loaded module URL, including any Vite HMR version, to avoid creating
    // an unrelated module instance during a development-server test run.
    const moduleUrl = performance.getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).pathname === '/src/services/socket.js').at(-1)?.name;
    if (!moduleUrl) throw new Error('The active socket service module was not loaded.');
    const { getNetworkSocket } = await import(moduleUrl);
    getNetworkSocket().io.engine.close();
  });
  await expect(page.getByTestId('reconnect-attempts')).toHaveText(/^[1-9]\d*$/, { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Ping server' })).toBeEnabled();
  await expect(page.getByTestId('socket-id')).not.toHaveText(oldId);
  await page.getByRole('button', { name: 'Send test notification' }).click();
  await expect(page.getByTestId('test-notification-count')).toHaveText('Received test notifications: 1');
});
