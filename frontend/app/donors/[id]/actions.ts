"use server"

import { revalidatePath } from "next/cache"
import OpenAI from "openai"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

const EIGHTEEN_MONTHS_MS = 18 * 30 * 24 * 60 * 60 * 1000

function isActive(lastDonationDate: string | null): boolean {
  if (!lastDonationDate) return false
  const t = new Date(lastDonationDate).getTime()
  return Date.now() - t <= EIGHTEEN_MONTHS_MS
}

export type DonorProfileDonor = {
  id: string
  org_id: string
  display_name: string | null
  email: string | null
  phone: string | null
  billing_address: string | null
  city: string | null
  state: string | null
  zip: string | null
  total_lifetime_value: number | string | null
  last_donation_date: string | null
  notes: string | null
}

export type DonorProfileDonation = {
  id: string
  donor_id: string
  amount: number | string | null
  date: string | null
  memo: string | null
}

export type DonorProfileResult = {
  donor: DonorProfileDonor | null
  donations: DonorProfileDonation[]
}

/**
 * Fetch a single donor by ID and all related donations (ordered by date desc).
 * Scoped to current user's org; returns null donor if not found or wrong org (page will 404).
 */
export async function getDonorProfile(id: string): Promise<DonorProfileResult> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select(
      "id,org_id,display_name,email,phone,billing_address,city,state,zip,total_lifetime_value,last_donation_date,notes"
    )
    .eq("id", id)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError) {
    throw new Error(donorError.message)
  }

  if (!donor) {
    return { donor: null, donations: [] }
  }

  const { data: donations, error: donationsError } = await supabase
    .from("donations")
    .select("id,donor_id,amount,date,memo")
    .eq("donor_id", id)
    .order("date", { ascending: false })

  if (donationsError) {
    throw new Error(donationsError.message)
  }

  return {
    donor: donor as DonorProfileDonor,
    donations: (donations ?? []) as DonorProfileDonation[],
  }
}

/**
 * Update donor notes. Returns updated notes or throws. Scoped to current user's org.
 */
export async function updateDonorNotes(donorId: string, notes: string | null): Promise<string | null> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("donors")
    .update({ notes: notes ?? null })
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .select("notes")
    .single()

  if (error || !data) {
    throw new Error("Donor not found.")
  }

  return (data.notes as string | null) ?? null
}

/**
 * Generate a year-end thank-you letter for a donor using their giving data for the specified year.
 * Scoped to current user's org.
 */
export async function generateYearEndLetter(
  donorId: string,
  year: number
): Promise<string> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id,display_name")
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError || !donor) {
    throw new Error("Donor not found.")
  }

  const { data: donations, error: donationsError } = await supabase
    .from("donations")
    .select("amount,date")
    .eq("donor_id", donorId)
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`)

  if (donationsError) {
    throw new Error(donationsError.message)
  }

  const rows = donations ?? []
  let totalGiven = 0
  for (const r of rows) {
    const a = r.amount
    const n = a != null ? (typeof a === "number" ? a : Number(a)) : 0
    if (Number.isFinite(n)) totalGiven += n
  }
  const giftCount = rows.length

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY")
  }

  const donorName = donor.display_name ?? "Valued Donor"
  const systemPrompt = `You are a Director of Development for a non-profit. Write a warm, personal Year-End Tax Receipt/Thank You letter to [Donor Name]. Rules:

Acknowledge their total giving of $[Amount] in [Year].

Analyze their giving pattern:
- If they gave monthly (>10 times), thank them for being a "consistent monthly partner."
- If they gave once, thank them for their "special gift."
- If they gave $0, write a gentle "We missed you" note inviting them back.

Tone: Grateful, professional, but warm (Ministry style).

Output format: Markdown (Subject line + Body).`

  const userMessage = `Donor Name: ${donorName}
Year: ${year}
Total given in ${year}: $${totalGiven.toFixed(2)}
Number of gifts in ${year}: ${giftCount}

Write the year-end letter.`

  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  })

  const text = completion.choices[0]?.message?.content?.trim() ?? ""
  return text || "Unable to generate letter."
}

/**
 * Generate a short SMS draft for a donor. Active = gave in last 18 months. Scoped to current user's org.
 */
export async function generateTextDraft(donorId: string): Promise<string> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id,display_name,last_donation_date")
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError || !donor) {
    throw new Error("Donor not found.")
  }

  const donorName = donor.display_name ?? "Valued Donor"
  const active = isActive(donor.last_donation_date ?? null)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY")
  }

  const systemPrompt = `You are a helpful assistant for a non-profit fundraiser. Write a short, casual SMS (under 160 chars) to [Donor Name]. If they are 'Active' (gave < 18 months ago), thank them for their partnership. If 'Lapsed', say we miss them and are in the area. No hashtags. Output only the message text, nothing else.`

  const userMessage = `Donor Name: ${donorName}. Status: ${active ? "Active" : "Lapsed"}. Write the SMS.`

  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  })

  const text = completion.choices[0]?.message?.content?.trim() ?? ""
  return text || "Unable to generate text draft."
}

export type EmailDraft = { subject: string; body: string }

/**
 * Generate a warm email draft (subject + body, under 100 words). Scoped to current user's org.
 */
export async function generateEmailDraft(donorId: string): Promise<EmailDraft> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id,display_name")
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError || !donor) {
    throw new Error("Donor not found.")
  }

  const donorName = donor.display_name ?? "Valued Donor"

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY")
  }

  const systemPrompt = `You are a helpful assistant for a non-profit fundraiser. Write a warm, professional email to [Donor Name]. Output exactly two lines: first line "Subject: " followed by the subject; then a blank line; then the body. Keep body under 100 words. Focus on gratitude and connection.`

  const userMessage = `Donor Name: ${donorName}. Write the email with Subject line then body.`

  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ""
  let subject = "Thank you"
  let body = raw

  const subjectMatch = raw.match(/Subject:\s*(.+?)(?:\n|$)/i)
  if (subjectMatch) {
    subject = subjectMatch[1].trim()
    body = raw.replace(/Subject:\s*.+?(?:\n|$)/i, "").trim()
  }

  return { subject, body: body || "Unable to generate email body." }
}

/**
 * Log a call note for a donor. Inserts into donor_notes and revalidates the profile. Scoped to current user's org.
 */
export async function logCall(donorId: string, note: string): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) {
    throw new Error("Unauthorized")
  }

  const trimmed = note?.trim() ?? ""
  if (!trimmed) {
    throw new Error("Note cannot be empty.")
  }

  const supabase = createAdminClient()
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id")
    .eq("id", donorId)
    .eq("org_id", org.orgId)
    .maybeSingle()

  if (donorError || !donor) {
    throw new Error("Donor not found.")
  }

  const { error } = await supabase.from("donor_notes").insert({
    donor_id: donorId,
    note: trimmed,
  })

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath(`/donors/${donorId}`)
}

export type DonorNoteRow = {
  id: string
  donor_id: string
  note: string
  created_at: string
}

/**
 * Fetch activity log notes for a donor (newest first). Scoped to current user's org.
 */
export async function getDonorActivityNotes(donorId: string): Promise<DonorNoteRow[]> {
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
    .from("donor_notes")
    .select("id,donor_id,note,created_at")
    .eq("donor_id", donorId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as DonorNoteRow[]
}
