import { test, expect } from '@playwright/test';

test('nonfinancial test notifications stay private and survive navigation and reconnect', async ({ page, context }) => {
  const other = await context.newPage();
  await page.goto('/network-demo'); await other.goto('/network-demo');
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeEnabled();
  await expect(other.getByRole('button', { name: 'Send test notification' })).toBeEnabled();
  await page.getByRole('button', { name: 'Send test notification' }).click();
  await expect(page.getByTestId('test-notification-count')).toHaveText('Received test notifications: 1');
  await expect(page.getByRole('status', { name: 'Test notification' })).toContainText('No payment was made.');
  await expect(other.getByTestId('test-notification-count')).toHaveText('Received test notifications: 0');
  await expect(other.getByRole('status', { name: 'Test notification' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeDisabled();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeEnabled();
  await page.getByRole('button', { name: 'Send test notification' }).click();
  await expect(page.getByTestId('test-notification-count')).toHaveText('Received test notifications: 2');
  await page.getByRole('link', { name: 'View notifications' }).click();
  const feed = page.getByRole('region', { name: 'Real-time test notifications' });
  await expect(feed.getByTestId('test-notification')).toHaveCount(2);
  await expect(feed).toContainText('nonfinancial');
  // Remount the demo via client-side history; app-level subscriber remains singular.
  await page.goBack();
  await page.getByRole('button', { name: 'Send test notification' }).click();
  await expect(page.getByTestId('test-notification-count')).toHaveText('Received test notifications: 3');
  await page.getByRole('link', { name: 'View notifications' }).click();
  await expect(feed.getByTestId('test-notification')).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear test notifications' }).click();
  await expect(feed.getByTestId('test-notification')).toHaveCount(0);
  await other.close();
});
