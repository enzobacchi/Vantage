import { chromium, type FullConfig } from "@playwright/test"

/** Signs in once as the seeded sample owner and saves the session for every test. */
export default async function globalSetup(config: FullConfig) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const email = process.env.SEED_OWNER_EMAIL
  const password = process.env.SEED_OWNER_PASSWORD
  const host = supabaseUrl ? new URL(supabaseUrl).hostname : ""
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(`Browser tests only run against a local Supabase stack, not "${host || "unset"}"`)
  }
  if (!email || !password) throw new Error("Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD in frontend/.env.local")

  const { baseURL, channel } = config.projects[0].use
  const browser = await chromium.launch({ channel })
  const page = await browser.newPage({ baseURL })
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL("**/dashboard**", { timeout: 60_000 })
  await page.context().storageState({ path: "e2e/.auth/owner.json" })
  await browser.close()
}
