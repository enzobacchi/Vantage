"use client"

import * as React from "react"
import { AlertCircle, X, ArrowRight } from "lucide-react"

/**
 * App-wide banner shown when the org's QuickBooks connection has broken
 * (Intuit revoked the grant, subscription lapsed, etc.). Mirrors
 * UsageAlertBanner: fetches connection status on mount and renders a thin
 * critical bar under the header until the user reconnects.
 *
 * Dismissal is session-only (in-memory, not persisted) — a broken sync is
 * important enough that it should resurface on the next load until actually
 * fixed. The flag clears server-side after the next successful sync.
 */
export function QuickBooksReconnectBanner() {
  const [needsReconnect, setNeedsReconnect] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch("/api/quickbooks/status")
        if (!res.ok) return
        const data = (await res.json()) as { needsReconnect?: boolean }
        if (!cancelled) setNeedsReconnect(!!data?.needsReconnect)
      } catch {
        // Status isn't critical for rendering — fail silently.
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  if (!needsReconnect || dismissed) return null

  return (
    <div className="flex items-center gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive dark:bg-destructive/20">
      <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} />
      <span className="flex-1">
        QuickBooks disconnected — new donations and donors have stopped importing. Reconnect to resume syncing.
      </span>
      <a
        href="/api/quickbooks/auth"
        className="inline-flex items-center gap-1 whitespace-nowrap font-medium underline underline-offset-2 hover:no-underline"
      >
        Reconnect QuickBooks <ArrowRight className="size-3.5" strokeWidth={1.5} />
      </a>
      <button
        onClick={() => setDismissed(true)}
        className="ml-1 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
        aria-label="Dismiss"
      >
        <X className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  )
}
