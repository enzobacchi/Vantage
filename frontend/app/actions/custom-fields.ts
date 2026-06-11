"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUserOrg, getCurrentUserOrgWithRole } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export type CustomFieldType = "text" | "number" | "date" | "select"

export type CustomFieldDefinition = {
  id: string
  key: string
  label: string
  field_type: CustomFieldType
  options: string[] | null
  sort_order: number
}

const VALID_FIELD_TYPES: CustomFieldType[] = ["text", "number", "date", "select"]
const MAX_FIELDS_PER_ORG = 20

/** Slugify a label into a stable machine key: "Mailing List?" -> "mailing_list" */
function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
}

function canManage(role: string): boolean {
  return role === "owner" || role === "admin"
}

export async function getCustomFieldDefinitions(): Promise<CustomFieldDefinition[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("custom_field_definitions")
    .select("id, key, label, field_type, options, sort_order")
    .eq("org_id", org.orgId)
    .order("sort_order")
    .order("created_at")

  if (error) return []
  return (data ?? []) as CustomFieldDefinition[]
}

export async function createCustomFieldDefinition(input: {
  label: string
  field_type: CustomFieldType
  options?: string[]
}): Promise<CustomFieldDefinition> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) throw new Error("Unauthorized")
  if (!canManage(ctx.role)) throw new Error("Only owners and admins can manage custom fields.")

  const label = input.label.trim()
  if (!label) throw new Error("Label is required")
  if (!VALID_FIELD_TYPES.includes(input.field_type)) throw new Error("Invalid field type")

  const key = slugifyKey(label)
  if (!key) throw new Error("Label must contain letters or numbers")

  const options =
    input.field_type === "select"
      ? (input.options ?? []).map((o) => o.trim()).filter(Boolean)
      : null
  if (input.field_type === "select" && (!options || options.length === 0)) {
    throw new Error("Select fields need at least one option")
  }

  const supabase = createAdminClient()

  const { count } = await supabase
    .from("custom_field_definitions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
  if ((count ?? 0) >= MAX_FIELDS_PER_ORG) {
    throw new Error(`You can define up to ${MAX_FIELDS_PER_ORG} custom fields.`)
  }

  const { data, error } = await supabase
    .from("custom_field_definitions")
    .insert({
      org_id: ctx.orgId,
      key,
      label,
      field_type: input.field_type,
      options,
      sort_order: count ?? 0,
    })
    .select("id, key, label, field_type, options, sort_order")
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new Error(`A field with the key "${key}" already exists.`)
    }
    throw new Error(error.message)
  }

  revalidatePath("/settings")
  return data as CustomFieldDefinition
}

export async function updateCustomFieldDefinition(
  id: string,
  input: { label?: string; options?: string[] }
): Promise<void> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) throw new Error("Unauthorized")
  if (!canManage(ctx.role)) throw new Error("Only owners and admins can manage custom fields.")

  const updates: Record<string, unknown> = {}
  if (input.label !== undefined) {
    const label = input.label.trim()
    if (!label) throw new Error("Label is required")
    // Key stays stable on rename — donor values are keyed by it.
    updates.label = label
  }
  if (input.options !== undefined) {
    updates.options = input.options.map((o) => o.trim()).filter(Boolean)
  }
  if (Object.keys(updates).length === 0) return

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("custom_field_definitions")
    .update(updates)
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) throw new Error(error.message)
  revalidatePath("/settings")
}

/**
 * Delete a definition. Donor values under the key are left in place (harmless
 * orphans in JSONB) — they vanish from every surface because rendering is
 * definition-driven.
 */
export async function deleteCustomFieldDefinition(id: string): Promise<void> {
  const ctx = await getCurrentUserOrgWithRole()
  if (!ctx) throw new Error("Unauthorized")
  if (!canManage(ctx.role)) throw new Error("Only owners and admins can manage custom fields.")

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("custom_field_definitions")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) throw new Error(error.message)
  revalidatePath("/settings")
}

/**
 * Update a donor's custom field values (merge, not replace). Values are
 * validated against the org's definitions: unknown keys rejected, select
 * values must be one of the defined options, numbers must parse.
 */
export async function updateDonorCustomFields(
  donorId: string,
  values: Record<string, string | null>
): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const definitions = await getCustomFieldDefinitions()
  const byKey = new Map(definitions.map((d) => [d.key, d]))

  const cleaned: Record<string, string | null> = {}
  for (const [key, raw] of Object.entries(values)) {
    const def = byKey.get(key)
    if (!def) throw new Error(`Unknown custom field: ${key}`)
    const value = raw?.trim() || null
    if (value === null) {
      cleaned[key] = null
      continue
    }
    if (def.field_type === "number" && isNaN(Number(value))) {
      throw new Error(`${def.label} must be a number`)
    }
    if (def.field_type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`${def.label} must be a date (YYYY-MM-DD)`)
    }
    if (def.field_type === "select" && def.options && !def.options.includes(value)) {
      throw new Error(`${def.label} must be one of: ${def.options.join(", ")}`)
    }
    cleaned[key] = value
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("custom_fields")
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError || !donor) throw new Error("Donor not found.")

  const merged = {
    ...((donor.custom_fields as Record<string, unknown>) ?? {}),
    ...cleaned,
  }
  // Drop nulls so cleared fields don't linger as explicit null entries
  for (const k of Object.keys(merged)) {
    if (merged[k] === null) delete merged[k]
  }

  const { error } = await supabase
    .from("donors")
    .update({ custom_fields: merged })
    .eq("id", donorId)
    .eq("org_id", org.orgId)

  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/donors/${donorId}`)
}
