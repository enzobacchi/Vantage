import { expect, test } from "@playwright/test"

/**
 * Everyday paths, run against the seeded 3,000-donor sample organisation on the
 * local stack. These are the safety net for the cleanup: if one goes red, a
 * change broke something a customer does daily.
 */

test("dashboard shows the organisation's headline numbers", async ({ page }) => {
  await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible()
  await expect(page.getByText("Sample Outreach (Local)")).toBeVisible()
  await expect(page.getByText(/Total Donors\s*3,000/)).toBeVisible()
  await expect(page.getByText(/Total Revenue\s*\$[\d,]+/)).toBeVisible()
})

async function openDonorSheet(page: import("@playwright/test").Page, name: string) {
  await page.goto("/dashboard?view=donor-crm")
  await page.getByRole("searchbox", { name: /Search donors/ }).fill(name)
  await page.getByRole("button", { name, exact: true }).first().click()
  const sheet = page.getByRole("dialog", { name })
  await expect(sheet).toBeVisible()
  return sheet
}

test("find a donor by name and open their profile", async ({ page }) => {
  const sheet = await openDonorSheet(page, "Vanessa Sorensen")
  await sheet.getByRole("button", { name: "Full Profile", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/donors\/[0-9a-f-]{36}/)
  await expect(page.getByRole("heading", { name: "Vanessa Sorensen" }).first()).toBeVisible()
})

test("log a gift for an existing donor", async ({ page }) => {
  await page.goto("/dashboard/donations/entry")
  await page.getByRole("combobox").first().click()
  const picker = page.getByRole("dialog")
  await picker.getByPlaceholder("Type to search…").fill("Matt Delgado")
  await picker.getByRole("button", { name: "Matt Delgado" }).first().click()
  await page.getByLabel("Amount ($) *").fill("25")
  await page.getByRole("button", { name: "Log Donation", exact: true }).click()
  const toast = page.getByRole("region", { name: /Notifications/ }).getByRole("listitem").first()
  await expect(toast).toBeVisible()
  await expect(toast).not.toContainText(/fail|error|unable|could not/i)
})

test("log a call from a donor's profile", async ({ page }) => {
  const sheet = await openDonorSheet(page, "John Underhill")
  await sheet.getByRole("button", { name: "Full Profile", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/donors\/[0-9a-f-]{36}/)
  await page.getByRole("button", { name: /Log Activity/ }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Subject (optional)").fill("Smoke test call")
  await dialog.getByLabel("Notes").fill("Logged by the browser test")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Smoke test call").first()).toBeVisible()
})

test("tasks view opens", async ({ page }) => {
  await page.goto("/dashboard?view=tasks")
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible()
})

test("reports view opens", async ({ page }) => {
  await page.goto("/dashboard?view=saved-reports")
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible()
  await expect(page.getByRole("button", { name: "Create Report" })).toBeVisible()
})

test("pipeline shows the open asks", async ({ page }) => {
  await page.goto("/dashboard/pipeline")
  await expect(page.getByRole("heading", { name: "Pipeline", level: 1 })).toBeVisible()
  await expect(page.getByText("2027 major gift")).toHaveCount(3)
})

test("billing settings load with the current plan", async ({ page }) => {
  await page.goto("/settings?tab=billing")
  await expect(page.getByRole("button", { name: "Billing" })).toBeVisible()
  await expect(page.getByText(/Pro/).first()).toBeVisible()
})
