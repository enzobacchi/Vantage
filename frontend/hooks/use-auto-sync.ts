"use client"

import { useEffect } from "react"

const SESSION_KEY = "qb_auto_sync_done"

/**
 * Silently triggers a QuickBooks sync in the background when the user
 * opens the dashboard, but only once per browser session.
 * Requires QuickBooks to be connected for the org.
 */
export function useAutoSync() {
  useEffect(() => {
    // Only run once per browser session
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_KEY)) return

    async function attemptSync() {
      try {
        const statusRes = await fetch("/api/quickbooks/status")
        if (!statusRes.ok) return
        const status = (await statusRes.json()) as { connected?: boolean }
        if (!status?.connected) return

        // Mark done before fetch so concurrent navigations don't double-sync
        sessionStorage.setItem(SESSION_KEY, "1")

        // Fire-and-forget — we don't await or show a spinner
        fetch("/api/sync").catch(() => {
          // Silent failure: sync is best-effort on auto-trigger
          sessionStorage.removeItem(SESSION_KEY)
        })
      } catch {
        // Network errors are silently ignored for auto-sync
      }
    }

    attemptSync()
  }, [])
}
