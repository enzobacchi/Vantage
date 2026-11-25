import { unredactPII } from "@/lib/pii-redaction"

/** Pre-visit briefing returned by GET /api/donors/[id]/insights. */
export type DonorBriefing = {
  summary: string
  givingHistory: string
  lastConversation: string | null
  talkingPoints: string[]
}

const MAX_TALKING_POINTS = 5

export const BRIEFING_SYSTEM_PROMPT = `You are a nonprofit fundraising advisor preparing a field rep for a donor visit. Analyze the donor data provided and return a JSON object with exactly this shape:
{
  "summary": "One sentence: who this donor is to the organization right now.",
  "givingHistory": "1-2 sentences on how much, how often, and the trend of their giving, with concrete amounts and dates.",
  "lastConversation": "1-2 sentences on the most recent interaction: when, what kind, and what was discussed. null if there are no interactions.",
  "talkingPoints": ["concrete thing to bring up 1", "concrete thing to bring up 2", "concrete thing to bring up 3"]
}
Rules:
- Never mention the donor by name. Always say "this donor" or "they".
- Only state facts present in the data. Never invent conversations, amounts, or interests.
- For giving history, rely on "giving_summary" (pre-computed count, totals, dates, and trend) rather than re-deriving the trend from the donation list. "total_lifetime_value" may include gifts older than the listed donations.
- Talking points are specific things to say or ask during the visit (2-4 items, 1 sentence each).
- Return ONLY valid JSON, no markdown fences.`

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Turn the model's raw reply into a DonorBriefing. Tolerates markdown fences,
 * missing or mistyped fields, and non-JSON replies; re-hydrates PII
 * placeholders on the way out. `hasInteractions` guards against the model
 * inventing a "last conversation" for a donor nobody has talked to.
 */
export function parseBriefing(
  raw: string,
  placeholders: Record<string, string>,
  hasInteractions: boolean
): DonorBriefing {
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")

  let parsed: Record<string, unknown>
  try {
    const value: unknown = JSON.parse(unfenced)
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object")
    parsed = value as Record<string, unknown>
  } catch {
    parsed = { summary: raw }
  }

  const unredact = (text: string) => unredactPII(text, placeholders)
  const lastConversation = hasInteractions ? asText(parsed.lastConversation) : ""
  const talkingPoints = Array.isArray(parsed.talkingPoints) ? parsed.talkingPoints : []

  return {
    summary: unredact(asText(parsed.summary)),
    givingHistory: unredact(asText(parsed.givingHistory)),
    lastConversation: lastConversation ? unredact(lastConversation) : null,
    talkingPoints: talkingPoints
      .map(asText)
      .filter(Boolean)
      .slice(0, MAX_TALKING_POINTS)
      .map(unredact),
  }
}

export type GivingSummary = {
  gift_count: number
  total_of_gifts: number
  largest_gift: number | null
  first_gift_date: string | null
  last_gift_date: string | null
  last_gift_amount: number | null
  trend: "increasing" | "declining" | "steady" | "single gift" | "none"
}

/**
 * Pre-computed giving facts handed to the model alongside the raw gifts —
 * small models misread the direction of a newest-first list, so the trend
 * (recent half vs. older half of gifts, ±15%) is computed here, not inferred.
 */
export function summarizeGiving(gifts: { amount: number | string | null; date: string }[]): GivingSummary {
  const rows = gifts
    .map((g) => ({ amount: Number(g.amount) || 0, date: g.date }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (rows.length === 0) {
    return {
      gift_count: 0,
      total_of_gifts: 0,
      largest_gift: null,
      first_gift_date: null,
      last_gift_date: null,
      last_gift_amount: null,
      trend: "none",
    }
  }

  const avg = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0) / xs.length
  let trend: GivingSummary["trend"] = "single gift"
  if (rows.length > 1) {
    const half = Math.floor(rows.length / 2)
    const older = avg(rows.slice(0, half))
    const recent = avg(rows.slice(rows.length - half))
    trend = recent > older * 1.15 ? "increasing" : recent < older * 0.85 ? "declining" : "steady"
  }

  const last = rows[rows.length - 1]
  return {
    gift_count: rows.length,
    total_of_gifts: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    largest_gift: Math.max(...rows.map((r) => r.amount)),
    first_gift_date: rows[0].date,
    last_gift_date: last.date,
    last_gift_amount: last.amount,
    trend,
  }
}
