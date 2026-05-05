"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { stripSqlArtifacts } from "@/lib/utils"
import type { SavedReportListItem } from "@/app/api/reports/route"

type SharingMode = "with-me" | "by-me"

type SharingColumnOptions = {
  mode: SharingMode
  onView: (reportId: string) => void
  onDownloadCsv: (report: SavedReportListItem) => void | Promise<void>
  onEdit?: (reportId: string) => void | Promise<void>
  onRename?: (reportId: string, title: string) => void
  onDelete?: (reportId: string) => void | Promise<void>
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  })
}

function recordsCell(report: SavedReportListItem) {
  if (typeof report.records_count === "number") {
    return `${report.records_count.toLocaleString()} rows`
  }
  return (report.type ?? "").toUpperCase() === "CSV" ? "CSV" : "—"
}

function SharedWithCell({ report }: { report: SavedReportListItem }) {
  if (report.visibility === "shared") {
    return (
      <Badge variant="secondary" className="font-normal text-xs">
        Organization
      </Badge>
    )
  }
  if (report.visibility === "specific") {
    const shares = report.shares ?? []
    if (shares.length === 0) {
      return <span className="text-muted-foreground">—</span>
    }
    const names = shares
      .map((s) => s.full_name?.trim() || "Unknown")
      .filter(Boolean)
    const shown = names.slice(0, 3).join(", ")
    const overflow = names.length > 3 ? ` +${names.length - 3} more` : ""
    return (
      <span className="text-muted-foreground">
        {shown}
        {overflow}
      </span>
    )
  }
  return <span className="text-muted-foreground">—</span>
}

function VisibilityBadge({ visibility }: { visibility: string | null }) {
  if (visibility === "shared") {
    return (
      <Badge variant="secondary" className="font-normal text-xs">
        Organization
      </Badge>
    )
  }
  if (visibility === "specific") {
    return (
      <Badge variant="secondary" className="font-normal text-xs">
        Specific People
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="font-normal text-xs">
      Private
    </Badge>
  )
}

export function createSharingColumns(
  options: SharingColumnOptions
): ColumnDef<SavedReportListItem>[] {
  const { mode, onView, onDownloadCsv, onEdit, onRename, onDelete } = options

  const titleColumn: ColumnDef<SavedReportListItem> = {
    accessorKey: "title",
    header: "Report Name",
    cell: ({ row }) => (
      <span className="font-medium">
        {stripSqlArtifacts(row.original.title)}
      </span>
    ),
  }

  const dateColumn: ColumnDef<SavedReportListItem> = {
    accessorKey: "created_at",
    header: "Date Generated",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.created_at)}
      </span>
    ),
  }

  const recordsColumn: ColumnDef<SavedReportListItem> = {
    accessorKey: "records_count",
    header: "Records",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{recordsCell(row.original)}</span>
    ),
    enableSorting: false,
  }

  if (mode === "with-me") {
    return [
      titleColumn,
      {
        id: "shared_by",
        header: "Shared by",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.creator?.full_name?.trim() || "Unknown"}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "visibility",
        header: "Sharing",
        cell: ({ row }) => <VisibilityBadge visibility={row.original.visibility} />,
        enableSorting: false,
      },
      dateColumn,
      recordsColumn,
      {
        id: "actions",
        cell: ({ row }) => {
          const report = row.original
          const isCsv = (report.type ?? "").toUpperCase() === "CSV"
          return (
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-[50px] text-right"
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="data-[state=open]:bg-muted text-muted-foreground flex size-8 ml-auto"
                    size="icon"
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => onView(report.id)}>
                    View report
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!isCsv}
                    onClick={() => void onDownloadCsv(report)}
                  >
                    Download CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
    ]
  }

  return [
    titleColumn,
    {
      id: "shared_with",
      header: "Shared with",
      cell: ({ row }) => <SharedWithCell report={row.original} />,
      enableSorting: false,
    },
    dateColumn,
    recordsColumn,
    {
      id: "actions",
      cell: ({ row }) => {
        const report = row.original
        const isCsv = (report.type ?? "").toUpperCase() === "CSV"
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[50px] text-right"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="data-[state=open]:bg-muted text-muted-foreground flex size-8 ml-auto"
                  size="icon"
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onView(report.id)}>
                  View report
                </DropdownMenuItem>
                {onEdit && (
                  <DropdownMenuItem onClick={() => void onEdit(report.id)}>
                    Edit report
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={!isCsv}
                  onClick={() => void onDownloadCsv(report)}
                >
                  Download CSV
                </DropdownMenuItem>
                {onRename && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onRename(report.id, report.title)}
                    >
                      Rename
                    </DropdownMenuItem>
                  </>
                )}
                {onDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="text-destructive focus:text-destructive"
                      >
                        Delete
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete report?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove &quot;
                          {stripSqlArtifacts(report.title)}&quot;.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void onDelete(report.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
