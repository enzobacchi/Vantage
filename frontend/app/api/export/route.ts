import { NextRequest } from "next/server"
import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { toCsv } from "@/lib/csv"

const VALID_TYPES = ["donors", "donations", "interactions"] as const
type ExportType = (typeof VALID_TYPES)[number]

/**
 * GET /api/export?type=donors|donations|interactions
 *
 * Exports org-scoped data as CSV for GDPR data portability.
 * Requires authentication and scopes all queries by org_id.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const type = request.nextUrl.searchParams.get("type") as ExportType | null
  if (!type || !VALID_TYPES.includes(type)) {
    return Response.json(
      { error: "Invalid export type. Must be one of: donors, donations, interactions" },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  try {
    const { csv, filename } = await buildExport(supabase, auth.orgId, type)

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return Response.json({ error: "Export failed. Please try again later." }, { status: 500 })
  }
}

async function buildExport(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  type: ExportType
): Promise<{ csv: string; filename: string }> {
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
      "id, display_name, first_name, last_name, email, phone, donor_type, billing_address, city, state, zip, mailing_address, mailing_city, mailing_state, mailing_zip, total_lifetime_value, last_donation_date, last_donation_amount, notes"
    )
    .eq("org_id", orgId)
    .order("display_name")

  if (error) throw error

  const headers = [
    "ID",
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
  ]

  const rows = (data ?? []).map((d) => [
    d.id,
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

  if (donorIds.length === 0) {
    const headers = ["ID", "Donor ID", "Type", "Direction", "Subject", "Content", "Date", "Status", "Created At"]
    return { csv: toCsv(headers, []), filename: `vantage-interactions-${timestamp}.csv` }
  }

  const { data, error } = await supabase
    .from("interactions")
    .select("id, donor_id, type, direction, subject, content, date, status, created_at")
    .in("donor_id", donorIds)
    .order("date", { ascending: false })

  if (error) throw error

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

