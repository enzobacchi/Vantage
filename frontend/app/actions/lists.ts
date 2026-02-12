"use server"

import { getCurrentUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export type SavedListFilters = {
  status?: string
  state?: string
  sortBy?: string
  searchQuery?: string
}

export type SavedList = {
  id: string
  name: string
  icon: string
  filters: SavedListFilters
  created_at: string
}

export async function getSmartLists(): Promise<SavedList[]> {
  const org = await getCurrentUserOrg()
  if (!org) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("saved_lists")
    .select("id,name,icon,filters,created_at")
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: false })

  if (error) return []
  return (data ?? []).map((row) => ({
    id: row.id,
    name: String(row.name ?? ""),
    icon: String(row.icon ?? "list"),
    filters: (row.filters as SavedListFilters) ?? {},
    created_at: String(row.created_at ?? ""),
  }))
}

export async function saveSmartList(
  name: string,
  filters: SavedListFilters
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const org = await getCurrentUserOrg()
  if (!org) {
    return { ok: false, error: "Unauthorized" }
  }

  const trimmed = name.trim()
  if (!trimmed) {
    return { ok: false, error: "List name is required" }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("saved_lists")
    .insert({
      organization_id: org.orgId,
      name: trimmed,
      icon: "list",
      filters: filters ?? {},
    })
    .select("id")
    .single()

  if (error) {
    return { ok: false, error: error.message }
  }
  if (!data?.id) {
    return { ok: false, error: "Failed to create list" }
  }
  return { ok: true, id: data.id }
}

export async function deleteSmartList(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await getCurrentUserOrg()
  if (!org) {
    return { ok: false, error: "Unauthorized" }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("saved_lists")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.orgId)

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
