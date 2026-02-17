"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"
import type { Interaction } from "@/types/database"

type InteractionInsert = {
  donor_id: string
  type: "email" | "call" | "meeting" | "note" | "task"
  direction?: "inbound" | "outbound" | null
  subject?: string | null
  content: string
  date?: string
  status?: "pending" | "completed" | null
}

/**
 * Fetch all interactions for a donor, newest first. Scoped to current user's org.
 */
export async function getDonorInteractions(donorId: string): Promise<Interaction[]> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id")
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError || !donor) {
    return []
  }

  const { data, error } = await supabase
    .from("interactions")
    .select("*")
    .eq("donor_id", donorId)
    .order("date", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Interaction[]
}

/**
 * Insert a new interaction (call, email, meeting, note, or task). Scoped to current user's org.
 */
export async function logInteraction(data: InteractionInsert): Promise<Interaction> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id")
    .eq("id", data.donor_id)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError || !donor) {
    throw new Error("Donor not found.")
  }

  const row = {
    donor_id: data.donor_id,
    type: data.type,
    direction: data.direction ?? null,
    subject: data.subject ?? null,
    content: data.content ?? "",
    date: data.date ?? new Date().toISOString(),
    status: data.type === "task" ? (data.status ?? "pending") : null,
  }

  const { data: inserted, error } = await supabase
    .from("interactions")
    .insert(row)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard")
  return inserted as Interaction
}

/**
 * Toggle a task's status (pending <-> completed). Scoped to current user's org.
 */
export async function toggleTaskStatus(id: string): Promise<Interaction> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data: existing, error: fetchError } = await supabase
    .from("interactions")
    .select("id, donor_id, status")
    .eq("id", id)
    .eq("type", "task")
    .single()

  if (fetchError || !existing) {
    throw new Error("Task not found.")
  }

  const { data: donor } = await supabase
    .from("donors")
    .select("id")
    .eq("id", existing.donor_id)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (!donor) {
    throw new Error("Unauthorized")
  }

  const newStatus = existing.status === "completed" ? "pending" : "completed"
  const { data: updated, error } = await supabase
    .from("interactions")
    .update({ status: newStatus })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/dashboard")
  return updated as Interaction
}
