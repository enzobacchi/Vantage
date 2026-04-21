import { z } from "zod"

export const KNOWN_FIELDS = [
  "total_lifetime_value",
  "last_donation_date",
  "last_donation_amount",
  "gift_count",
  "first_donation_date",
  "city",
  "state",
  "zip",
  "payment_method",
  "tags",
  "lifecycle_status",
  "donation_activity",
] as const

export type KnownField = (typeof KNOWN_FIELDS)[number]

export const LIFECYCLE_STATUSES = ["New", "Active", "Lapsed", "Lost"] as const

export const NUMERIC_FIELDS = new Set<KnownField>([
  "total_lifetime_value",
  "last_donation_amount",
  "gift_count",
])

export const DATE_FIELDS = new Set<KnownField>([
  "last_donation_date",
  "first_donation_date",
])

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const filterRowSchema = z
  .object({
    id: z.string().optional(),
    field: z.enum(KNOWN_FIELDS),
    operator: z.string(),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
    value2: z.union([z.string(), z.number()]).optional(),
  })
  .superRefine((row, ctx) => {
    const { field, operator, value, value2 } = row

    if (field === "donation_activity") {
      if (operator !== "gave_between" && operator !== "no_gift_between") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "donation_activity must use operator gave_between or no_gift_between",
        })
        return
      }
      if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "donation_activity.value must be YYYY-MM-DD",
        })
      }
      if (typeof value2 !== "string" || !ISO_DATE_RE.test(value2)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "donation_activity.value2 must be YYYY-MM-DD",
        })
      }
      return
    }

    if (field === "lifecycle_status") {
      if (operator !== "eq") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lifecycle_status only supports operator 'eq'",
        })
      }
      const v = typeof value === "string" ? value : ""
      if (!(LIFECYCLE_STATUSES as readonly string[]).includes(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `lifecycle_status.value must be one of ${LIFECYCLE_STATUSES.join(", ")}`,
        })
      }
      return
    }

    if (field === "tags") {
      if (operator !== "in") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "tags must use operator 'in'",
        })
      }
      if (!Array.isArray(value) || value.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "tags.value must be a non-empty array of tag IDs",
        })
      }
      return
    }

    if (field === "payment_method") {
      if (operator !== "eq" || typeof value !== "string" || !value.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "payment_method requires operator 'eq' and a string value",
        })
      }
      return
    }

    if (NUMERIC_FIELDS.has(field)) {
      const NUM_OPS = new Set(["eq", "gt", "gte", "lt", "lte", "between"])
      if (!NUM_OPS.has(operator)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} supports operators ${[...NUM_OPS].join(", ")}`,
        })
      }
      if (typeof value !== "number" && Number.isNaN(Number(value))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field}.value must be numeric`,
        })
      }
      if (operator === "between" && value2 == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field}.between requires value2`,
        })
      }
      return
    }

    if (DATE_FIELDS.has(field)) {
      const DATE_OPS = new Set(["before", "after", "between", "gte", "lte"])
      if (!DATE_OPS.has(operator)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} supports operators ${[...DATE_OPS].join(", ")}`,
        })
      }
      if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field}.value must be YYYY-MM-DD`,
        })
      }
      if (operator === "between") {
        if (typeof value2 !== "string" || !ISO_DATE_RE.test(value2)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field}.between requires value2 as YYYY-MM-DD`,
          })
        }
      }
      return
    }

    if (field === "state") {
      if (operator !== "is_exactly" && operator !== "eq") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "state supports 'is_exactly' or 'eq'",
        })
      }
      return
    }

    if (field === "city" || field === "zip") {
      if (operator !== "contains" && operator !== "eq") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} supports 'contains' or 'eq'`,
        })
      }
    }
  })

export const filtersArraySchema = z.array(filterRowSchema).max(12)

export type ValidatedFilterRow = z.infer<typeof filterRowSchema>

export const REPORT_COLUMN_IDS = [
  "first_name",
  "last_name",
  "display_name",
  "email",
  "phone",
  "street_address",
  "city",
  "state",
  "zip",
  "mailing_street",
  "mailing_city",
  "mailing_state",
  "mailing_zip",
  "lifetime_value",
  "donation_date",
  "last_gift_date",
  "last_gift_amount",
] as const

export const DEFAULT_AI_COLUMNS: string[] = [
  "first_name",
  "last_name",
  "email",
  "lifetime_value",
  "last_gift_date",
]
