"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { IconCheck, IconSettings } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

type SyncSuccessData = {
  syncMode?: "full" | "incremental"
  recordsProcessed?: number
  [key: string]: unknown
}

type QBStatus = { connected: boolean; realmId?: string }

export function SettingsView() {
  const searchParams = useSearchParams()
  const urlQb = searchParams.get("qb") ?? undefined
  const urlRealmId = searchParams.get("realmId") ?? undefined

  const [qbStatus, setQbStatus] = React.useState<QBStatus>({ connected: false })
  const [syncState, setSyncState] = React.useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: SyncSuccessData }
    | { status: "error"; message: string }
  >({ status: "idle" })

  const fetchConnectionStatus = React.useCallback(async () => {
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
    fetchConnectionStatus()
  }, [fetchConnectionStatus])

  React.useEffect(() => {
    if (urlQb === "connected" && urlRealmId) {
      toast.success("Connected to QuickBooks", {
        description: `Realm ID: ${urlRealmId}`,
      })
      setQbStatus((prev) => ({ ...prev, connected: true, realmId: urlRealmId }))
    }
  }, [urlQb, urlRealmId])

  async function runSync() {
    try {
      setSyncState({ status: "loading" })
      const realmId = qbStatus.realmId ?? urlRealmId
      const url = realmId
        ? `/api/sync?realmId=${encodeURIComponent(realmId)}`
        : "/api/sync"
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
          await fetchConnectionStatus()
        }
        return
      }

      setSyncState({ status: "success", data: data as SyncSuccessData })
      const d = data as SyncSuccessData & { usedRealmId?: string }
      const usedRealmId = d?.usedRealmId ?? d?.realmId
      const currentRealmId = qbStatus.realmId ?? urlRealmId
      if (usedRealmId && usedRealmId !== currentRealmId) {
        setQbStatus((prev) => ({ ...prev, connected: true, realmId: usedRealmId }))
      }
      const mode = d?.syncMode === "incremental" ? "Quick update" : "Full sync"
      const count = typeof d?.recordsProcessed === "number" ? d.recordsProcessed : d?.donorsUpserted
      const msg =
        typeof count === "number"
          ? `${mode}: ${count.toLocaleString()} record${count === 1 ? "" : "s"} processed`
          : "Sync completed"
      toast.success(msg)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed."
      setSyncState({ status: "error", message: msg })
      toast.error("Sync failed", { description: msg })
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center gap-2">
        <IconSettings className="size-5 text-slate-900 dark:text-white" />
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs">
          <CardHeader>
            <CardTitle>Data Integrations</CardTitle>
            <CardDescription>
              Connect your favorite tools to sync donor data automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted font-semibold text-sm">
                  QB
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">QuickBooks</p>
                    {qbStatus.connected ? (
                      <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white gap-1">
                        <IconCheck className="size-3" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not connected</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sync donor financial data and transactions
                  </p>
                  {qbStatus.connected && (qbStatus.realmId ?? urlRealmId) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Realm ID: {qbStatus.realmId ?? urlRealmId}
                    </p>
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
                onClick={runSync}
                disabled={syncState.status === "loading"}
              >
                {syncState.status === "loading" ? "Syncing…" : "Sync donors now"}
              </Button>
            </div>
            {syncState.status === "error" && (
              <p className="text-sm text-destructive">{syncState.message}</p>
            )}
            {syncState.status === "success" && syncState.data != null && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {syncState.data.syncMode === "incremental"
                    ? `Quick update: ${Number(syncState.data.recordsProcessed ?? 0).toLocaleString()} record(s) processed.`
                    : `Full sync: ${Number(syncState.data.recordsProcessed ?? 0).toLocaleString()} record(s) processed.`}
                </p>
                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    View raw response
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted/50 p-3 text-xs">
                    {JSON.stringify(syncState.data, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Configure how you receive alerts and updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Alerts</p>
                <p className="text-sm text-muted-foreground">
                  Receive vital system alerts
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
