import { anthropic } from "@ai-sdk/anthropic"
import { generateObject } from "ai"
import { NextResponse } from "next/server"

import { requireUserOrg } from "@/lib/auth"
import {
  buildPIIMapFromDonors,
  redactWithMapWordBoundary,
  unredactWithMap,
} from "@/lib/chat/pii-helpers"
import { redactPIIPatterns } from "@/lib/chat/pii-redactor"
import {
  PARSE_RESPONSE_SCHEMA,
  type ParsedDonation,
  type ParsedDonationWithMatch,
  type VoiceParseResponse,
} from "@/lib/donations/voice-schema"
import { transcribeEnabledServer } from "@/lib/features"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 25 * 1024 * 1024 // OpenAI Whisper limit

type DonationOptionRow = { id: string; type: string; name: string }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildPrompt(
  redactedTranscript: string,
  options: { categories: string[]; campaigns: string[]; funds: string[] }
): string {
  const today = todayISO()
  const fmtList = (xs: string[]) =>
    xs.length === 0 ? "(none defined)" : xs.map((n) => `- ${n}`).join("\n")
  return [
    `You are extracting donation entries from a transcript dictated by a nonprofit staff member.`,
    `Today's date is ${today}. Use it as the anchor for relative phrases ("today", "yesterday", "last Sunday").`,
    ``,
    `Return one row per distinct donation. If the transcript contains no donation information, return an empty array.`,
    ``,
    `Field rules:`,
    `- donor_query: the donor name as spoken. Some names will appear as placeholders like [DONOR_1] — keep them VERBATIM (do not invent a real name).`,
    `- amount: dollars as a number. "two hundred" → 200, "$50.25" → 50.25.`,
    `- date: YYYY-MM-DD. If unspecified, use today (${today}).`,
    `- payment_method: one of check, cash, zelle, wire, venmo, daf, other. Default to "check" if not stated. "donor advised fund" → daf.`,
    `- category_name / campaign_name / fund_name: extract only when the speaker mentions them. Prefer exact matches against the org's options below; otherwise use the spoken name and the server will resolve it. Return null if nothing was said.`,
    `- memo: any free-form note ("for the building", "in memory of"). Null if nothing notable.`,
    `- confidence: high if every field was explicit, medium if you inferred a default (e.g. payment method or date), low if the row was ambiguous.`,
    ``,
    `Org-defined options (prefer matching these exact names when applicable):`,
    `Categories:`,
    fmtList(options.categories),
    `Campaigns:`,
    fmtList(options.campaigns),
    `Funds:`,
    fmtList(options.funds),
    ``,
    `Transcript:`,
    `"""`,
    redactedTranscript,
    `"""`,
  ].join("\n")
}

export async function POST(request: Request) {
  if (!transcribeEnabledServer) {
    return NextResponse.json(
      { error: "Voice donation entry isn't enabled for this organization." },
      { status: 503 }
    )
  }

  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const rl = await checkRateLimit(`voice-parse:${auth.orgId}`, 30, 60_000)
  if (rl.limited) return rateLimitResponse(rl.retryAfterMs)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Transcription is not configured on the server." },
      { status: 503 }
    )
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Donation parsing is not configured on the server." },
      { status: 503 }
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an 'audio' field." },
      { status: 400 }
    )
  }

  const file = form.get("audio")
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'audio' file." }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Audio file is empty." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Audio file exceeds 25 MB limit." },
      { status: 413 }
    )
  }

  // ── Step 1: transcribe via OpenAI Whisper-1 ───────────────────────
  const whisperForm = new FormData()
  const filename = (file as File).name || "recording.webm"
  whisperForm.append("file", file, filename)
  whisperForm.append("model", "whisper-1")
  whisperForm.append("response_format", "json")

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: whisperForm,
  })
  if (!whisperRes.ok) {
    const detail = await whisperRes.text().catch(() => "")
    console.error("[voice-parse] transcription failed:", detail.slice(0, 500))
    return NextResponse.json(
      { error: "Transcription failed." },
      { status: 502 }
    )
  }
  const whisperBody = (await whisperRes.json()) as { text?: string }
  const rawTranscript = (whisperBody.text ?? "").trim()
  if (!rawTranscript) {
    return NextResponse.json(
      { transcript: "", donations: [] } satisfies VoiceParseResponse
    )
  }

  // ── Step 2: redact transcript before sending to the parser LLM ────
  const supabase = createAdminClient()
  const { data: donorIndex } = await supabase
    .from("donors")
    .select("display_name,email,phone")
    .eq("org_id", auth.orgId)
    .limit(5000)

  const piiMap = buildPIIMapFromDonors(donorIndex ?? [])
  const redactedTranscript = redactPIIPatterns(
    redactWithMapWordBoundary(rawTranscript, piiMap)
  )

  // ── Step 3: load donation options to ground the parser ────────────
  const { data: optsData } = await supabase
    .from("org_donation_options")
    .select("id,type,name")
    .eq("org_id", auth.orgId)
  const options = (optsData ?? []) as DonationOptionRow[]
  const optionLists = {
    categories: options.filter((o) => o.type === "category").map((o) => o.name),
    campaigns: options.filter((o) => o.type === "campaign").map((o) => o.name),
    funds: options.filter((o) => o.type === "fund").map((o) => o.name),
  }

  // ── Step 4: structured extraction with Claude Haiku 4.5 ───────────
  let parsed: ParsedDonation[]
  try {
    const result = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: PARSE_RESPONSE_SCHEMA,
      prompt: buildPrompt(redactedTranscript, optionLists),
      maxRetries: 1,
    })
    parsed = result.object.donations
  } catch (e) {
    console.error("[voice-parse] generateObject failed:", e)
    return NextResponse.json(
      { error: "Failed to parse donations from transcript." },
      { status: 502 }
    )
  }

  // ── Step 5: unredact donor_query strings (real names back to UI) ──
  // The LLM was given placeholders; we restore them so the suggestion match
  // and the editable preview show real spoken names.
  const unredactedDonations: ParsedDonation[] = parsed.map((d) => ({
    ...d,
    donor_query: unredactWithMap(d.donor_query, piiMap),
    memo: d.memo ? unredactWithMap(d.memo, piiMap) : d.memo,
  }))

  // ── Step 6: server-side fuzzy donor match per row ─────────────────
  const uniqueQueries = [
    ...new Set(unredactedDonations.map((d) => d.donor_query.trim()).filter(Boolean)),
  ]
  const queryToMatch = new Map<
    string,
    { id: string; display_name: string | null } | null
  >()
  await Promise.all(
    uniqueQueries.map(async (q) => {
      const { data } = await supabase
        .from("donors")
        .select("id,display_name,total_lifetime_value")
        .eq("org_id", auth.orgId)
        .ilike("display_name", `%${q}%`)
        .order("total_lifetime_value", { ascending: false, nullsFirst: false })
        .limit(1)
      const top = data?.[0] as
        | { id: string; display_name: string | null }
        | undefined
      queryToMatch.set(q, top ?? null)
    })
  )

  // ── Step 7: name → ID resolution for category/campaign/fund ───────
  const nameKey = (s: string) => s.trim().toLowerCase()
  const optByTypeAndName = new Map<string, string>()
  for (const o of options) {
    optByTypeAndName.set(`${o.type}::${nameKey(o.name)}`, o.id)
  }
  const resolveOption = (
    type: "category" | "campaign" | "fund",
    name: string | null
  ): string | null => {
    if (!name) return null
    return optByTypeAndName.get(`${type}::${nameKey(name)}`) ?? null
  }

  const donations: ParsedDonationWithMatch[] = unredactedDonations.map((d) => {
    const match = queryToMatch.get(d.donor_query.trim()) ?? null
    return {
      ...d,
      suggested_donor_id: match?.id ?? null,
      suggested_donor_label: match?.display_name ?? null,
      suggested_category_id: resolveOption("category", d.category_name),
      suggested_campaign_id: resolveOption("campaign", d.campaign_name),
      suggested_fund_id: resolveOption("fund", d.fund_name),
    }
  })

  return NextResponse.json({
    transcript: rawTranscript,
    donations,
  } satisfies VoiceParseResponse)
}
