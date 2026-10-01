/**
 * Platform integration health checks.
 *
 * Verifies the external integrations the product silently depends on
 * (Stripe key validity, Resend key validity, per-org QuickBooks connections)
 * and emails an alert to FEEDBACK_EMAIL_TO when something is broken — so
 * outages are caught by the daily cron instead of by a customer.
 *
 * Runs piggybacked on /api/cron/sync (Vercel Hobby caps cron jobs, so no
 * dedicated health cron). All checks are read-only and cheap.
 */

import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { getStripe } from "@/lib/stripe"
import { systemAlertEmailHtml } from "@/lib/email-templates"

const FROM_EMAIL = "Vantage <notifications@vantagedonorai.com>"

/** A sync older than this is treated as silently dead (daily cron ⇒ ≥2 missed runs). */
export const STALE_SYNC_HOURS = 48

export type HealthCheck = { ok: boolean; detail: string }

export type QbOrgIssue = {
  orgId: string
  orgName: string
  reason: "needs_reconnect" | "stale_sync"
  detail: string
}

export type HealthReport = {
  healthy: boolean
  stripe: HealthCheck
  resend: HealthCheck
  quickbooks: HealthCheck & { issues: QbOrgIssue[] }
}

export type QbOrgHealthInput = {
  id: string
  name: string
  qb_needs_reconnect: boolean
  qb_last_sync_error: string | null
  last_synced_at: string | null
}

/**
 * Classify one QB-connected org's connection health. Pure — exported for tests.
 * A null last_synced_at is not flagged (org may have connected moments ago and
 * we have no connected-at timestamp to age it against).
 */
export function classifyQbOrgHealth(
  org: QbOrgHealthInput,
  nowMs: number
): QbOrgIssue | null {
  if (org.qb_needs_reconnect) {
    return {
      orgId: org.id,
      orgName: org.name,
      reason: "needs_reconnect",
      detail: org.qb_last_sync_error
        ? `QuickBooks needs reconnect: ${org.qb_last_sync_error}`
        : "QuickBooks needs reconnect",
    }
  }

  if (org.last_synced_at) {
    const ageMs = nowMs - new Date(org.last_synced_at).getTime()
    if (ageMs > STALE_SYNC_HOURS * 60 * 60 * 1000) {
      const ageHours = Math.floor(ageMs / (60 * 60 * 1000))
      return {
        orgId: org.id,
        orgName: org.name,
        reason: "stale_sync",
        detail: `Last successful QuickBooks sync was ${ageHours}h ago`,
      }
    }
  }

  return null
}

async function checkStripe(): Promise<HealthCheck> {
  try {
    // Cheapest authenticated call — proves the secret key is valid and live.
    await getStripe().balance.retrieve()
    return { ok: true, detail: "Stripe key valid" }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return { ok: false, detail: `Stripe check failed: ${message}` }
  }
}

async function checkResend(): Promise<HealthCheck> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, detail: "RESEND_API_KEY not set" }
  }
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    })
    if (!res.ok) {
      return { ok: false, detail: `Resend API rejected the key (HTTP ${res.status})` }
    }
    return { ok: true, detail: "Resend key valid" }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return { ok: false, detail: `Resend check failed: ${message}` }
  }
}

async function checkQuickBooks(): Promise<HealthCheck & { issues: QbOrgIssue[] }> {
  const admin = createAdminClient()
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, qb_needs_reconnect, qb_last_sync_error, last_synced_at")
    .not("qb_realm_id", "is", null)

  if (error) {
    return { ok: false, detail: `Failed to query QB orgs: ${error.message}`, issues: [] }
  }

  const now = Date.now()
  const issues = (orgs ?? [])
    .map((org) => classifyQbOrgHealth(org, now))
    .filter((issue): issue is QbOrgIssue => issue !== null)

  return {
    ok: issues.length === 0,
    detail:
      issues.length === 0
        ? `All ${orgs?.length ?? 0} QB-connected org(s) healthy`
        : `${issues.length} of ${orgs?.length ?? 0} QB-connected org(s) broken`,
    issues,
  }
}

export async function runHealthChecks(): Promise<HealthReport> {
  const [stripe, resend, quickbooks] = await Promise.all([
    checkStripe(),
    checkResend(),
    checkQuickBooks(),
  ])
  return {
    healthy: stripe.ok && resend.ok && quickbooks.ok,
    stripe,
    resend,
    quickbooks,
  }
}

/**
 * Email a failure summary to FEEDBACK_EMAIL_TO. Best-effort: if Resend itself
 * is the broken integration this send will likely fail too — there is no
 * secondary alert channel, so we still try and log the outcome.
 */
export async function sendHealthAlert(report: HealthReport): Promise<boolean> {
  const toEmail = process.env.FEEDBACK_EMAIL_TO?.trim()
  const apiKey = process.env.RESEND_API_KEY
  if (!toEmail || !apiKey) {
    console.warn("[Health] Cannot send alert: FEEDBACK_EMAIL_TO or RESEND_API_KEY not set")
    return false
  }

  const problems: string[] = []
  if (!report.stripe.ok) problems.push(report.stripe.detail)
  if (!report.resend.ok) problems.push(report.resend.detail)
  for (const issue of report.quickbooks.issues) {
    problems.push(`${issue.orgName}: ${issue.detail}`)
  }
  if (problems.length === 0) return false

  const subject = `Vantage health check: ${problems.length} issue(s) detected`
  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      html: systemAlertEmailHtml(subject, problems.join(" • ")),
    })
    return true
  } catch (e) {
    console.error("[Health] Failed to send alert email:", e)
    return false
  }
}
