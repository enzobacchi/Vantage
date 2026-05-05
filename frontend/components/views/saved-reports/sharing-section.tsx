"use client"

import * as React from "react"
import { Inbox, Users } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DataTable } from "@/components/ui/data-table"
import { createSharingColumns } from "@/components/views/saved-reports/sharing-columns"
import type { SavedReportListItem } from "@/app/api/reports/route"

type SharingSectionProps = {
  reports: SavedReportListItem[]
  currentUserId: string | null
  loading: boolean
  error: string | null
  onView: (reportId: string) => void
  onDownloadCsv: (report: SavedReportListItem) => void | Promise<void>
  onEdit: (reportId: string) => void | Promise<void>
  onRename: (reportId: string, title: string) => void
  onDelete: (reportId: string) => void | Promise<void>
}

export function SharingSection({
  reports,
  currentUserId,
  loading,
  error,
  onView,
  onDownloadCsv,
  onEdit,
  onRename,
  onDelete,
}: SharingSectionProps) {
  const sharedWithMe = React.useMemo(() => {
    if (!currentUserId) return []
    return reports.filter((r) => {
      if (!r.created_by_user_id) return false
      if (r.created_by_user_id === currentUserId) return false
      if (r.visibility === "shared") return true
      if (r.visibility === "specific") {
        return (r.shares ?? []).some((s) => s.user_id === currentUserId)
      }
      return false
    })
  }, [reports, currentUserId])

  const sharedByMe = React.useMemo(() => {
    if (!currentUserId) return []
    return reports.filter(
      (r) =>
        r.created_by_user_id === currentUserId &&
        (r.visibility === "shared" || r.visibility === "specific")
    )
  }, [reports, currentUserId])

  const withMeColumns = React.useMemo(
    () =>
      createSharingColumns({
        mode: "with-me",
        onView,
        onDownloadCsv,
      }),
    [onView, onDownloadCsv]
  )

  const byMeColumns = React.useMemo(
    () =>
      createSharingColumns({
        mode: "by-me",
        onView,
        onDownloadCsv,
        onEdit,
        onRename,
        onDelete,
      }),
    [onView, onDownloadCsv, onEdit, onRename, onDelete]
  )

  return (
    <div className="space-y-6">
      <Card className="w-full flex flex-col">
        <CardHeader>
          <CardTitle>Shared with me</CardTitle>
          <CardDescription>
            Reports your teammates have shared with you or your organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          {!loading && !error && sharedWithMe.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-6" strokeWidth={1.5} />}
              title="No reports shared with you"
              description="When teammates share reports with you or your organization, they'll show up here."
            />
          ) : (
            <div className="overflow-auto rounded-lg border max-h-[60vh] min-h-0">
              <DataTable<SavedReportListItem, unknown>
                columns={withMeColumns}
                data={sharedWithMe}
                loading={loading}
                error={error}
                emptyMessage="No reports shared with you."
                onRowClick={(row) => onView(row.id)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="w-full flex flex-col">
        <CardHeader>
          <CardTitle>Shared by me</CardTitle>
          <CardDescription>
            Reports you&apos;ve shared with the organization or specific
            teammates.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          {!loading && !error && sharedByMe.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" strokeWidth={1.5} />}
              title="You haven't shared any reports"
              description="Reports you set to Organization or Specific People will appear here."
            />
          ) : (
            <div className="overflow-auto rounded-lg border max-h-[60vh] min-h-0">
              <DataTable<SavedReportListItem, unknown>
                columns={byMeColumns}
                data={sharedByMe}
                loading={loading}
                error={error}
                emptyMessage="You haven't shared any reports yet."
                onRowClick={(row) => onView(row.id)}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
    </div>
  )
}
