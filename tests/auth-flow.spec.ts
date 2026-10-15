import { expect, test } from '@playwright/test';

test('the configured administrator can sign in and load hotel operations', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) {
    throw new Error('Set E2E_EMAIL and E2E_PASSWORD to an installed HOSPIFLOW administrator account.')
  }

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
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
