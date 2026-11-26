/**
 * Seeds the LOCAL Supabase stack with a 3,000-donor sample organisation and an
 * owner login, for development, browser tests and speed baselines.
 *
 *   supabase start                      # from the repo root
 *   npx tsx scripts/seed-sample-org.ts  # from frontend/
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_OWNER_EMAIL and
 * SEED_OWNER_PASSWORD from frontend/.env.local. Refuses to run against anything
 * that is not a local address — it must never touch production.
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

import { generateSampleOrg } from "../lib/sample-data/generate"

config({ path: ".env.local" })

const ORG_NAME = "Sample Outreach (Local)"
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.SEED_OWNER_EMAIL
const password = process.env.SEED_OWNER_PASSWORD

function fail(message: string): never {
  console.error(`seed-sample-org: ${message}`)
  process.exit(1)
}

if (!url || !serviceKey || !email || !password) {
  fail("set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD in frontend/.env.local")
}
const host = new URL(url).hostname
if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
  fail(`refusing to seed ${host}: this script only runs against a local Supabase stack`)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function insertAll(table: string, rows: object[], chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + chunk))
    if (error) fail(`${table} rows ${i}-${i + chunk}: ${error.message}`)
  }
  console.log(`  ${table}: ${rows.length}`)
}

async function main() {
  const { data: existing, error: lookupError } = await supabase.from("organizations").select("id").eq("name", ORG_NAME).limit(1)
  if (lookupError) fail(lookupError.message)
  if (existing.length > 0) fail(`"${ORG_NAME}" already exists — run \`supabase db reset --local\` first`)

  const { data: created, error: userError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
  if (userError || !created.user) fail(`could not create the owner login: ${userError?.message}`)
  const userId = created.user.id

  const now = new Date()
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: ORG_NAME, onboarding_completed_at: now.toISOString(), fiscal_year_start_month: 1 })
    .select("id")
    .single()
  if (orgError || !org) fail(`organizations: ${orgError?.message}`)

  console.log(`Seeding "${ORG_NAME}" (${org.id})`)
  await insertAll("organization_members", [{ user_id: userId, organization_id: org.id, role: "owner", tos_accepted_at: now.toISOString() }])
  await insertAll("subscriptions", [
    { org_id: org.id, plan_id: "pro", status: "active", current_period_start: now.toISOString(), current_period_end: new Date(now.getTime() + 365 * 86_400_000).toISOString() },
  ])

  const data = generateSampleOrg({ seed: 2026, today: now, orgId: org.id })
  await insertAll("org_donation_options", data.options)
  await insertAll("donors", data.donors)
  await insertAll("donations", data.donations)
  await insertAll("interactions", data.interactions)
  await insertAll("opportunities", data.opportunities)

  const total = data.donations.reduce((sum, g) => sum + g.amount, 0)
  console.log(`Done. Lifetime giving in the sample: $${total.toLocaleString("en-US")}. Sign in as ${email}.`)
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
