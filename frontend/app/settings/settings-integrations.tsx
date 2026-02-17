"use client"

import * as React from "react"
import Link from "next/link"
import { IconAlertTriangle, IconLink } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

type QBStatus = { connected: boolean; realmId?: string }
type SyncState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: Record<string, unknown> }
  | { status: "error"; message: string }

export function SettingsIntegrations() {
  const [qbStatus, setQbStatus] = React.useState<QBStatus>({ connected: false })
  const [syncState, setSyncState] = React.useState<SyncState>({ status: "idle" })

  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/quickbooks/status")
      const data = (await res.json()) as { connected?: boolean; realmId?: string }
      setQbStatus({
        connected: !!data?.connected,
        realmId: data?.realmId ?? undefined,
      })
    } catch {
      setQbStatus({ connected: false })
    }
  }, [])

  React.useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  async function runSync(opts?: { full?: boolean }) {
    try {
      setSyncState({ status: "loading" })
      const params = new URLSearchParams()
      if (qbStatus.realmId) params.set("realmId", qbStatus.realmId)
      if (opts?.full) params.set("full", "true")
      const url = `/api/sync${params.toString() ? `?${params.toString()}` : ""}`
      const res = await fetch(url)
      const text = await res.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = text
      }

      if (!res.ok) {
        const msg =
          typeof data === "object" && data && "error" in data
            ? String((data as { error?: string }).error)
            : `Sync failed (HTTP ${res.status}).`
        setSyncState({ status: "error", message: msg })
        if (res.status === 401 || /reconnect|connect quickbooks first|no connected quickbooks organization/i.test(String(msg))) {
          await fetchStatus()
        }
        return
      }

      setSyncState({ status: "success", data: data as Record<string, unknown> })
      const d = data as { usedRealmId?: string; realmId?: string }
      const usedRealmId = d?.usedRealmId ?? d?.realmId
      if (usedRealmId) setQbStatus((prev) => ({ ...prev, connected: true, realmId: usedRealmId }))
      if ((data as { syncMode?: string })?.syncMode === "full") {
        toast.success("Historical Sync Complete.")
      } else {
        const count = (data as { recordsProcessed?: number })?.recordsProcessed
        const msg =
          typeof count === "number"
            ? `Quick update: ${count.toLocaleString()} record(s) processed`
            : "Sync completed"
        toast.success(msg)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed."
      setSyncState({ status: "error", message: msg })
      toast.error("Sync failed", { description: msg })
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium">Integrations</h3>
        <p className="text-[0.8rem] text-muted-foreground mt-0.5">
          Connect and manage external services for donor data and sync.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconLink className="size-5" />
            QuickBooks
          </CardTitle>
          <CardDescription>
            Sync donor financial data and transactions from QuickBooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted font-semibold text-sm">
                QB
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">QuickBooks</span>
                  <span
                    className={qbStatus.connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}
                    title={qbStatus.connected ? "Connected" : "Disconnected"}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`size-2 rounded-full ${
                          qbStatus.connected ? "bg-emerald-500" : "bg-gray-400 dark:bg-gray-500"
                        }`}
                      />
                      {qbStatus.connected ? "Connected" : "Disconnected"}
                    </span>
                  </span>
                </div>
                {qbStatus.connected && qbStatus.realmId && (
                  <p className="text-xs text-muted-foreground mt-0.5">Realm ID: {qbStatus.realmId}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/api/quickbooks/auth">Connect to QuickBooks</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => runSync()}
              disabled={syncState.status === "loading"}
            >
              {syncState.status === "loading" ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Syncing…
                </>
              ) : (
                "Sync donors now"
              )}
            </Button>
          </div>

          <div className="space-y-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Re-fetch all donor data from QuickBooks (fixes $0 lifetime value and updates addresses/names). This can take a few minutes.
            </p>
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => runSync({ full: true })}
              disabled={syncState.status === "loading"}
              title="Full historical resync"
            >
              {syncState.status === "loading" ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Resync in progress…
                </>
              ) : (
                <>
                  <IconAlertTriangle className="mr-2 size-4" />
                  Resync All Donor Data (Historical)
                </>
              )}
            </Button>
          </div>

          {syncState.status === "error" && (
            <p className="text-sm text-destructive">{syncState.message}</p>
          )}
          {syncState.status === "success" && syncState.data != null && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                View last sync response
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted/50 p-3 text-xs">
                {JSON.stringify(syncState.data, null, 2)}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
