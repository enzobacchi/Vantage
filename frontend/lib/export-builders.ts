import { createAdminClient } from "@/lib/supabase/admin"
import { toCsv } from "@/lib/csv"

export const EXPORT_TYPES = ["donors", "donations", "interactions"] as const
export type ExportType = (typeof EXPORT_TYPES)[number]

export type BuiltExport = { csv: string; filename: string }

/**
 * Org-scoped CSV exports for GDPR data portability. Shared by the web
 * download route (GET /api/export) and the mobile email-export route
 * (POST /api/account/export).
 */
export async function buildExport(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  type: ExportType
): Promise<BuiltExport> {
  const timestamp = new Date().toISOString().slice(0, 10)

  switch (type) {
    case "donors":
      return buildDonorsExport(supabase, orgId, timestamp)
    case "donations":
      return buildDonationsExport(supabase, orgId, timestamp)
    case "interactions":
      return buildInteractionsExport(supabase, orgId, timestamp)
  }
}

async function buildDonorsExport(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  timestamp: string
) {
  const { data, error } = await supabase
    .from("donors")
    .select(
      "id, external_id, display_name, first_name, last_name, email, phone, donor_type, billing_address, city, state, zip, mailing_address, mailing_city, mailing_state, mailing_zip, total_lifetime_value, last_donation_date, last_donation_amount, notes, custom_fields"
    )
    .eq("org_id", orgId)
    .order("display_name")

  if (error) throw error

  // Org-defined custom fields get one column each, after the fixed columns
  const { data: fieldDefs } = await supabase
    .from("custom_field_definitions")
    .select("key, label")
    .eq("org_id", orgId)
    .order("sort_order")
  const customDefs = (fieldDefs ?? []) as Array<{ key: string; label: string }>

  const headers = [
    "ID",
    "External ID",
    "Display Name",
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    "Donor Type",
    "Billing Address",
    "City",
    "State",
    "ZIP",
    "Mailing Address",
    "Mailing City",
    "Mailing State",
    "Mailing ZIP",
    "Total Lifetime Value",
    "Last Donation Date",
    "Last Donation Amount",
    "Notes",
    ...customDefs.map((c) => c.label),
  ]

  const rows = (data ?? []).map((d) => [
    d.id,
    d.external_id,
    d.display_name,
    d.first_name,
    d.last_name,
    d.email,
    d.phone,
    d.donor_type,
    d.billing_address,
    d.city,
    d.state,
    d.zip,
    d.mailing_address,
    d.mailing_city,
    d.mailing_state,
    d.mailing_zip,
    d.total_lifetime_value,
    d.last_donation_date,
    d.last_donation_amount,
    d.notes,
    ...customDefs.map(
      (c) => ((d.custom_fields as Record<string, unknown>) ?? {})[c.key] ?? null
    ),
  ])

  return { csv: toCsv(headers, rows), filename: `vantage-donors-${timestamp}.csv` }
}

async function buildDonationsExport(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  timestamp: string
) {
  // Join donor display_name for readability
  const { data, error } = await supabase
    .from("donations")
    .select(
      "id, donor_id, amount, date, memo, payment_method, source, category_id, campaign_id, fund_id, acknowledgment_sent_at, created_at, donors!inner(display_name)"
    )
    .eq("org_id", orgId)
    .order("date", { ascending: false })

  if (error) throw error

  const headers = [
    "ID",
    "Donor ID",
    "Donor Name",
    "Amount",
    "Date",
    "Memo",
    "Payment Method",
    "Source",
    "Category ID",
    "Campaign ID",
    "Fund ID",
    "Acknowledgment Sent At",
    "Created At",
  ]

  const rows = (data ?? []).map((d) => {
    const donorName =
      d.donors && typeof d.donors === "object" && "display_name" in d.donors
        ? (d.donors as { display_name: string | null }).display_name
        : null
    return [
      d.id,
      d.donor_id,
      donorName,
      d.amount,
      d.date,
      d.memo,
      d.payment_method,
      d.source,
      d.category_id,
      d.campaign_id,
      d.fund_id,
      d.acknowledgment_sent_at,
      d.created_at,
    ]
  })

  return { csv: toCsv(headers, rows), filename: `vantage-donations-${timestamp}.csv` }
}

async function buildInteractionsExport(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  timestamp: string
) {
  // Interactions are linked to donors, so join through donors
  const { data: donors } = await supabase
    .from("donors")
    .select("id")
    .eq("org_id", orgId)

  const donorIds = (donors ?? []).map((d) => d.id)

  const headers = [
    "ID",
    "Donor ID",
    "Type",
    "Direction",
    "Subject",
    "Content",
    "Date",
    "Status",
    "Created At",
  ]

  if (donorIds.length === 0) {
    return { csv: toCsv(headers, []), filename: `vantage-interactions-${timestamp}.csv` }
  }

  const { data, error } = await supabase
    .from("interactions")
    .select("id, donor_id, type, direction, subject, content, date, status, created_at")
    .in("donor_id", donorIds)
    .order("date", { ascending: false })

  if (error) throw error

  const rows = (data ?? []).map((i) => [
    i.id,
    i.donor_id,
    i.type,
    i.direction,
    i.subject,
    i.content,
    i.date,
    i.status,
    i.created_at,
  ])

  return { csv: toCsv(headers, rows), filename: `vantage-interactions-${timestamp}.csv` }
}
