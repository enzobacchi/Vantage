"use client"

import * as React from "react"
import Link from "next/link"
import { Gauge, Plus } from "lucide-react"

import { getReadyToAsk, type ReadyToAskResult } from "@/app/actions/meter"
import { getOrgAssignees, type OrgAssignee } from "@/app/actions/team"
import { MiniMeter } from "@/components/meter/mini-meter"
import { useQuickLog } from "@/components/touchpoints/quick-log"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const COLLAPSED_ROWS = 6

/**
 * Home card: donors with points on their touchpoint meter, fullest first, so
 * the fundraiser can see who is ready for an ask and who is getting close.
 * Filterable by relationship owner. Renders nothing when the feature is off.
 */
export function ReadyToAskCard() {
  const quickLog = useQuickLog()
  const [owner, setOwner] = React.useState("all")
  const [result, setResult] = React.useState<ReadyToAskResult | null>(null)
  const [people, setPeople] = React.useState<OrgAssignee[]>([])
  const [expanded, setExpanded] = React.useState(false)

  const quickLogVersion = quickLog.version
  const load = React.useCallback(() => {
    let cancelled = false
    getReadyToAsk(owner)
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .catch(() => {
        if (!cancelled) setResult({ enabled: true, ok: false, error: "Could not load the list." })
      })
    return () => {
      cancelled = true
    }
  }, [owner])

  React.useEffect(() => load(), [load, quickLogVersion])

  React.useEffect(() => {
    let cancelled = false
    getOrgAssignees()
      .then((list) => {
        if (!cancelled) setPeople(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (result && !result.enabled) return null

  const peopleById = new Map(people.map((p) => [p.user_id, p.name]))
  const rows = result?.enabled && result.ok ? result.rows : []
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS)

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-muted-foreground" strokeWidth={1.5} />
          Ready to ask
          {result?.enabled && result.ok && result.readyCount > 0 && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:text-emerald-950">
              {result.readyCount}
            </Badge>
          )}
        </CardTitle>
        <Select
          value={owner}
          onValueChange={(value) => {
            setOwner(value)
            setExpanded(false)
          }}
        >
          <SelectTrigger className="h-8 w-44 text-sm" aria-label="Relationship owner">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone&apos;s donors</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.user_id} value={p.user_id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!result && (
          <div className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        )}

        {result?.enabled && !result.ok && (
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{result.error}</span>
            <Button variant="outline" size="sm" onClick={() => load()}>
              Try again
            </Button>
          </div>
        )}

        {result?.enabled && result.ok && rows.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {owner === "all"
                ? "No meters have points yet. Log a call, a coffee or a visit and the donor will show up here."
                : "No donors with points on their meter for this owner."}
            </p>
            {owner === "all" && (
              <Button size="sm" onClick={() => quickLog.open()}>
                <Plus className="mr-1.5 size-3.5" />
                Log touchpoint
              </Button>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <ul className="divide-y">
              {shown.map((row) => (
                <li key={row.donorId} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/donors/${row.donorId}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.ready ? "Ready for an ask" : `${row.percent}% of the way`}
                      {" · "}
                      {row.assignedTo ? (peopleById.get(row.assignedTo) ?? "Assigned") : "Unassigned"}
                    </p>
                  </div>
                  <MiniMeter fill={row.fill} capacity={row.capacity} ready={row.ready} className="shrink-0" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground"
                    aria-label={`Log a touchpoint for ${row.name}`}
                    onClick={() => quickLog.open({ id: row.donorId, name: row.name })}
                  >
                    <Plus className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {rows.length > COLLAPSED_ROWS && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-muted-foreground"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded
                  ? "Show fewer"
                  : `Show all ${result?.enabled && result.ok && result.total > rows.length ? `${rows.length} of ${result.total}` : rows.length}`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
