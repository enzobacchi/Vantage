/**
 * Shared column catalog for donor-based reports (CRM + route reports).
 * Keeping this in one place means the save dialog, the server CSV
 * generator, and the reports view all agree on column ids, labels, and groupings.
 */

export type ReportColumnId =
  | "first_name"
  | "last_name"
  | "display_name"
  | "email"
  | "phone"
  | "street_address"
  | "city"
  | "state"
  | "zip"
  | "mailing_street"
  | "mailing_city"
  | "mailing_state"
  | "mailing_zip"
  | "lifetime_value"
  | "donation_date"
  | "last_gift_date"
  | "last_gift_amount"

export const REPORT_COLUMN_GROUPS = [
  {
    title: "Identity",
    columns: [
      { id: "first_name", label: "First Name" },
      { id: "last_name", label: "Last Name" },
      { id: "display_name", label: "Display Name" },
      { id: "email", label: "Email" },
      { id: "phone", label: "Phone" },
    ],
  },
  {
    title: "Physical Address",
    columns: [
      { id: "street_address", label: "Street" },
      { id: "city", label: "City" },
      { id: "state", label: "State" },
      { id: "zip", label: "Zip" },
    ],
  },
  {
    title: "Mailing Address",
    columns: [
      { id: "mailing_street", label: "Mailing Street" },
      { id: "mailing_city", label: "Mailing City" },
      { id: "mailing_state", label: "Mailing State" },
      { id: "mailing_zip", label: "Mailing Zip" },
    ],
  },
  {
    title: "Giving History",
    columns: [
      { id: "lifetime_value", label: "Donation Amount" },
      { id: "donation_date", label: "Donation Date" },
      { id: "last_gift_date", label: "Last Gift Date" },
      { id: "last_gift_amount", label: "Last Gift Amount" },
    ],
  },
] as const

export const REPORT_COLUMN_LABELS: Record<string, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  display_name: "Display Name",
  email: "Email",
  phone: "Phone",
  street_address: "Street",
  city: "City",
  state: "State",
  zip: "Zip",
  mailing_street: "Mailing Street",
  mailing_city: "Mailing City",
  mailing_state: "Mailing State",
  mailing_zip: "Mailing Zip",
  lifetime_value: "Lifetime Value",
  donation_date: "Donation Date",
  last_gift_date: "Last Gift Date",
  last_gift_amount: "Last Gift Amount",
}

export const ALL_REPORT_COLUMNS: string[] = REPORT_COLUMN_GROUPS.flatMap((g) =>
  g.columns.map((c) => c.id)
)

export const DEFAULT_REPORT_COLUMNS: string[] = [
  "first_name",
  "last_name",
  "email",
  "lifetime_value",
]
