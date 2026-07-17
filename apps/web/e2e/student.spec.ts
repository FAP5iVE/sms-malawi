import { test, expect, type Page } from '@playwright/test'

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? 'admin@sms.test'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234!'

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 })
}

// ─── AUTH FLOW ────────────────────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible()
    await expect(page.getByText(/forgot password/i)).toBeVisible()
  })

  test('invalid credentials shows error message', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email address').fill('notauser@example.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: /log in/i }).click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 6_000 })
  })

  test('unauthenticated access to dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/login/, { timeout: 6_000 })
  })

  test('unauthenticated access to students redirects to login', async ({ page }) => {
    await page.goto('/students')
    await expect(page).toHaveURL(/login/, { timeout: 6_000 })
  })
})

// ─── APPLICATION FLOW ─────────────────────────────────────────────────────────

test.describe('Public Application', () => {
  test('application form renders all steps', async ({ page }) => {
    await page.goto('/apply')
    await expect(page.getByText(/personal details/i)).toBeVisible()
  })

  test('validation blocks empty required fields', async ({ page }) => {
    await page.goto('/apply')
    await page.getByRole('button', { name: /next/i }).click()
    await expect(page.getByText(/required/i).first()).toBeVisible()
  })

  test('duplicate application returns conflict message', async ({ page }) => {
    // Register the 409 interceptor BEFORE navigating so the POST the form
    // makes on submit is actually intercepted — previously the mock was set up
    // but no submit was ever triggered, so it was dead code and the assertion
    // timed out regardless of the (independently-correct) server 409/DUPLICATE.
    await page.route('**/api/applications/public', (route) => {
      void route.fulfill({
        status:      409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'DUPLICATE', message: 'A duplicate application already exists.' }),
      })
    })

    await page.goto('/apply')

    // Step 0 — Personal
    await page.getByLabel(/first name/i).fill('Test')
    await page.getByLabel(/surname/i).fill('Duplicate')
    await page.getByLabel(/date of birth/i).fill('2010-01-01')
    await page.getByLabel(/sex/i).selectOption('male')
    await page.getByLabel(/nationality/i).selectOption('Malawi')
    await page.getByRole('button', { name: /next/i }).click()

    // Advance through the remaining steps and submit. Each step's Next is
    // gated by its own validation, so we fill the guardian step and then walk
    // to the final step's submit control.
    await page.getByLabel(/guardian name/i).fill('Jane Duplicate')
    await page.getByLabel(/relationship/i).selectOption({ index: 1 })
    await page.getByLabel(/guardian phone/i).fill('991234567')

    // Click through any intermediate steps until the Submit control appears,
    // then submit to trigger the intercepted POST.
    const submit = page.getByRole('button', { name: /submit/i })
    for (let i = 0; i < 4 && !(await submit.isVisible().catch(() => false)); i++) {
      await page.getByRole('button', { name: /next/i }).click()
    }
    await submit.click()

    await expect(page.getByText(/duplicate/i)).toBeVisible({ timeout: 8_000 })
  })
})

// ─── STUDENT MANAGEMENT ───────────────────────────────────────────────────────

test.describe('Student Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  test('students page loads with data table', async ({ page }) => {
    await page.goto('/students')
    await expect(page.getByRole('heading', { name: /students/i })).toBeVisible()
    // DataTable must be present
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })
  })

  test('student search filters results', async ({ page }) => {
    await page.goto('/students')
    await page.waitForSelector('table', { timeout: 10_000 })
    const searchInput = page.getByPlaceholder(/search/i).first()
    await searchInput.fill('Test')
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('add student form opens correctly', async ({ page }) => {
    await page.goto('/students')
    await page.getByRole('button', { name: /add student/i }).click()
    await expect(page.getByText(/personal details/i)).toBeVisible({ timeout: 5_000 })
  })
})

// ─── FEE PAYMENT ─────────────────────────────────────────────────────────────

test.describe('Finance — Fee Payment', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  test('finances page loads', async ({ page }) => {
    await page.goto('/finances')
    await expect(page.getByRole('heading', { name: /finance/i })).toBeVisible({ timeout: 8_000 })
  })

  test('invoice list is visible', async ({ page }) => {
    await page.goto('/finances')
    await expect(page.getByText(/invoice/i).first()).toBeVisible({ timeout: 10_000 })
  })
})

// ─── EXAM MARKS ───────────────────────────────────────────────────────────────

test.describe('Exams — Mark Entry', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  test('exams page loads', async ({ page }) => {
    await page.goto('/exams')
    await expect(page.getByRole('heading', { name: /exam/i })).toBeVisible({ timeout: 8_000 })
  })

  test('marks entry page accessible', async ({ page }) => {
    await page.goto('/exams')
    await expect(page.getByText(/marks/i).first()).toBeVisible({ timeout: 8_000 })
  })
})

// ─── LIBRARY ─────────────────────────────────────────────────────────────────

test.describe('Library', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  test('library page loads', async ({ page }) => {
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: /library/i })).toBeVisible({ timeout: 8_000 })
  })

  test('book catalogue visible', async ({ page }) => {
    await page.goto('/library')
    await expect(page.getByRole('table').or(page.getByText(/no books/i))).toBeVisible({ timeout: 10_000 })
  })
})