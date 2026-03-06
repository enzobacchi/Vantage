import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

import { requireUserOrg } from "@/lib/auth"
import { redactPII, unredactPII, type PIIValues } from "@/lib/pii-redaction"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const { orgId } = auth
  const { id: donorId } = await params
  const supabase = createAdminClient()

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

  // Fetch tags via donor_tags join
  const { data: tagRows } = await supabase
    .from("donor_tags")
    .select("tag_id, tags(name)")
    .eq("donor_id", donorId)

  // Fetch donor notes
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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `You are a nonprofit fundraising advisor. Analyze the donor data provided and return a JSON object with exactly this shape:
{
  "summary": "A 2-3 sentence overview of this donor's engagement and giving patterns.",
  "insights": ["insight 1", "insight 2", "insight 3"],
  "nextSteps": ["actionable step 1", "actionable step 2"]
}
Rules:
- Never mention the donor by name. Always say "this donor" or "they".
- Focus on giving trends, engagement frequency, lifecycle status, and actionable recommendations.
- Keep insights concise (1 sentence each).
- Next steps should be concrete actions a fundraiser can take this week.
- Return ONLY valid JSON, no markdown fences.`,
      },
      {
        role: "user",
        content: `Analyze this donor's data and provide insights:\n${JSON.stringify(donorData, null, 2)}`,
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content ?? "{}"

  let parsed: { summary?: string; insights?: string[]; nextSteps?: string[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = { summary: raw, insights: [], nextSteps: [] }
  }

  // Unredact any placeholders the LLM might have echoed back
  const placeholders: Record<string, string> = {}
  if (pii.name) placeholders["DONOR_NAME"] = String(pii.name)
  if (pii.email) placeholders["DONOR_EMAIL"] = String(pii.email)
  if (pii.address) placeholders["DONOR_ADDRESS"] = String(pii.address)
  if (pii.city) placeholders["DONOR_CITY"] = String(pii.city)
  if (pii.state) placeholders["DONOR_STATE"] = String(pii.state)

  const result = {
    summary: unredactPII(parsed.summary ?? "", placeholders),
    insights: (parsed.insights ?? []).map((i) => unredactPII(i, placeholders)),
    nextSteps: (parsed.nextSteps ?? []).map((s) =>
      unredactPII(s, placeholders)
    ),
  }

  return NextResponse.json(result)
}
