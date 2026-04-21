import { NextResponse } from "next/server"

import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { computeDonorHealthScore } from "@/lib/donor-score"
import { getDonorLifecycleStatus } from "@/lib/donor-lifecycle"

export const runtime = "nodejs"

export type SmartAction = {
  id: string
  type:
    | "thank_donor"
    | "follow_up"
    | "at_risk"
    | "re_engage"
    | "milestone"
    | "pipeline"
    | "task_overdue"
  priority: "high" | "medium" | "low"
  title: string
  description: string
  donorId?: string
  donorName?: string
  amount?: number
}

export async function GET() {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const supabase = createAdminClient()
  const actions: SmartAction[] = []

  // Run all queries in parallel
  const [donorsRes, donationsRes, interactionsRes, opportunitiesRes, tasksRes] =
    await Promise.all([
      // All donors with recent data
      supabase
        .from("donors")
        .select(
          "id,display_name,total_lifetime_value,last_donation_date,email"
        )
        .eq("org_id", auth.orgId)
        .order("total_lifetime_value", {
          ascending: false,
          nullsFirst: false,
        })
        .limit(500),

      // Recent unacknowledged donations (last 30 days)
      supabase
        .from("donations")
        .select("id,donor_id,amount,date,acknowledgment_sent_at")
        .eq("org_id", auth.orgId)
        .is("acknowledgment_sent_at", null)
        .gte(
          "date",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        )
        .order("amount", { ascending: false })
        .limit(50),

      // All interactions for scoring (last 24 months) — scoped via donor join (interactions has no org_id)
      supabase
        .from("interactions")
        .select("donor_id,date,type,donors!inner(org_id)")
        .eq("donors.org_id", auth.orgId)
        .gte(
          "date",
          new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        ),

      // Open pipeline opportunities
      supabase
        .from("opportunities")
        .select("id,donor_id,title,amount,status,expected_date")
        .eq("organization_id", auth.orgId)
        .not("status", "in", '("closed_won","closed_lost")')
        .order("expected_date", { ascending: true })
        .limit(20),

      // Overdue tasks — scoped via donor join (interactions has no org_id)
      supabase
        .from("interactions")
        .select("id,donor_id,subject,content,date,donors!inner(org_id)")
        .eq("donors.org_id", auth.orgId)
        .eq("type", "task")
        .eq("status", "pending"),
    ])

  const donors = donorsRes.data ?? []
  const unackedDonations = donationsRes.data ?? []
  const allInteractions = interactionsRes.data ?? []
  const opportunities = opportunitiesRes.data ?? []
  const overdueTasks = tasksRes.data ?? []

  // Build donor lookup
  const donorMap = new Map(donors.map((d) => [d.id, d]))

  // Build interaction lookup by donor
  const interactionsByDonor = new Map<
    string,
    { date: string | null; type: string }[]
  >()
  for (const i of allInteractions) {
    if (!i.donor_id) continue
    const list = interactionsByDonor.get(i.donor_id) ?? []
    list.push({ date: i.date, type: i.type })
    interactionsByDonor.set(i.donor_id, list)
  }

  // Also need donations per donor for scoring
  const donationsByDonor = new Map<
    string,
    { amount: number | string | null; date: string | null }[]
  >()

  // 1. THANK DONORS — unacknowledged donations
  for (const donation of unackedDonations.slice(0, 5)) {
    const donor = donorMap.get(donation.donor_id)
    if (!donor) continue
    const amount =
      typeof donation.amount === "number"
        ? donation.amount
        : Number(donation.amount) || 0
    actions.push({
      id: `thank-${donation.id}`,
      type: "thank_donor",
      priority: amount >= 500 ? "high" : "medium",
      title: `Send thank-you to ${donor.display_name ?? "donor"}`,
      description: `$${amount.toLocaleString()} gift on ${donation.date ?? "unknown date"} — no acknowledgment sent yet.`,
      donorId: donor.id,
      donorName: donor.display_name ?? undefined,
      amount,
    })
  }

  // 2. AT-RISK DONORS — compute scores for top donors and flag those declining
  // Fetch donations for top 100 donors for scoring
  const topDonorIds = donors
    .filter((d) => Number(d.total_lifetime_value ?? 0) > 0)
    .slice(0, 100)
    .map((d) => d.id)

  if (topDonorIds.length > 0) {
    const { data: allDonations } = await supabase
      .from("donations")
      .select("donor_id,amount,date")
      .eq("org_id", auth.orgId)
      .in("donor_id", topDonorIds)
      .order("date", { ascending: true })

    // Group donations by donor
    for (const d of allDonations ?? []) {
      const list = donationsByDonor.get(d.donor_id) ?? []
      list.push({ amount: d.amount, date: d.date })
      donationsByDonor.set(d.donor_id, list)
    }

    // Score each and find at-risk
    for (const donor of donors.slice(0, 100)) {
      const donations = donationsByDonor.get(donor.id) ?? []
      const interactions = interactionsByDonor.get(donor.id) ?? []
      const ltv = Number(donor.total_lifetime_value ?? 0)

      if (ltv <= 0) continue

      const score = computeDonorHealthScore({
        lastDonationDate: donor.last_donation_date ?? null,
        firstDonationDate: donations.length > 0 ? (donations[0].date as string | null) : null,
        totalLifetimeValue: ltv,
        donations,
        interactions,
      })

      // Flag at-risk donors (score < 40, with meaningful history)
      if (score.score < 40 && donations.length >= 2 && ltv >= 100) {
        const lifecycle = getDonorLifecycleStatus(donor)

        // Don't flag donors already marked as Lost — they need a different approach
        if (lifecycle.status === "Lost") continue

        actions.push({
          id: `risk-${donor.id}`,
          type: "at_risk",
          priority: ltv >= 1000 ? "high" : "medium",
          title: `${donor.display_name ?? "Donor"} may be lapsing`,
          description: `Health score ${score.score}/100 (${score.label}). ${lifecycle.status} donor with $${ltv.toLocaleString()} lifetime giving. ${score.trend === "declining" ? "Giving trend is declining." : "No recent activity."}`,
          donorId: donor.id,
          donorName: donor.display_name ?? undefined,
          amount: ltv,
        })
      }
    }
  }

  // 3. RE-ENGAGE — donors who gave last year but not this year
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
    .toISOString()
    .slice(0, 10)
  const lastYearStart = new Date(new Date().getFullYear() - 1, 0, 1)
    .toISOString()
    .slice(0, 10)

  const reEngageCandidates = donors.filter((d) => {
    const lastDate = d.last_donation_date
    return (
      lastDate &&
      lastDate >= lastYearStart &&
      lastDate < yearStart &&
      Number(d.total_lifetime_value ?? 0) >= 200
    )
  })

  if (reEngageCandidates.length > 0) {
    const totalAmount = reEngageCandidates.reduce(
      (s, d) => s + Number(d.total_lifetime_value ?? 0),
      0
    )
    actions.push({
      id: "re-engage-batch",
      type: "re_engage",
      priority: "medium",
      title: `${reEngageCandidates.length} donors gave last year but not yet this year`,
      description: `Combined lifetime giving of $${totalAmount.toLocaleString()}. Consider a personal outreach or re-engagement campaign.`,
      amount: totalAmount,
    })
  }

  // 4. PIPELINE — opportunities closing soon
  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const closingSoon = opportunities.filter(
    (o) => o.expected_date && o.expected_date <= thirtyDaysOut
  )

  if (closingSoon.length > 0) {
    const totalPipeline = closingSoon.reduce(
      (s, o) => s + Number(o.amount ?? 0),
      0
    )
    actions.push({
      id: "pipeline-closing",
      type: "pipeline",
      priority: totalPipeline >= 5000 ? "high" : "medium",
      title: `${closingSoon.length} pipeline ${closingSoon.length === 1 ? "opportunity" : "opportunities"} closing this month`,
      description: `Total potential: $${totalPipeline.toLocaleString()}. Review and advance these opportunities.`,
      amount: totalPipeline,
    })
  }

  // 5. OVERDUE TASKS
  const today = new Date().toISOString().slice(0, 10)
  const overdue = overdueTasks.filter(
    (t) => t.date && t.date < today
  )

  for (const task of overdue.slice(0, 3)) {
    const donor = task.donor_id ? donorMap.get(task.donor_id) : null
    actions.push({
      id: `task-${task.id}`,
      type: "task_overdue",
      priority: "medium",
      title: task.subject || task.content || "Overdue task",
      description: `Due ${task.date ?? "unknown"}${donor ? ` for ${donor.display_name ?? "donor"}` : ""}. Mark complete or reschedule.`,
      donorId: donor?.id,
      donorName: donor?.display_name ?? undefined,
    })
  }

  // Sort: high priority first, then medium, then low
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return NextResponse.json({ actions: actions.slice(0, 10) })
}
