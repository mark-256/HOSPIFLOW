import { test } from '@playwright/test'

test('login and access protected endpoints', async ({ page }) => {
  page.on('request', (request) => {
    const headers = request.headers()
    console.log('REQUEST:', request.method(), request.url(), 'auth:', headers['authorization'] ? 'YES' : 'NO')
  })
  page.on('response', (response) => {
    console.log('RESPONSE:', response.status(), response.url())
  })

  await page.goto('http://localhost:3000/login')
  await page.evaluate(() => localStorage.clear())

  await page.fill('input[type="email"]', 'admin@hospiflow.com')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]')

  await page.waitForURL('**/dashboard')
  await page.waitForTimeout(2000)

  const token = await page.evaluate(() => localStorage.getItem('token'))
  console.log('Token in localStorage:', token ? `${token.substring(0, 50)}...` : 'NOT FOUND')

  await page.goto('http://localhost:3000/hotel')
  await page.waitForTimeout(5000)

  const errorText = await page.locator('text=Unable to load hotel operations').count()
  console.log('Hotel error visible:', errorText > 0)
})