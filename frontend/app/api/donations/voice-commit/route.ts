import { NextResponse } from "next/server"

import { createDonor } from "@/app/actions/donors"
import {
  bulkCreateDonations,
  type BulkCreateDonationRow,
} from "@/app/actions/donations"
import { requireUserOrg } from "@/lib/auth"
import {
  VOICE_PAYMENT_METHODS,
  type VoiceCommitResponse,
  type VoiceCommitRow,
} from "@/lib/donations/voice-schema"
import { transcribeEnabledServer } from "@/lib/features"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 60

const PAYMENT_SET = new Set<string>(VOICE_PAYMENT_METHODS)
const DONOR_TYPES = ["individual", "corporate", "school", "church"] as const
type DonorType = (typeof DONOR_TYPES)[number]

function isDonorType(v: unknown): v is DonorType {
  return typeof v === "string" && (DONOR_TYPES as readonly string[]).includes(v)
}

function validateRow(
  r: unknown
): { ok: true; row: VoiceCommitRow } | { ok: false; message: string } {
  if (!r || typeof r !== "object") return { ok: false, message: "Invalid row" }
  const row = r as Record<string, unknown>
  const donorId = typeof row.donor_id === "string" && row.donor_id ? row.donor_id : null

  let createNew: VoiceCommitRow["create_new"] = null
  if (row.create_new && typeof row.create_new === "object") {
    const cn = row.create_new as Record<string, unknown>
    const displayName = typeof cn.display_name === "string" ? cn.display_name.trim() : ""
    if (!displayName) return { ok: false, message: "New donor needs a display name" }
    createNew = {
      display_name: displayName,
      email: typeof cn.email === "string" && cn.email.trim() ? cn.email.trim() : null,
      donor_type: isDonorType(cn.donor_type) ? cn.donor_type : "individual",
    }
  }
  if (!donorId && !createNew) {
    return { ok: false, message: "Row needs an existing donor or new-donor info" }
  }
  const amount = Number(row.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Invalid amount" }
  const date = typeof row.date === "string" ? row.date.trim() : ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Invalid date" }
  const paymentMethod = typeof row.payment_method === "string" ? row.payment_method : ""
  if (!PAYMENT_SET.has(paymentMethod)) return { ok: false, message: "Invalid payment method" }

  return {
    ok: true,
    row: {
      donor_id: donorId,
      create_new: createNew,
      amount,
      date,
      payment_method: paymentMethod as VoiceCommitRow["payment_method"],
      category_id: typeof row.category_id === "string" && row.category_id ? row.category_id : null,
      campaign_id: typeof row.campaign_id === "string" && row.campaign_id ? row.campaign_id : null,
      fund_id: typeof row.fund_id === "string" && row.fund_id ? row.fund_id : null,
      memo: typeof row.memo === "string" && row.memo.trim() ? row.memo.trim() : null,
    },
  }
}

export async function POST(request: Request) {
  if (!transcribeEnabledServer) {
    return NextResponse.json(
      { error: "Voice donation entry isn't enabled for this organization." },
      { status: 503 }
    )
  }

  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(`voice-commit:${auth.orgId}`, 30, 60_000)
  if (rl.limited) return rateLimitResponse(rl.retryAfterMs)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const rawRows = (body as { rows?: unknown[] })?.rows
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return NextResponse.json({ error: "No rows submitted" }, { status: 400 })
  }
  if (rawRows.length > 100) {
    return NextResponse.json(
      { error: "Cannot submit more than 100 rows at once" },
      { status: 400 }
    )
  }

  const errors: Array<{ index: number; message: string }> = []
  const validated: Array<{ index: number; row: VoiceCommitRow }> = []
  for (let i = 0; i < rawRows.length; i++) {
    const v = validateRow(rawRows[i])
    if (!v.ok) errors.push({ index: i, message: v.message })
    else validated.push({ index: i, row: v.row })
  }

  // ── Phase 1: resolve any "create_new" donor rows first ────────────
  // Each call hits the donor cap individually; partial success is acceptable.
  const toInsert: BulkCreateDonationRow[] = []
  const indexMapping: number[] = [] // maps toInsert position → original row index
  for (const v of validated) {
    if (v.row.donor_id) {
      toInsert.push({
        donor_id: v.row.donor_id,
        amount: v.row.amount,
        date: v.row.date,
        payment_method: v.row.payment_method,
        category_id: v.row.category_id,
        campaign_id: v.row.campaign_id,
        fund_id: v.row.fund_id,
        memo: v.row.memo,
      })
      indexMapping.push(v.index)
      continue
    }
    if (!v.row.create_new) continue
    try {
      const { id } = await createDonor({
        display_name: v.row.create_new.display_name,
        email: v.row.create_new.email,
        donor_type: v.row.create_new.donor_type,
      })
      toInsert.push({
        donor_id: id,
        amount: v.row.amount,
        date: v.row.date,
        payment_method: v.row.payment_method,
        category_id: v.row.category_id,
        campaign_id: v.row.campaign_id,
        fund_id: v.row.fund_id,
        memo: v.row.memo,
      })
      indexMapping.push(v.index)
    } catch (e) {
      errors.push({
        index: v.index,
        message: e instanceof Error ? e.message : "Failed to create donor",
      })
    }
  }

  // ── Phase 2: bulk-insert donations ────────────────────────────────
  let created = 0
  if (toInsert.length > 0) {
    try {
      const result = await bulkCreateDonations(toInsert, "voice")
      created = result.created
      // Translate bulk errors back to original row indices.
      for (const err of result.errors) {
        errors.push({
          index: indexMapping[err.index] ?? err.index,
          message: err.message,
        })
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Bulk insert failed" },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ created, errors } satisfies VoiceCommitResponse)
}
