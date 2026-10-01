/**
 * AI-powered weekly digest summary generation.
 * Gathers org-level donor/donation data, redacts PII, sends to OpenAI,
 * and returns a structured summary for the weekly digest email.
 */

import OpenAI from "openai"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getDonorLifecycleStatus, type LifecycleStatus } from "@/lib/donor-lifecycle"
import { buildPIIMapFromDonors, redactWithMap, unredactWithMap, type PIIMap } from "@/lib/chat/pii-helpers"
import type { DigestWindow } from "@/lib/digest-window"
import { fetchAllRows } from "@/lib/supabase/fetch-all"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DigestAISummary = {
  givingOverview: string
  notableActivity: string[]
  donorHealth: string
  recommendedActions: string[]
}

type NotableDonor = {
  name: string
  event: "first_gift" | "returned_after_lapse" | "large_gift" | "milestone_crossed"
  amount?: number
  lifetimeValue?: number
}

type DigestPayload = {
  period: { start: string; end: string }
  thisWeek: {
    donationCount: number
    donationTotal: number
    newDonorCount: number
    averageGift: number
    largestGift: number
  }
  previousWeek: {
    donationCount: number
    donationTotal: number
  }
  lifecycleSummary: {
    activeCount: number
    newCount: number
    lapsedCount: number
    lostCount: number
    reactivated: number
  }
  notableDonors: NotableDonor[]
  interactionsSummary: {
    totalThisWeek: number
    byType: Record<string, number>
  }
  pipelineSummary: {
    openOpportunities: number
    totalPipelineValue: number
  }
}

// ---------------------------------------------------------------------------
// Milestone thresholds (matches notifications.ts)
// ---------------------------------------------------------------------------

const MILESTONES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000]

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a nonprofit fundraising data analyst for Vantage, an AI-powered donor CRM.
Generate a concise weekly digest summary for a nonprofit organization's staff.

You will receive aggregated donor and giving data for the past 7 days. Write a brief, actionable summary covering:

1. **Giving Overview** (1-2 sentences): Total raised, comparison to previous week (% change), average gift size trends.
2. **Notable Activity** (2-4 bullet points): Highlight significant events — new major gifts, returning lapsed donors, first-time donors of note, milestone crossings. Reference donors by their placeholder names exactly as provided (e.g., [DONOR_1]).
3. **Donor Health** (1-2 sentences): Lifecycle distribution changes, any concerning trends (rising lapsed count, declining active donors).
4. **Recommended Actions** (2-3 bullet points): Concrete follow-up suggestions the team should take this week — thank-you calls, re-engagement outreach, pipeline follow-ups.

Rules:
- Be concise — this goes in an email, not a report. Total output under 250 words.
- Use donor placeholder names exactly as provided (e.g., [DONOR_1]). Never invent names.
- Format currency as USD (e.g., $1,234).
- If data is sparse (few or no donations), acknowledge the quiet week and suggest proactive outreach instead.
- Return ONLY valid JSON with this exact shape:
{
  "givingOverview": "string",
  "notableActivity": ["string", ...],
  "donorHealth": "string",
  "recommendedActions": ["string", ...]
}
- Do not include markdown formatting or code fences in the JSON values.`

// ---------------------------------------------------------------------------
// First-time donors
// ---------------------------------------------------------------------------

// Keeps the GET `.in()` URL well under PostgREST/proxy length limits.
const DONOR_ID_CHUNK = 100

/**
 * Donors (among `donorIds`) with no gift dated before `before` — i.e. whose
 * first-ever gift falls in the digest window. `donors` has no first-gift
 * column, so this is derived from donations.date. Throws on any read error so
 * a failed lookup can't silently report every donor as new.
 */
export async function findFirstTimeDonorIds(
  admin: SupabaseClient,
  orgId: string,
  donorIds: Array<string | null>,
  before: string
): Promise<Set<string>> {
  const ids = [...new Set(donorIds.filter((id): id is string => !!id))]
  const priorDonorIds = new Set<string>()
  for (let i = 0; i < ids.length; i += DONOR_ID_CHUNK) {
    const chunk = ids.slice(i, i + DONOR_ID_CHUNK)
    const rows = await fetchAllRows<{ donor_id: string }>((from, to) =>
      admin
        .from("donations")
        .select("donor_id")
        .eq("org_id", orgId)
        .in("donor_id", chunk)
        .lt("date", before)
        .order("id")
        .range(from, to)
    )
    for (const r of rows) priorDonorIds.add(r.donor_id)
  }
  return new Set(ids.filter((id) => !priorDonorIds.has(id)))
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate an AI-powered weekly digest summary for an organization.
 * Returns null on any failure — the caller should fall back to the basic digest.
 */
export async function generateDigestAISummary(
  orgId: string,
  admin: SupabaseClient,
  digestWindow: DigestWindow,
  abortSignal?: AbortSignal
): Promise<DigestAISummary | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.warn("[digest-ai] OPENAI_API_KEY not set, skipping AI summary")
      return null
    }

    const { start, end, prevStart } = digestWindow

    // -----------------------------------------------------------------------
    // Data queries (parallel). Donation and donor reads are paged — the donor
    // list also feeds the PII map, so truncating it would leak names past the
    // 1000th donor to the LLM. Any read error throws → caught below → null.
    // -----------------------------------------------------------------------
    const [
      thisWeekDonationsRaw,
      prevWeekDonations,
      allDonors,
      interactionsResult,
      opportunitiesResult,
    ] = await Promise.all([
      // This week's donations with donor info — filter by gift date, not record creation.
      fetchAllRows<unknown>((from, to) =>
        admin
          .from("donations")
          .select("amount, donor_id, donors(id, display_name, email, donor_type, total_lifetime_value, last_donation_date)")
          .eq("org_id", orgId)
          .gte("date", start)
          .lt("date", end)
          .order("id")
          .range(from, to)
      ),
      // Previous week's donations (aggregate) — filter by gift date.
      fetchAllRows<{ amount: number }>((from, to) =>
        admin
          .from("donations")
          .select("amount")
          .eq("org_id", orgId)
          .gte("date", prevStart)
          .lt("date", start)
          .order("id")
          .range(from, to)
      ),
      // All org donors for lifecycle summary + PII map
      fetchAllRows<{
        id: string
        display_name: string | null
        email: string | null
        last_donation_date: string | null
        total_lifetime_value: number | null
        donor_type: string | null
      }>((from, to) =>
        admin
          .from("donors")
          .select("id, display_name, email, last_donation_date, total_lifetime_value, donor_type")
          .eq("org_id", orgId)
          .order("id")
          .range(from, to)
      ),
      // This week's interactions — scoped via donor join (interactions has no org_id)
      admin
        .from("interactions")
        .select("type,donors!inner(org_id)")
        .eq("donors.org_id", orgId)
        .gte("created_at", start)
        .lt("created_at", end),
      // Open opportunities (uses organization_id, not org_id)
      admin
        .from("opportunities")
        .select("amount, status")
        .eq("organization_id", orgId)
        .not("status", "in", '("closed_won","closed_lost")'),
    ])

    if (interactionsResult.error) throw new Error(interactionsResult.error.message)
    if (opportunitiesResult.error) throw new Error(opportunitiesResult.error.message)

    // Left join (not !inner) so gifts without a donor still count toward the
    // week's total — keeping it equal to the digest email's headline number.
    const allWeekDonations = thisWeekDonationsRaw as Array<{
      amount: number
      donor_id: string | null
      donors: {
        id: string
        display_name: string | null
        email: string | null
        donor_type: string | null
        total_lifetime_value: number | null
        last_donation_date: string | null
      } | null
    }>
    // Donor-level analysis (notable donors, first gifts) needs the donor row.
    const thisWeekDonations = allWeekDonations.filter(
      (d): d is typeof d & { donor_id: string; donors: NonNullable<typeof d.donors> } =>
        d.donor_id !== null && d.donors !== null
    )
    const interactions = (interactionsResult.data ?? []) as Array<{ type: string }>
    const opportunities = (opportunitiesResult.data ?? []) as Array<{ amount: number | null; status: string }>

    const firstGiftDonorIds = await findFirstTimeDonorIds(
      admin,
      orgId,
      thisWeekDonations.map((d) => d.donor_id),
      start
    )

    // -----------------------------------------------------------------------
    // Compute lifecycle summary
    // -----------------------------------------------------------------------
    const lifecycleCounts: Record<LifecycleStatus, number> = {
      New: 0,
      Active: 0,
      Lapsed: 0,
      Lost: 0,
    }
    const lapsedOrLostIds = new Set<string>()

    for (const d of allDonors) {
      const { status } = getDonorLifecycleStatus(d)
      lifecycleCounts[status]++
      if (status === "Lapsed" || status === "Lost") {
        lapsedOrLostIds.add(d.id)
      }
    }

    // -----------------------------------------------------------------------
    // Identify notable donors
    // -----------------------------------------------------------------------
    const notableDonors: NotableDonor[] = []
    const seenDonorIds = new Set<string>()

    // Deduplicate donations by donor (take highest amount)
    const donorDonationMap = new Map<string, typeof thisWeekDonations[number]>()
    for (const don of thisWeekDonations) {
      const existing = donorDonationMap.get(don.donor_id)
      if (!existing || Number(don.amount) > Number(existing.amount)) {
        donorDonationMap.set(don.donor_id, don)
      }
    }

    let reactivatedCount = 0

    for (const [donorId, don] of donorDonationMap) {
      const donor = don.donors
      const name = donor.display_name || "Anonymous"

      // Returning lapsed/lost donor
      if (lapsedOrLostIds.has(donorId) && !seenDonorIds.has(donorId)) {
        reactivatedCount++
        notableDonors.push({
          name,
          event: "returned_after_lapse",
          amount: Number(don.amount),
          lifetimeValue: Number(donor.total_lifetime_value || 0),
        })
        seenDonorIds.add(donorId)
        continue
      }

      // First-time donor — derived from donations.date (no prior gifts before this window).
      if (firstGiftDonorIds.has(donorId) && !seenDonorIds.has(donorId)) {
        notableDonors.push({ name, event: "first_gift", amount: Number(don.amount) })
        seenDonorIds.add(donorId)
        continue
      }

      // Milestone crossed
      const ltv = Number(donor.total_lifetime_value || 0)
      const prevLtv = ltv - Number(don.amount)
      const crossedMilestone = MILESTONES.find((m) => prevLtv < m && ltv >= m)
      if (crossedMilestone && !seenDonorIds.has(donorId)) {
        notableDonors.push({
          name,
          event: "milestone_crossed",
          amount: crossedMilestone,
          lifetimeValue: ltv,
        })
        seenDonorIds.add(donorId)
        continue
      }
    }

    // Large gifts (top 5 by amount, if not already noted)
    const sortedByAmount = [...donorDonationMap.entries()]
      .sort(([, a], [, b]) => Number(b.amount) - Number(a.amount))
    for (const [donorId, don] of sortedByAmount) {
      if (notableDonors.length >= 15) break
      if (seenDonorIds.has(donorId)) continue
      const name = don.donors.display_name || "Anonymous"
      notableDonors.push({
        name,
        event: "large_gift",
        amount: Number(don.amount),
        lifetimeValue: Number(don.donors.total_lifetime_value || 0),
      })
      seenDonorIds.add(donorId)
    }

    // Cap at 15
    const cappedNotable = notableDonors.slice(0, 15)

    // -----------------------------------------------------------------------
    // Compute stats
    // -----------------------------------------------------------------------
    const thisWeekTotal = allWeekDonations.reduce((s, d) => s + Number(d.amount || 0), 0)
    const thisWeekCount = allWeekDonations.length
    const prevWeekTotal = prevWeekDonations.reduce((s, d) => s + Number(d.amount || 0), 0)
    const prevWeekCount = prevWeekDonations.length

    const newDonorCount = firstGiftDonorIds.size

    // Interactions by type
    const byType: Record<string, number> = {}
    for (const i of interactions) {
      byType[i.type] = (byType[i.type] || 0) + 1
    }

    // Pipeline
    const openOpps = opportunities.length
    const pipelineValue = opportunities.reduce((s, o) => s + Number(o.amount || 0), 0)

    // -----------------------------------------------------------------------
    // Build payload & redact PII
    // -----------------------------------------------------------------------
    // Build PII map from ALL donors (not just notable) to catch any name/email in the payload
    const piiDonors = allDonors.map((d) => ({
      display_name: d.display_name,
      email: d.email,
    }))
    const piiMap: PIIMap = buildPIIMapFromDonors(piiDonors)

    const payload: DigestPayload = {
      period: { start, end },
      thisWeek: {
        donationCount: thisWeekCount,
        donationTotal: thisWeekTotal,
        newDonorCount,
        averageGift: thisWeekCount > 0 ? Math.round(thisWeekTotal / thisWeekCount) : 0,
        largestGift: sortedByAmount.length > 0 ? Number(sortedByAmount[0][1].amount) : 0,
      },
      previousWeek: {
        donationCount: prevWeekCount,
        donationTotal: prevWeekTotal,
      },
      lifecycleSummary: {
        activeCount: lifecycleCounts.Active,
        newCount: lifecycleCounts.New,
        lapsedCount: lifecycleCounts.Lapsed,
        lostCount: lifecycleCounts.Lost,
        reactivated: reactivatedCount,
      },
      notableDonors: cappedNotable,
      interactionsSummary: {
        totalThisWeek: interactions.length,
        byType,
      },
      pipelineSummary: {
        openOpportunities: openOpps,
        totalPipelineValue: pipelineValue,
      },
    }

    const redactedPayload = redactWithMap(JSON.stringify(payload), piiMap)

    // -----------------------------------------------------------------------
    // Call OpenAI
    // -----------------------------------------------------------------------
    const client = new OpenAI({ apiKey })

    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze this week's data for the organization:\n${redactedPayload}`,
          },
        ],
      },
      { signal: abortSignal }
    )

    const raw = completion.choices[0]?.message?.content ?? "{}"

    let parsed: {
      givingOverview?: string
      notableActivity?: string[]
      donorHealth?: string
      recommendedActions?: string[]
    }
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error("[digest-ai] Failed to parse OpenAI response:", raw.slice(0, 200))
      return null
    }

    // Validate required fields
    if (!parsed.givingOverview || !parsed.donorHealth) {
      console.error("[digest-ai] Missing required fields in AI response")
      return null
    }

    // Unredact PII in the response
    return {
      givingOverview: unredactWithMap(parsed.givingOverview, piiMap),
      notableActivity: (parsed.notableActivity ?? []).map((s) => unredactWithMap(s, piiMap)),
      donorHealth: unredactWithMap(parsed.donorHealth, piiMap),
      recommendedActions: (parsed.recommendedActions ?? []).map((s) => unredactWithMap(s, piiMap)),
    }
  } catch (err) {
    console.error("[digest-ai] Failed to generate AI summary:", err)
    return null
  }
}
