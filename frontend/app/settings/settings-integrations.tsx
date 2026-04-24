"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, AlertTriangle, FileSpreadsheet, Link2, Mail } from "lucide-react"
import { toast } from "sonner"

import { resetOnboarding } from "@/app/actions/onboarding"
import { CSVImportWizard } from "@/components/import/csv-import-wizard"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
type GmailStatus = { connected: boolean; email?: string; needsReauth?: boolean }
type SyncState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: Record<string, unknown> }
  | { status: "error"; message: string }

export function SettingsIntegrations() {
  const [qbStatus, setQbStatus] = React.useState<QBStatus>({ connected: false })
  const [gmailStatus, setGmailStatus] = React.useState<GmailStatus>({ connected: false })
  const [gmailDisconnecting, setGmailDisconnecting] = React.useState(false)
  const [syncState, setSyncState] = React.useState<SyncState>({ status: "idle" })
  const [resettingTour, setResettingTour] = React.useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const qbError = searchParams.get("qb_error")
  const gmailError = searchParams.get("gmail_error")

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

  const fetchGmailStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/status")
      const data = (await res.json()) as { connected?: boolean; email?: string; needsReauth?: boolean }
      setGmailStatus({
        connected: !!data?.connected,
        email: data?.email,
        needsReauth: data?.needsReauth,
      })
    } catch {
      setGmailStatus({ connected: false })
    }
  }, [])

  React.useEffect(() => {
    fetchStatus()
    fetchGmailStatus()
  }, [fetchStatus, fetchGmailStatus])

  // Toast on Gmail connect/error callback params
  const gmailToastShown = React.useRef(false)
  React.useEffect(() => {
    if (gmailToastShown.current) return
    if (searchParams.get("gmail") === "connected") {
      gmailToastShown.current = true
      toast.success("Gmail connected", {
        description: "You can now send donor emails from your Gmail account.",
      })
      fetchGmailStatus()
    } else if (gmailError) {
      gmailToastShown.current = true
      toast.error("Gmail connection failed", { description: gmailError })
    }
  }, [searchParams, gmailError, fetchGmailStatus])

  async function handleReopenTour() {
    setResettingTour(true)
    try {
      const res = await resetOnboarding()
      if (!res.success) {
        toast.error(res.error ?? "Could not reopen the tour.")
        return
      }
      toast.success("Reopening the tour…")
      router.push("/dashboard")
      router.refresh()
    } finally {
      setResettingTour(false)
    }
  }

  async function handleGmailDisconnect() {
    setGmailDisconnecting(true)
    try {
      const res = await fetch("/api/gmail/disconnect", { method: "POST" })
      if (!res.ok) {
        const text = await res.text()
        toast.error("Failed to disconnect Gmail", { description: text })
        return
      }
      setGmailStatus({ connected: false })
      toast.success("Gmail disconnected")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Disconnect failed"
      toast.error("Failed to disconnect Gmail", { description: msg })
    } finally {
      setGmailDisconnecting(false)
    }
  }

  // Handle QB OAuth callback params: show toast and auto-trigger full sync
  const autoSyncTriggered = React.useRef(false)
  React.useEffect(() => {
    const qb = searchParams.get("qb")
    const realmId = searchParams.get("realmId")
    if (qb === "connected" && realmId && !autoSyncTriggered.current) {
      autoSyncTriggered.current = true
      toast.success("Connected to QuickBooks", {
        description: "Starting initial data sync...",
      })
      setQbStatus((prev) => ({ ...prev, connected: true, realmId }))
      // Auto-trigger a full sync so the user sees their data immediately
      runSync({ full: true })
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const d = data as {
        usedRealmId?: string
        realmId?: string
        syncMode?: string
        recordsProcessed?: number
        donorsSkippedLimit?: number
        capReached?: boolean
        planMaxDonors?: number
      }
      const usedRealmId = d?.usedRealmId ?? d?.realmId
      if (usedRealmId) setQbStatus((prev) => ({ ...prev, connected: true, realmId: usedRealmId }))
      if (d.capReached && (d.donorsSkippedLimit ?? 0) > 0) {
        toast.warning(
          `Imported up to your ${d.planMaxDonors?.toLocaleString()} donor cap. ${d.donorsSkippedLimit?.toLocaleString()} donors not synced — upgrade to import the rest.`,
          { duration: 10_000 }
        )
      } else if (d.syncMode === "full") {
        toast.success("Historical Sync Complete.")
      } else {
        const count = d.recordsProcessed
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
            <Link2 className="size-5" strokeWidth={1.5} />
            QuickBooks
          </CardTitle>
          <CardDescription>
            Sync donor financial data and transactions from QuickBooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {qbError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm dark:border-destructive/40 dark:bg-destructive/10">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.5} />
              <div className="flex-1 text-destructive">
                <p className="font-medium">QuickBooks connection failed</p>
                <p className="mt-0.5 text-xs opacity-80">{qbError}</p>
                <p className="mt-1.5 text-xs opacity-70">
                  Ensure that <code className="rounded bg-destructive/10 px-1">{typeof window !== "undefined" ? window.location.origin : ""}/api/quickbooks/callback</code> is registered as a Redirect URI in your Intuit Developer Console.
                </p>
              </div>
            </div>
          )}
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
                  <AlertTriangle className="mr-2 size-4" strokeWidth={1.5} />
                  Resync All Donor Data (Historical)
                </>
              )}
            </Button>
          </div>

          {syncState.status === "loading" && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Spinner className="size-4" />
                <span>
                  Syncing donors from QuickBooks — this can take up to a minute for large accounts.
                </span>
              </div>
            </div>
          )}
          {syncState.status === "error" && (
            <p className="text-sm text-destructive">{syncState.message}</p>
          )}
          {syncState.status === "success" && syncState.data != null && (() => {
            const d = syncState.data as {
              donorsUpserted?: number
              donorsSkippedLimit?: number
              capReached?: boolean
              planMaxDonors?: number
            }
            const isAtCeiling = d.planMaxDonors === 10_000
            return (
              <>
                {d.capReached && (d.donorsSkippedLimit ?? 0) > 0 && (
                  <Alert>
                    <AlertCircle className="size-4" strokeWidth={1.5} />
                    <AlertDescription>
                      <strong>
                        {(d.donorsSkippedLimit ?? 0).toLocaleString()} donors not synced.
                      </strong>{" "}
                      Your plan is capped at{" "}
                      {(d.planMaxDonors ?? 0).toLocaleString()} donors.{" "}
                      {isAtCeiling ? (
                        <a
                          href="mailto:efbacchiocchi@gmail.com?subject=Vantage%20Enterprise%20inquiry"
                          className="underline"
                        >
                          Contact us
                        </a>
                      ) : (
                        <Link href="/settings?tab=billing" className="underline">
                          Upgrade
                        </Link>
                      )}{" "}
                      to sync the rest.
                    </AlertDescription>
                  </Alert>
                )}
                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    View last sync response
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted/50 p-3 text-xs">
                    {JSON.stringify(syncState.data, null, 2)}
                  </pre>
                </details>
              </>
            )
          })()}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" strokeWidth={1.5} />
            Gmail
          </CardTitle>
          <CardDescription>
            Send donor emails from your own Gmail account so replies return to your inbox and recipients see your ministry as the sender.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            Vantage can <strong>send email as you</strong>. Vantage cannot read, delete, or search your inbox.
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted font-semibold text-sm">
                <Mail className="size-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Gmail</span>
                  {gmailStatus.needsReauth ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <span className="size-2 rounded-full bg-amber-500" />
                      Reconnect required
                    </span>
                  ) : (
                    <span
                      className={gmailStatus.connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`size-2 rounded-full ${
                            gmailStatus.connected ? "bg-emerald-500" : "bg-gray-400 dark:bg-gray-500"
                          }`}
                        />
                        {gmailStatus.connected ? "Connected" : "Not connected"}
                      </span>
                    </span>
                  )}
                </div>
                {gmailStatus.connected && gmailStatus.email && (
                  <p className="text-xs text-muted-foreground mt-0.5">{gmailStatus.email}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {gmailStatus.connected && !gmailStatus.needsReauth ? (
              <Button
                variant="outline"
                onClick={handleGmailDisconnect}
                disabled={gmailDisconnecting}
              >
                {gmailDisconnecting ? (
                  <>
                    <Spinner className="mr-2 size-4" />
                    Disconnecting…
                  </>
                ) : (
                  "Disconnect"
                )}
              </Button>
            ) : (
              <Button asChild>
                <Link href="/api/gmail/auth">
                  {gmailStatus.needsReauth ? "Reconnect Gmail" : "Connect Gmail"}
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" strokeWidth={1.5} />
            CSV Import
          </CardTitle>
          <CardDescription>
            Upload a CSV file to import donors and donations into your CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CSVImportWizard />
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Onboarding tour</CardTitle>
          <CardDescription>
            Replay the welcome walkthrough — plan details, data security,
            import steps, and example AI prompts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleReopenTour}
            disabled={resettingTour}
          >
            {resettingTour ? (
              <>
                <Spinner className="mr-2 size-4" />
                Reopening…
              </>
            ) : (
              "Re-open onboarding tour"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
