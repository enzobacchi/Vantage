import { NextResponse } from "next/server"

import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { computeDonorHealthScore, type DonorHealthScore } from "@/lib/donor-score"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const { id: donorId } = await params
  const supabase = createAdminClient()

  // Fetch donor basics
  const { data: donor, error: donorErr } = await supabase
    .from("donors")
    .select("id,total_lifetime_value,last_donation_date")
    .eq("id", donorId)
    .eq("org_id", auth.orgId)
    .single()

  if (donorErr || !donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 })
  }

  // Fetch donations and interactions in parallel
  const [donationsRes, interactionsRes] = await Promise.all([
    supabase
      .from("donations")
      .select("amount,date")
      .eq("donor_id", donorId)
      .eq("org_id", auth.orgId)
      .order("date", { ascending: true }),
    supabase
      .from("interactions")
      .select("date,type")
      .eq("donor_id", donorId)
      .order("date", { ascending: true }),
  ])

  const donations = donationsRes.data ?? []
  const interactions = interactionsRes.data ?? []

  const toNum = (v: unknown): number => {
    if (v == null) return 0
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : 0
  }

  // Derive first donation date from donation history
  const firstDonationDate = donations.length > 0 ? donations[0].date : null

  const result: DonorHealthScore = computeDonorHealthScore({
    lastDonationDate: donor.last_donation_date ?? null,
    firstDonationDate,
    totalLifetimeValue: toNum(donor.total_lifetime_value),
    donations: donations.map((d) => ({
      amount: d.amount,
      date: d.date,
    })),
    interactions: interactions.map((i) => ({
      date: i.date,
      type: i.type,
    })),
  })

  return NextResponse.json(result)
}
