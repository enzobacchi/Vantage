import { defineConfig } from "@playwright/test"
import { config } from "dotenv"

// Browser tests run against the LOCAL stack only: `supabase start`, then
// `npx tsx scripts/seed-sample-org.ts`, then `npm run test:e2e`.
config({ path: ".env.local", quiet: true })

const baseURL = "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "./e2e/.results",
  use: {
    baseURL,
    channel: "chrome",
    storageState: "e2e/.auth/owner.json",
    trace: "retain-on-failure",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
