import type { createAdminClient } from "@/lib/supabase/admin"

/**
 * Recalculate a donor's aggregate totals from their donations.
 * Updates total_lifetime_value, last_donation_date, and last_donation_amount.
 */
export async function recalcDonorTotals(
  supabase: ReturnType<typeof createAdminClient>,
  donorId: string
): Promise<void> {
  const { data: donations } = await supabase
    .from("donations")
    .select("amount,date")
    .eq("donor_id", donorId)
    .order("date", { ascending: false })

  const rows = (donations ?? []) as { amount: number; date: string }[]
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const last = rows[0]

  await supabase
    .from("donors")
    .update({
      total_lifetime_value: total,
      last_donation_date: last?.date ?? null,
      last_donation_amount: last?.amount ?? null,
    })
    .eq("id", donorId)
}
