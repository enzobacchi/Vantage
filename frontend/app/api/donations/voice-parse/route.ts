import { anthropic } from "@ai-sdk/anthropic"
import { generateObject } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"

import { requireUserOrg } from "@/lib/auth"
import {
  buildPIIMapFromDonors,
  redactWithMapWordBoundary,
  unredactWithMap,
} from "@/lib/chat/pii-helpers"
import { redactPIIPatterns } from "@/lib/chat/pii-redactor"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import type { PaymentMethod } from "@/types/database"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 25 * 1024 * 1024

const PAYMENT_METHODS = [
  "check",
  "cash",
  "zelle",
  "wire",
  "venmo",
  "daf",
  "other",
] as const

const parsedDonationSchema = z.object({
  donor_name: z
    .string()
    .describe(
      "The donor's full name as spoken, OR a placeholder like [DONOR_3] if it appears in the transcript verbatim. Empty string if no donor was mentioned for this gift."
    ),
  amount: z.number().positive().describe("Dollar amount as a number, no currency symbol."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe(
      "Donation date in YYYY-MM-DD. Resolve relative dates ('Tuesday', 'yesterday') against the provided clientToday. If no date was mentioned, use clientToday."
    ),
  payment_method: z
    .enum(PAYMENT_METHODS)
    .describe(
      "Payment method. Default to 'check' if the speaker did not specify."
    ),
  category_name: z
    .string()
    .nullable()
    .describe("Matched category name from the org's option list, or null if none was mentioned."),
  campaign_name: z
    .string()
    .nullable()
    .describe("Matched campaign name from the org's option list, or null if none was mentioned."),
  fund_name: z
    .string()
    .nullable()
    .describe("Matched fund name from the org's option list, or null if none was mentioned."),
  memo: z.string().nullable().describe("Optional short memo / note. Null if nothing extra was said."),
})

const extractionSchema = z.object({
  donations: z.array(parsedDonationSchema),
})

type DonorRecord = {
  id: string
  display_name: string | null
  email: string | null
  phone: string | null
}

type DonationOptionRow = {
  id: string
  type: "category" | "campaign" | "fund"
  name: string
}

function parseHumanName(
  full: string
): { firstName: string; lastName: string; displayName: string } {
  const display = full.trim().replace(/\s+/g, " ")
  if (!display) return { firstName: "", lastName: "", displayName: "" }
  const parts = display.split(" ")
  const firstName = parts[0] ?? ""
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : ""
  return { firstName, lastName, displayName: display }
}

function findOptionMatch(
  options: DonationOptionRow[],
  type: DonationOptionRow["type"],
  spokenName: string | null
): { id: string | null; name: string | null; suggested_new: string | null } {
  if (!spokenName?.trim()) {
    return { id: null, name: null, suggested_new: null }
  }
  const target = spokenName.trim().toLowerCase()
  const exact = options.find(
    (o) => o.type === type && o.name.toLowerCase() === target
  )
  if (exact) return { id: exact.id, name: exact.name, suggested_new: null }

  // Loose contains match (e.g. "building" → "Building Fund")
  const partial = options.find(
    (o) =>
      o.type === type &&
      (o.name.toLowerCase().includes(target) ||
        target.includes(o.name.toLowerCase()))
  )
  if (partial) return { id: partial.id, name: partial.name, suggested_new: null }

  return { id: null, name: null, suggested_new: spokenName.trim() }
}

export async function POST(request: Request) {
  if (process.env.TRANSCRIBE_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Voice donation entry is disabled. Type donations into the form instead." },
      { status: 503 }
    )
  }

  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(`voice-parse:${auth.orgId}`, 20, 60_000)
  if (rl.limited) return rateLimitResponse(rl.retryAfterMs)

  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!openaiKey || !anthropicKey) {
    return NextResponse.json(
      { error: "Voice donation entry is not configured on the server." },
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
  const clientTodayRaw = form.get("clientToday")
  const clientToday =
    typeof clientTodayRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(clientTodayRaw)
      ? clientTodayRaw
      : new Date().toISOString().slice(0, 10)

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

  // 1. Whisper transcription
  const whisperForm = new FormData()
  const filename = (file as File).name || "recording.m4a"
  whisperForm.append("file", file, filename)
  whisperForm.append("model", "whisper-1")
  whisperForm.append("response_format", "json")

  const whisperRes = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperForm,
    }
  )
  if (!whisperRes.ok) {
    const detail = await whisperRes.text().catch(() => "")
    return NextResponse.json(
      { error: "Transcription failed.", detail: detail.slice(0, 500) },
      { status: 502 }
    )
  }
  const whisperBody = (await whisperRes.json()) as { text?: string }
  const rawTranscript = whisperBody.text?.trim() ?? ""
  if (!rawTranscript) {
    return NextResponse.json(
      { error: "Couldn't hear anything in the recording. Try again." },
      { status: 422 }
    )
  }

  // 2. Build PII map from the org's donor index
  const supabase = createAdminClient()
  const { data: donorIndex } = await supabase
    .from("donors")
    .select("id,display_name,email,phone")
    .eq("org_id", auth.orgId)
    .limit(5000)

  const donors: DonorRecord[] = (donorIndex ?? []) as DonorRecord[]
  const piiMap = buildPIIMapFromDonors(donors)

  // Reverse-lookup helper: placeholder string → donor row
  const placeholderToDonor = new Map<string, DonorRecord>()
  for (const [placeholder, value] of Object.entries(piiMap.entries)) {
    if (!placeholder.startsWith("[DONOR_")) continue
    const match = donors.find(
      (d) => (d.display_name ?? "").trim() === value
    )
    if (match) placeholderToDonor.set(placeholder, match)
  }

  // 3. Redact transcript before sending to Claude
  const redactedTranscript = redactPIIPatterns(
    redactWithMapWordBoundary(rawTranscript, piiMap)
  )

  // 4. Load donation options for prompt context
  const { data: optionRows } = await supabase
    .from("org_donation_options")
    .select("id,type,name")
    .eq("org_id", auth.orgId)
  const options: DonationOptionRow[] = (optionRows ?? []) as DonationOptionRow[]
  const categoryNames = options.filter((o) => o.type === "category").map((o) => o.name)
  const campaignNames = options.filter((o) => o.type === "campaign").map((o) => o.name)
  const fundNames = options.filter((o) => o.type === "fund").map((o) => o.name)

  // 5. Structured extraction with Claude
  const systemPrompt = [
    "You convert a transcribed voice memo from a nonprofit staffer into structured donation rows.",
    "Each donation the speaker mentions becomes one row. If the same donor gave twice, return two rows.",
    "",
    `Today's date is ${clientToday}. Resolve relative dates ("yesterday", "Tuesday", "last week") against this date.`,
    "Date format must be YYYY-MM-DD. If no date is mentioned for a row, use today's date.",
    "",
    "Donor names in the transcript may appear as bracketed placeholders like [DONOR_3]. If you see one, return it verbatim in donor_name. Otherwise return the donor name as spoken.",
    "If no donor name was given for a particular amount, return an empty string for donor_name.",
    "",
    `Allowed payment methods: ${PAYMENT_METHODS.join(", ")}. If the speaker doesn't specify, default to "check".`,
    "",
    "For category, campaign, and fund: only return a name if it case-insensitively matches one of the options below, OR if the speaker clearly named one. Return null when the speaker didn't mention any.",
    `Available categories: ${categoryNames.length ? categoryNames.join(" | ") : "(none)"}`,
    `Available campaigns: ${campaignNames.length ? campaignNames.join(" | ") : "(none)"}`,
    `Available funds: ${fundNames.length ? fundNames.join(" | ") : "(none)"}`,
    "",
    "memo: only fill if the speaker said something extra worth recording (e.g. 'in memory of...', 'matching gift'). Otherwise null.",
    "",
    "Output strictly conforms to the schema. Do not invent donations the speaker didn't mention.",
  ].join("\n")

  let extracted: z.infer<typeof extractionSchema>
  try {
    const result = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: extractionSchema,
      system: systemPrompt,
      prompt: `Transcript:\n${redactedTranscript}`,
      maxRetries: 1,
    })
    extracted = result.object
  } catch (err) {
    console.error("[voice-parse] LLM extraction failed", err)
    return NextResponse.json(
      { error: "Couldn't parse the recording. Try again or enter the donation manually." },
      { status: 502 }
    )
  }

  // 6. Reconcile each parsed row against the org's data
  const rows = extracted.donations.map((row) => {
    const rawName = row.donor_name?.trim() ?? ""
    const placeholderMatch = rawName.match(/^\[DONOR_\d+\]$/)
    let donorId: string | null = null
    let donorDisplay = ""
    let parsedFirst = ""
    let parsedLast = ""

    if (placeholderMatch) {
      const hit = placeholderToDonor.get(rawName)
      if (hit) {
        donorId = hit.id
        donorDisplay = hit.display_name ?? ""
      }
    } else if (rawName) {
      // Unredact any embedded placeholders, then look the name up.
      const realName = unredactWithMap(rawName, piiMap).trim()
      donorDisplay = realName

      const lower = realName.toLowerCase()
      const exact = donors.find(
        (d) => (d.display_name ?? "").trim().toLowerCase() === lower
      )
      if (exact) {
        donorId = exact.id
        donorDisplay = exact.display_name ?? realName
      } else {
        const { firstName, lastName } = parseHumanName(realName)
        parsedFirst = firstName
        parsedLast = lastName
      }
    }

    const candidates =
      !donorId && donorDisplay
        ? donors
            .filter((d) => {
              const dn = (d.display_name ?? "").toLowerCase()
              const target = donorDisplay.toLowerCase()
              return (
                dn.includes(target) ||
                target.includes(dn) ||
                (parsedFirst && dn.startsWith(parsedFirst.toLowerCase()))
              )
            })
            .slice(0, 3)
            .map((d) => ({
              id: d.id,
              display_name: d.display_name ?? "Unknown",
            }))
        : []

    const category = findOptionMatch(options, "category", row.category_name)
    const campaign = findOptionMatch(options, "campaign", row.campaign_name)
    const fund = findOptionMatch(options, "fund", row.fund_name)

    const paymentMethod: PaymentMethod = (PAYMENT_METHODS as readonly string[]).includes(
      row.payment_method
    )
      ? (row.payment_method as PaymentMethod)
      : "check"

    return {
      donor: {
        id: donorId,
        display_name: donorDisplay,
        candidates,
        parsed_first_name: parsedFirst,
        parsed_last_name: parsedLast,
      },
      amount: Math.round(row.amount * 100) / 100,
      date: row.date,
      payment_method: paymentMethod,
      category,
      campaign,
      fund,
      memo: row.memo?.trim() || null,
    }
  })

  return NextResponse.json({
    transcript: redactedTranscript,
    rows,
  })
}
