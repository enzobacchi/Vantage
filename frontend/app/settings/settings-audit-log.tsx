"use client"

import * as React from "react"
import { ClipboardList, Filter } from "lucide-react"
import { getAuditLogs, type AuditLogEntry } from "@/app/actions/audit"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const ENTITY_TYPES = [
  { value: "all", label: "All types" },
  { value: "donor", label: "Donors" },
  { value: "donation", label: "Donations" },
  { value: "interaction", label: "Interactions" },
  { value: "tag", label: "Tags" },
  { value: "opportunity", label: "Pipeline" },
  { value: "settings", label: "Settings" },
  { value: "team", label: "Team" },
]

const ACTION_BADGE_COLORS: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  bulk_delete: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  merge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  bulk_tag: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  export: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  email_send: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
}

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const PAGE_SIZE = 25

export function SettingsAuditLog() {
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [entityFilter, setEntityFilter] = React.useState("all")

  const load = React.useCallback(async (p: number, entity: string) => {
    setLoading(true)
    try {
      const result = await getAuditLogs({
        page: p,
        limit: PAGE_SIZE,
        entityType: entity === "all" ? undefined : entity,
      })
      setLogs(result.logs)
      setTotal(result.total)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load(page, entityFilter)
  }, [page, entityFilter, load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4 shrink-0" strokeWidth={1.5} />
            Activity Log
          </CardTitle>
          <CardDescription className="mt-1">
            Track all changes made across your organization. Owners and admins see all activity; members see only their own.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" strokeWidth={1.5} />
          <Select value={entityFilter} onValueChange={(v) => { setPage(0); setEntityFilter(v) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <ClipboardList className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-muted-foreground">No activity logged yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Actions like creating donors, sending emails, and updating settings will appear here.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ACTION_BADGE_COLORS[log.action] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {log.action.replace("_", " ")}
                      </span>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {log.entity_type}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{log.summary}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(log.created_at)}
                  </span>
                </li>
              ))}
            </ul>

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-1">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
