import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"

import { requireUserOrg } from "@/lib/auth"
import { BRIEFING_SYSTEM_PROMPT, parseBriefing, summarizeGiving } from "@/lib/donor-briefing"
import { redactPII, type PIIValues } from "@/lib/pii-redaction"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { isLimitExceeded, incrementUsage, getOrgSubscription, resolveTrialLimits } from "@/lib/subscription"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const { orgId } = auth
  const { id: donorId } = await params

  // Rate limit: 20 insight requests per org per minute
  const rl = await checkRateLimit(`insights:${orgId}`, 20, 60_000)
  if (rl.limited) return rateLimitResponse(rl.retryAfterMs)

  // Check AI usage limit before proceeding
  const limitHit = await isLimitExceeded(orgId, "ai_insights")
  if (limitHit) {
    const sub = await getOrgSubscription(orgId)
    const plan = resolveTrialLimits(sub.planId, sub.trialTier)
    return NextResponse.json(
      {
        error: "AI insight limit reached",
        message: `You've used all ${plan.maxAiInsightsPerMonth} AI insights for this month. Upgrade your plan for more.`,
        limitReached: true,
      },
      { status: 429 }
    )
  }

  const supabase = createAdminClient()

  try {

  // Fetch donor (we need PII values for redaction, plus safe fields for the prompt)
  const { data: donor, error: donorErr } = await supabase
    .from("donors")
    .select(
      "id,display_name,email,phone,billing_address,city,state,zip,total_lifetime_value,last_donation_date,notes"
    )
    .eq("id", donorId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (donorErr || !donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 })
  }

  const pii: PIIValues = {
    name: donor.display_name,
    email: donor.email,
    address: donor.billing_address,
    city: donor.city,
    state: donor.state,
    phone: donor.phone,
    zip: donor.zip,
  }

  // Fetch donations (amounts + dates only — no memos which could contain PII)
  const { data: donations } = await supabase
    .from("donations")
    .select("amount,date")
    .eq("donor_id", donorId)
    .order("date", { ascending: false })

  // Fetch interactions (type, direction, date, status — redact content)
  const { data: interactions } = await supabase
    .from("interactions")
    .select("type,direction,date,status,content")
    .eq("donor_id", donorId)
    .order("date", { ascending: false })
    .limit(20)

  // Fetch tags via donor_tags join (scoped indirectly through donor_id FK)
  const { data: tagRows } = await supabase
    .from("donor_tags")
    .select("tag_id, tags(name)")
    .eq("donor_id", donorId)

  // Fetch donor notes (scoped indirectly through donor_id FK)
  const { data: donorNotes } = await supabase
    .from("donor_notes")
    .select("note,created_at")
    .eq("donor_id", donorId)
    .order("created_at", { ascending: false })
    .limit(10)

  // Build the safe data payload for the LLM
  const safeInteractions = (interactions ?? []).map((i) => ({
    type: i.type,
    direction: i.direction,
    date: i.date,
    status: i.status,
    content: i.content ? redactPII(String(i.content), pii).redacted : null,
  }))

  const safeNotes = (donorNotes ?? []).map((n) => ({
    date: n.created_at,
    note: redactPII(String(n.note), pii).redacted,
  }))

  const donorNotesRedacted = donor.notes
    ? redactPII(String(donor.notes), pii).redacted
    : null

  // Compute lifecycle status from last donation date (active if within 18 months)
  const EIGHTEEN_MONTHS_MS = 18 * 30 * 24 * 60 * 60 * 1000
  const lastDate = donor.last_donation_date ? new Date(donor.last_donation_date).getTime() : null
  const lifecycleStatus = lastDate && Date.now() - lastDate <= EIGHTEEN_MONTHS_MS ? "Active" : "Lapsed"

  const donorData = {
    lifecycle_status: lifecycleStatus,
    total_lifetime_value: donor.total_lifetime_value,
    last_donation_date: donor.last_donation_date,
    giving_summary: summarizeGiving(donations ?? []),
    donations: (donations ?? []).map((d) => ({
      amount: d.amount,
      date: d.date,
    })),
    interactions: safeInteractions,
    tags: (tagRows ?? []).map((t) => {
      const tag = t.tags as unknown as { name: string } | null
      return tag?.name ?? ""
    }).filter(Boolean),
    notes: donorNotesRedacted,
    activity_notes: safeNotes,
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Defense-in-depth: each nested field is already individually redacted above,
  // but wrap the full serialized payload once more in case a name/email/address
  // leaked through an un-redacted field (e.g., a new donor column added later).
  const redactedPayload = redactPII(JSON.stringify(donorData, null, 2), pii).redacted

  if (process.env.DEBUG_PII_REDACTION === "true") {
    console.log("[insights] outbound payload preview:", redactedPayload.slice(0, 500))
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: BRIEFING_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Today is ${new Date().toISOString().slice(0, 10)}. Prepare a visit briefing from this donor's data:\n${redactedPayload}`,
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content ?? "{}"

  // Unredact any placeholders the LLM might have echoed back
  const placeholders: Record<string, string> = {}
  if (pii.name) placeholders["DONOR_NAME"] = String(pii.name)
  if (pii.email) placeholders["DONOR_EMAIL"] = String(pii.email)
  if (pii.address) placeholders["DONOR_ADDRESS"] = String(pii.address)
  if (pii.city) placeholders["DONOR_CITY"] = String(pii.city)
  if (pii.state) placeholders["DONOR_STATE"] = String(pii.state)

  const result = parseBriefing(raw, placeholders, safeInteractions.length > 0)

  // Track usage
  await incrementUsage(orgId, "ai_insights")

  // Return result with current usage info
  const sub = await getOrgSubscription(orgId)
  const plan = resolveTrialLimits(sub.planId, sub.trialTier)
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data: usageRow } = await supabase
    .from("subscription_usage")
    .select("count")
    .eq("org_id", orgId)
    .eq("metric", "ai_insights")
    .gte("period_start", periodStart)
    .single()

  return NextResponse.json({
    ...result,
    usage: {
      used: usageRow?.count ?? 0,
      limit: plan.maxAiInsightsPerMonth,
    },
  })

  } catch (err) {
    console.error("[donor-insights] Failed to generate insights:", err)
    return NextResponse.json(
      { error: "Failed to generate insights. Please try again later." },
      { status: 500 }
    )
  }
}
