"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"
import type { ReceiptTemplateCategory } from "@/types/database"

export type ReceiptTemplate = {
  id: string
  category: ReceiptTemplateCategory
  name: string
  subject: string
  body: string
  sort_order: number
  created_at: string
  updated_at: string
}

export async function listReceiptTemplates(): Promise<ReceiptTemplate[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("receipt_templates")
    .select("id, category, name, subject, body, sort_order, created_at, updated_at")
    .eq("org_id", org.orgId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) return []
  return data ?? []
}

export async function createReceiptTemplate(input: {
  category: ReceiptTemplateCategory
  name: string
  subject: string
  body: string
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const org = await getCurrentUserOrg()
  if (!org) return { success: false, error: "Unauthorized" }

  const supabase = createAdminClient()

  // Get current max sort_order for the org
  const { data: last } = await supabase
    .from("receipt_templates")
    .select("sort_order")
    .eq("org_id", org.orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (last?.sort_order ?? 0) + 1

  const { data, error } = await supabase
    .from("receipt_templates")
    .insert({
      org_id: org.orgId,
      category: input.category,
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
      sort_order,
    })
    .select("id")
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, id: data?.id }
}

export async function updateReceiptTemplate(
  id: string,
  input: {
    category?: ReceiptTemplateCategory
    name?: string
    subject?: string
    body?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const org = await getCurrentUserOrg()
  if (!org) return { success: false, error: "Unauthorized" }

  const supabase = createAdminClient()

  // Verify template belongs to org
  const { data: existing } = await supabase
    .from("receipt_templates")
    .select("id")
    .eq("id", id)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (!existing) return { success: false, error: "Template not found" }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.category !== undefined) update.category = input.category
  if (input.name !== undefined) update.name = input.name.trim()
  if (input.subject !== undefined) update.subject = input.subject.trim()
  if (input.body !== undefined) update.body = input.body.trim()

  const { error } = await supabase
    .from("receipt_templates")
    .update(update)
    .eq("id", id)
    .eq("org_id", org.orgId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteReceiptTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const org = await getCurrentUserOrg()
  if (!org) return { success: false, error: "Unauthorized" }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("receipt_templates")
    .delete()
    .eq("id", id)
    .eq("org_id", org.orgId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
