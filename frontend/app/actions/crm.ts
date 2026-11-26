"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/supabase/fetch-all"
import { getCurrentUserOrg } from "@/lib/auth"
import { logTouchpoint } from "@/lib/meter/log-touchpoint"
import type { Interaction } from "@/types/database"

type InteractionInsert = {
  donor_id: string
  type: "email" | "call" | "meeting" | "note" | "task"
  /** Touchpoint kind ("coffee", "text", …). When given, it decides the type and points. */
  kind?: string
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

  const result = await logTouchpoint(createAdminClient(), {
    orgId: org.orgId,
    userId: org.userId,
    donorId: data.donor_id,
    kind: data.kind,
    type: data.type,
    direction: data.direction,
    subject: data.subject,
    content: data.content,
    date: data.date,
    status: data.status,
  })
  if (!result.ok) {
    throw new Error(result.message)
  }

  revalidatePath("/dashboard")
  return result.interaction
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

export type TaskWithDonor = Interaction & {
  donor_name: string | null
}

/**
 * Fetch all tasks across all donors for the current org.
 * Optionally filter by status. Returns newest first.
 */
export async function getAllTasks(
  status?: "pending" | "completed" | "all"
): Promise<TaskWithDonor[]> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()

  // Scope by org through the donor join rather than listing donor ids: a
  // large org's id list overflows the request, and the result came back empty.
  type TaskRow = Interaction & { donors: { display_name: string | null } | null }
  const rows = await fetchAllRows<TaskRow>((from, to) => {
    let query = supabase
      .from("interactions")
      .select("*, donors!inner(display_name, org_id)")
      .eq("type", "task")
      .eq("donors.org_id", org.orgId)
    if (status && status !== "all") query = query.eq("status", status)
    return query
      .order("date", { ascending: false })
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: TaskRow[] | null; error: { message: string } | null }>
  })

  return rows.map(({ donors, ...task }) => ({
    ...(task as Interaction),
    donor_name: donors?.display_name ?? null,
  }))
}
