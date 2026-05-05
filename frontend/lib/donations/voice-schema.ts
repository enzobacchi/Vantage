import { z } from "zod"

export const VOICE_PAYMENT_METHODS = [
  "check",
  "cash",
  "zelle",
  "wire",
  "venmo",
  "daf",
  "other",
] as const

export type VoicePaymentMethod = (typeof VOICE_PAYMENT_METHODS)[number]

/**
 * One donation as extracted from a transcript by the LLM. The model returns
 * names (donor, category, campaign, fund) — the server resolves them to IDs
 * afterward. Dates must already be normalized to YYYY-MM-DD by the model
 * using today's date as anchor for relative phrases ("yesterday", "last Sunday").
 */
export const PARSED_DONATION_SCHEMA = z.object({
  donor_query: z
    .string()
    .min(1)
    .describe("Donor name as spoken (best-effort transcription of the speaker's words)"),
  amount: z.number().positive().describe("Donation amount in dollars (no currency symbol)"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("YYYY-MM-DD; if the speaker did not specify a date, use today"),
  payment_method: z
    .enum(VOICE_PAYMENT_METHODS)
    .describe("Payment method; default to 'check' if not stated"),
  category_name: z
    .string()
    .nullable()
    .describe("Category name as spoken; null if not mentioned. Server resolves to an ID."),
  campaign_name: z
    .string()
    .nullable()
    .describe("Campaign name as spoken; null if not mentioned."),
  fund_name: z
    .string()
    .nullable()
    .describe("Fund name as spoken; null if not mentioned."),
  memo: z.string().nullable().describe("Free-form note from the speaker, if any"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("How confident the model is that this row was correctly extracted"),
})

export type ParsedDonation = z.infer<typeof PARSED_DONATION_SCHEMA>

export const PARSE_RESPONSE_SCHEMA = z.object({
  donations: z
    .array(PARSED_DONATION_SCHEMA)
    .describe("Donations extracted from the transcript. Empty array if none found."),
})

/** Server-augmented row sent back to the client for the editable preview table. */
export type ParsedDonationWithMatch = ParsedDonation & {
  /** Existing donor whose display_name matched the donor_query (case-insensitive). */
  suggested_donor_id: string | null
  suggested_donor_label: string | null
  /** Existing org_donation_options.id for category/campaign/fund (case-insensitive name match). */
  suggested_category_id: string | null
  suggested_campaign_id: string | null
  suggested_fund_id: string | null
}

export type VoiceParseResponse = {
  transcript: string
  donations: ParsedDonationWithMatch[]
}

/** Body shape for /api/donations/voice-commit. */
export type VoiceCommitRow = {
  /** If set, link to this existing donor; otherwise create_new must be set. */
  donor_id: string | null
  /** If donor_id is null, create a donor with these fields first. */
  create_new: {
    display_name: string
    email: string | null
    donor_type: "individual" | "corporate" | "school" | "church"
  } | null
  amount: number
  date: string
  payment_method: VoicePaymentMethod
  category_id: string | null
  campaign_id: string | null
  fund_id: string | null
  memo: string | null
}

export type VoiceCommitResponse = {
  created: number
  errors: Array<{ index: number; message: string }>
}
