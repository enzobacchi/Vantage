"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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

export type SavedReport = {
  id: string
  title: string
  query: string | null
  type?: string | null
  summary?: string | null
  records_count?: number | null
  created_at: string
  folder_id?: string | null
  visibility?: string | null
  created_by_user_id?: string | null
}

export function createReportColumns(options: {
  onView: (reportId: string) => void
  onDownloadCsv: (report: SavedReport) => void | Promise<void>
  onMove: (reportId: string) => void
  onRename: (reportId: string, title: string) => void
  onDelete: (reportId: string) => void | Promise<void>
}): ColumnDef<SavedReport>[] {
  const { onView, onDownloadCsv, onMove, onRename, onDelete } = options

  return [
    {
      id: "select",
      header: ({ table }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "title",
      header: "Report Name",
      cell: ({ row }) => (
        <span className="font-medium">
          {stripSqlArtifacts(row.original.title)}
        </span>
      ),
    },
    {
      accessorKey: "visibility",
      header: "Sharing",
      cell: ({ row }) => {
        const vis = row.original.visibility
        if (vis === "shared") return <Badge variant="secondary" className="font-normal text-xs">Organization</Badge>
        if (vis === "specific") return <Badge variant="secondary" className="font-normal text-xs">Specific People</Badge>
        return <Badge variant="outline" className="font-normal text-xs">Private</Badge>
      },
      enableSorting: false,
    },
    {
      accessorKey: "created_at",
      header: "Date Generated",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {new Date(row.original.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "2-digit",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      accessorKey: "records_count",
      header: "Records",
      cell: ({ row }) => {
        const report = row.original
        return (
          <span className="text-muted-foreground">
            {typeof report.records_count === "number"
              ? `${report.records_count.toLocaleString()} rows`
              : (report.type ?? "").toUpperCase() === "CSV"
                ? "CSV"
                : "—"}
          </span>
        )
      },
      enableSorting: false,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const report = row.original
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
                  disabled={(report.type ?? "").toUpperCase() !== "CSV"}
                  onClick={() => void onDownloadCsv(report)}
                >
                  Download CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onMove(report.id)
                  }}
                >
                  Move to Folder
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onRename(report.id, report.title)}
                >
                  Rename
                </DropdownMenuItem>
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
