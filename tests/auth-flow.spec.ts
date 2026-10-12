import { expect, test } from '@playwright/test';

test('a seeded user can sign in and load hotel operations', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'admin@hospiflow.com');
  await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeTruthy();

  await page.goto('/hotel');
  await expect(page.getByRole('heading', { name: 'Hotel' })).toBeVisible();
  await expect(page.getByText('Properties', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unable to load hotel operations' })).toHaveCount(
    0
  );
});
