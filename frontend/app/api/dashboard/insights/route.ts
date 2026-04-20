import { NextResponse } from "next/server"
import OpenAI from "openai"

import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { getDonorLifecycleStatus, type LifecycleStatus } from "@/lib/donor-lifecycle"
import { buildPIIMapFromDonors, redactWithMap, unredactWithMap } from "@/lib/chat/pii-helpers"

export const runtime = "nodejs"

export type DailyInsight = {
  id: string
  icon: "trending_up" | "heart" | "alert" | "star"
  headline: string
  detail: string
}

const MILESTONES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000]

const SYSTEM_PROMPT = `You are a nonprofit fundraising analyst for Vantage, an AI-powered donor CRM.
Generate exactly 4 concise, high-value daily insights for an organization's dashboard.

You will receive aggregated donor and giving data. Write exactly 4 insights — each should be a brief, specific observation that helps the team understand their donor base today.

Focus on the most significant and actionable information:
- Giving trends (amounts, frequency, comparisons to previous periods)
- Donor health (who's thriving, who's at risk, lifecycle changes)
- Notable events (milestones, reactivations, new donors, large gifts)
- Opportunities (pipeline, engagement patterns, follow-up needs)

Each insight should have:
- "icon": one of "trending_up" (giving/revenue trends), "heart" (donor milestones/loyalty), "alert" (risks/attention needed), "star" (opportunities/wins)
- "headline": 6-10 words, punchy and specific (e.g., "Giving up 23% over last week")
- "detail": 1-2 sentences with context and specific numbers. Reference donors by placeholder names exactly as provided (e.g., [DONOR_1]).

Rules:
- Return ONLY valid JSON: { "insights": [{ "icon": "...", "headline": "...", "detail": "..." }, ...] }
- Exactly 4 insights. No more, no less.
- Be specific with numbers — avoid vague statements like "several donors."
- If data is sparse, focus on what IS there (total donors, lifecycle distribution, pipeline status).
- Format currency as USD (e.g., $1,234).
- Do not include markdown formatting in JSON values.`

export async function GET() {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { insights: buildFallbackInsights() },
      { status: 200 }
    )
  }

  try {
    const supabase = createAdminClient()
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Parallel data queries
    const [
      donorsRes,
      recentDonationsRes,
      prevWeekDonationsRes,
      interactionsRes,
      opportunitiesRes,
      tasksRes,
    ] = await Promise.all([
      supabase
        .from("donors")
        .select("id,display_name,email,total_lifetime_value,last_donation_date,donor_type")
        .eq("org_id", auth.orgId),
      // Last 7 days donations with donor info
      supabase
        .from("donations")
        .select("id,donor_id,amount,date,acknowledgment_sent_at,donors!inner(id,display_name)")
        .eq("org_id", auth.orgId)
        .gte("date", sevenDaysAgo.slice(0, 10))
        .order("amount", { ascending: false }),
      // Previous 7 days (for comparison)
      supabase
        .from("donations")
        .select("amount")
        .eq("org_id", auth.orgId)
        .gte("date", fourteenDaysAgo.slice(0, 10))
        .lt("date", sevenDaysAgo.slice(0, 10)),
      // Recent interactions (30 days) — scoped via donor join (interactions has no org_id)
      supabase
        .from("interactions")
        .select("type,donor_id,date,donors!inner(org_id)")
        .eq("donors.org_id", auth.orgId)
        .gte("date", thirtyDaysAgo),
      // Open pipeline
      supabase
        .from("opportunities")
        .select("id,donor_id,amount,status,expected_date,title")
        .eq("organization_id", auth.orgId)
        .not("status", "in", '("closed_won","closed_lost")'),
      // Overdue tasks — scoped via donor join (interactions has no org_id)
      supabase
        .from("interactions")
        .select("id,donor_id,subject,date,donors!inner(org_id)")
        .eq("donors.org_id", auth.orgId)
        .eq("type", "task")
        .eq("status", "pending")
        .lt("date", now.toISOString()),
    ])

    const donors = (donorsRes.data ?? []) as Array<{
      id: string
      display_name: string | null
      email: string | null
      total_lifetime_value: number | null
      last_donation_date: string | null
      donor_type: string | null
    }>
    const recentDonationsRaw = (recentDonationsRes.data ?? []) as unknown as Array<{
      id: string
      donor_id: string
      amount: number
      date: string
      acknowledgment_sent_at: string | null
      donors: { id: string; display_name: string | null }
    }>
    const recentDonations = recentDonationsRaw
    const prevWeekDonations = (prevWeekDonationsRes.data ?? []) as Array<{ amount: number }>
    const interactions = (interactionsRes.data ?? []) as Array<{ type: string; donor_id: string; date: string }>
    const opportunities = (opportunitiesRes.data ?? []) as Array<{
      id: string; donor_id: string | null; amount: number | null; status: string; expected_date: string | null; title: string | null
    }>
    const overdueTasks = (tasksRes.data ?? []) as Array<{ id: string; donor_id: string; subject: string | null; date: string }>

    // Derive "first-gift this week" set from donations.date.
    // `donors` has no first_donation_date column, so we identify first-time
    // donors by checking which week-givers have zero prior donations.
    const weekDonorIds = [...new Set(recentDonations.map((d) => d.donor_id))]
    const firstGiftDonorIds = new Set<string>()
    if (weekDonorIds.length > 0) {
      const priorDonorIds = new Set<string>()
      const pageSize = 1000
      for (let offset = 0; priorDonorIds.size < weekDonorIds.length; offset += pageSize) {
        const { data: page } = await supabase
          .from("donations")
          .select("donor_id")
          .eq("org_id", auth.orgId)
          .in("donor_id", weekDonorIds)
          .lt("date", sevenDaysAgo.slice(0, 10))
          .range(offset, offset + pageSize - 1)
        const rows = (page ?? []) as Array<{ donor_id: string }>
        for (const r of rows) priorDonorIds.add(r.donor_id)
        if (rows.length < pageSize) break
      }
      for (const id of weekDonorIds) {
        if (!priorDonorIds.has(id)) firstGiftDonorIds.add(id)
      }
    }

    // Compute lifecycle distribution
    const lifecycleCounts: Record<LifecycleStatus, number> = { New: 0, Active: 0, Lapsed: 0, Lost: 0 }
    const lapsedOrLostIds = new Set<string>()
    for (const d of donors) {
      const { status } = getDonorLifecycleStatus(d)
      lifecycleCounts[status]++
      if (status === "Lapsed" || status === "Lost") lapsedOrLostIds.add(d.id)
    }

    // Revenue stats
    const thisWeekTotal = recentDonations.reduce((s, d) => s + Number(d.amount || 0), 0)
    const prevWeekTotal = prevWeekDonations.reduce((s, d) => s + Number(d.amount || 0), 0)
    const unacknowledgedCount = recentDonations.filter(d => !d.acknowledgment_sent_at).length

    // Notable donors
    type Notable = { name: string; event: string; amount?: number; ltv?: number }
    const notables: Notable[] = []
    const seenIds = new Set<string>()

    for (const don of recentDonations) {
      const donorId = don.donor_id
      if (seenIds.has(donorId)) continue
      const donor = donors.find(d => d.id === donorId)
      if (!donor) continue
      const name = donor.display_name || "Anonymous"

      // Reactivated lapsed/lost donor
      if (lapsedOrLostIds.has(donorId)) {
        notables.push({ name, event: "returned_after_lapse", amount: Number(don.amount) })
        seenIds.add(donorId)
        continue
      }

      // First-time donor — derived from donations.date (no prior gifts before the window).
      if (firstGiftDonorIds.has(donorId)) {
        notables.push({ name, event: "first_gift", amount: Number(don.amount) })
        seenIds.add(donorId)
        continue
      }

      // Milestone crossed
      const ltv = Number(donor.total_lifetime_value || 0)
      const prevLtv = ltv - Number(don.amount)
      const milestone = MILESTONES.find(m => prevLtv < m && ltv >= m)
      if (milestone) {
        notables.push({ name, event: "milestone_crossed", amount: milestone, ltv })
        seenIds.add(donorId)
        continue
      }
    }

    // Add top gifts not already noted
    for (const don of recentDonations.slice(0, 5)) {
      if (seenIds.has(don.donor_id) || notables.length >= 10) continue
      notables.push({
        name: don.donors?.display_name || "Anonymous",
        event: "large_gift",
        amount: Number(don.amount),
      })
      seenIds.add(don.donor_id)
    }

    // Interactions by type
    const interactionsByType: Record<string, number> = {}
    for (const i of interactions) {
      interactionsByType[i.type] = (interactionsByType[i.type] || 0) + 1
    }

    // Pipeline
    const pipelineValue = opportunities.reduce((s, o) => s + Number(o.amount || 0), 0)

    // Build payload and redact PII
    const piiDonors = notables.map(n => ({ display_name: n.name }))
    const piiMap = buildPIIMapFromDonors(piiDonors)

    const payload = {
      totalDonors: donors.length,
      thisWeek: {
        donationCount: recentDonations.length,
        revenue: thisWeekTotal,
        averageGift: recentDonations.length > 0 ? Math.round(thisWeekTotal / recentDonations.length) : 0,
        unacknowledgedDonations: unacknowledgedCount,
      },
      previousWeek: {
        donationCount: prevWeekDonations.length,
        revenue: prevWeekTotal,
      },
      lifecycle: lifecycleCounts,
      notableDonors: notables.slice(0, 10),
      interactions: {
        last30Days: interactions.length,
        byType: interactionsByType,
      },
      pipeline: {
        openOpportunities: opportunities.length,
        totalValue: pipelineValue,
      },
      overdueTasks: overdueTasks.length,
    }

    const redactedPayload = redactWithMap(JSON.stringify(payload), piiMap)

    // Call OpenAI
    const client = new OpenAI({ apiKey })
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Analyze this organization's data and generate 4 daily insights:\n${redactedPayload}` },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? "{}"
    let parsed: { insights?: Array<{ icon?: string; headline?: string; detail?: string }> }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ insights: buildFallbackInsights() })
    }

    const insights: DailyInsight[] = (parsed.insights ?? []).slice(0, 4).map((item, i) => ({
      id: `insight-${i}`,
      icon: validateIcon(item.icon),
      headline: unredactWithMap(item.headline ?? "", piiMap),
      detail: unredactWithMap(item.detail ?? "", piiMap),
    }))

    // Pad to 4 if LLM returned fewer
    while (insights.length < 4) {
      insights.push(buildFallbackInsights()[insights.length] ?? {
        id: `insight-${insights.length}`,
        icon: "star",
        headline: "Welcome to your dashboard",
        detail: "Your daily insights will appear here as your donor data grows.",
      })
    }

    return NextResponse.json({ insights })
  } catch (err) {
    console.error("[daily-insights] Error:", err)
    return NextResponse.json({ insights: buildFallbackInsights() })
  }
}

function validateIcon(icon: string | undefined): DailyInsight["icon"] {
  const valid = ["trending_up", "heart", "alert", "star"] as const
  return valid.includes(icon as any) ? (icon as DailyInsight["icon"]) : "star"
}

function buildFallbackInsights(): DailyInsight[] {
  return [
    { id: "fallback-0", icon: "star", headline: "Welcome to Daily Insights", detail: "AI-powered insights about your donors will appear here as your data grows." },
    { id: "fallback-1", icon: "heart", headline: "Keep building relationships", detail: "Log calls, send emails, and track interactions to see engagement insights." },
    { id: "fallback-2", icon: "trending_up", headline: "Track your giving trends", detail: "As donations come in, you'll see revenue trends and comparisons here." },
    { id: "fallback-3", icon: "alert", headline: "Stay ahead of donor risk", detail: "We'll flag at-risk donors and lapsed giving patterns automatically." },
  ]
}
