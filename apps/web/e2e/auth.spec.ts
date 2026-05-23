import { test, expect } from '@playwright/test'

test('login page loads and shows form', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel('Email address')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('unauthenticated user is redirected to login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/.*login/)
})
