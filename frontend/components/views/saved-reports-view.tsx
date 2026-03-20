"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { IconFileText, IconFolder, IconFolderPlus, IconFilter, IconUpload } from "@tabler/icons-react"
import { PanelLeft, PanelLeftClose } from "lucide-react"
import { toast } from "sonner"

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createFolder, getFolders, moveReportToFolder, type ReportFolder } from "@/app/actions/folders"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { exportReportToPdf } from "@/lib/pdf-export"
import { stripSqlArtifacts } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  ReportFilterBuilder,
  type FilterRow,
} from "@/components/report-filter-builder"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useNav } from "@/components/nav-context"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTable, type DataTableRef } from "@/components/ui/data-table"
import {
  createReportColumns,
  type SavedReport,
} from "@/components/views/saved-reports/reports-columns"
/** Column options for the report builder (id matches backend selectedColumns). Grouped for UI. */
const COLUMN_GROUPS = [
  {
    title: "Identity",
    columns: [
      { id: "first_name", label: "First Name" },
      { id: "last_name", label: "Last Name" },
      { id: "display_name", label: "Display Name" },
      { id: "email", label: "Email" },
      { id: "phone", label: "Phone" },
    ],
  },
  {
    title: "Physical Address",
    columns: [
      { id: "street_address", label: "Street" },
      { id: "city", label: "City" },
      { id: "state", label: "State" },
      { id: "zip", label: "Zip" },
    ],
  },
  {
    title: "Mailing Address",
    columns: [
      { id: "mailing_street", label: "Mailing Street" },
      { id: "mailing_city", label: "Mailing City" },
      { id: "mailing_state", label: "Mailing State" },
      { id: "mailing_zip", label: "Mailing Zip" },
    ],
  },
  {
    title: "Giving History",
    columns: [
      { id: "lifetime_value", label: "Donation Amount" },
      { id: "donation_date", label: "Donation Date" },
      { id: "last_gift_date", label: "Last Gift Date" },
      { id: "last_gift_amount", label: "Last Gift Amount" },
    ],
  },
] as const

const ALL_COLUMNS = COLUMN_GROUPS.flatMap((g) => g.columns.map((c) => c.id))

function safeFilename(name: string) {
  return name
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "report"
}

function SortableTableHead({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className={`whitespace-nowrap ${isDragging ? "opacity-50" : ""}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </TableHead>
  )
}

export function SavedReportsView() {
  const { openDonor } = useNav()
  const searchParams = useSearchParams()
  const [reports, setReports] = React.useState<SavedReport[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [folders, setFolders] = React.useState<ReportFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = React.useState(false)
  const [newFolderName, setNewFolderName] = React.useState("")
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false)
  const [moveReportId, setMoveReportId] = React.useState<string | null>(null)
  const [bulkMoveIds, setBulkMoveIds] = React.useState<string[] | null>(null)
  const [bulkDeleteIds, setBulkDeleteIds] = React.useState<string[] | null>(null)
  const [selectedReports, setSelectedReports] = React.useState<SavedReport[]>([])
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const dataTableRef = React.useRef<DataTableRef<SavedReport> | null>(null)

  const [generateDialogOpen, setGenerateDialogOpen] = React.useState(false)
  const [reportName, setReportName] = React.useState("")
  const [reportVisibility, setReportVisibility] = React.useState<"private" | "shared">("private")
  const [filters, setFilters] = React.useState<FilterRow[]>([])
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>([
    "first_name",
    "last_name",
    "email",
    "lifetime_value",
  ])
  const [isGenerating, setIsGenerating] = React.useState(false)

  const [renameOpen, setRenameOpen] = React.useState(false)
  const [renameId, setRenameId] = React.useState<string | null>(null)
  const [renameTitle, setRenameTitle] = React.useState("")
  const [isRenaming, setIsRenaming] = React.useState(false)

  const [previewReportId, setPreviewReportId] = React.useState<string | null>(null)
  const [previewData, setPreviewData] = React.useState<{
    title: string
    summary: string | null
    type: string | null
    content: string
    created_at: string
    reportParams?: { filters: FilterRow[]; selectedColumns: string[]; visibility: string } | null
  } | null>(null)
  const [regenerateOpen, setRegenerateOpen] = React.useState(false)
  const [regenerateFilters, setRegenerateFilters] = React.useState<FilterRow[]>([])
  const [regenerateColumns, setRegenerateColumns] = React.useState<string[]>([])
  const [regenerateTitle, setRegenerateTitle] = React.useState("")
  const [regenerateVisibility, setRegenerateVisibility] = React.useState<"private" | "shared">("private")
  const [isRegenerating, setIsRegenerating] = React.useState(false)
  const [previewLoading, setPreviewLoading] = React.useState(false)

  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [previewTableRows, setPreviewTableRows] = React.useState<string[][] | null>(null)
  const [columnOrder, setColumnOrder] = React.useState<number[]>([])
  const [tableScrollWidth, setTableScrollWidth] = React.useState(0)
  const tableScrollRef = React.useRef<HTMLDivElement>(null)
  const topScrollRef = React.useRef<HTMLDivElement>(null)
  const bottomScrollRef = React.useRef<HTMLDivElement>(null)
  const isSyncingScroll = React.useRef(false)
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const reportIdFromUrl = searchParams.get("reportId")

  React.useEffect(() => {
    if (reportIdFromUrl) setPreviewReportId(reportIdFromUrl)
  }, [reportIdFromUrl])

  const loadFolders = React.useCallback(async () => {
    try {
      const list = await getFolders()
      setFolders(list)
    } catch {
      setFolders([])
    }
  }, [])

  React.useEffect(() => {
    loadFolders()
  }, [loadFolders])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const url =
          selectedFolderId === null
            ? "/api/reports"
            : `/api/reports?folderId=${encodeURIComponent(selectedFolderId)}`
        const res = await fetch(url)
        const data = (await res.json()) as unknown
        if (!res.ok) {
          const msg =
            typeof data === "object" && data && "error" in data ? String((data as any).error) : ""
          throw new Error(msg || `Failed to load reports (HTTP ${res.status}).`)
        }
        if (cancelled) return
        setReports(Array.isArray(data) ? (data as SavedReport[]) : [])
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Failed to load reports.")
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedFolderId])

  const refresh = React.useCallback(async () => {
    await loadFolders()
    try {
      setLoading(true)
      setError(null)
      const url =
        selectedFolderId === null
          ? "/api/reports"
          : `/api/reports?folderId=${encodeURIComponent(selectedFolderId)}`
      const res = await fetch(url)
      const data = (await res.json()) as unknown
      if (!res.ok) {
        const msg =
          typeof data === "object" && data && "error" in data ? String((data as any).error) : ""
        throw new Error(msg || `Failed to load reports (HTTP ${res.status}).`)
      }
      setReports(Array.isArray(data) ? (data as SavedReport[]) : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports.")
    } finally {
      setLoading(false)
    }
  }, [loadFolders, selectedFolderId])

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.set("file", file)
      const res = await fetch("/api/reports/upload", {
        method: "POST",
        body: formData,
      })
      const data = (await res.json()) as { error?: string; details?: string[]; reportId?: string; title?: string; rowCount?: number }
      if (!res.ok) {
        const details = Array.isArray(data?.details) && data.details.length > 0 ? data.details[0] : undefined
        toast.error("Upload failed", {
          description: details ?? data?.error ?? "Could not save report.",
        })
        return
      }
      toast.success("Report uploaded", {
        description: data?.title ? `${data.title} (${Number(data?.rowCount ?? 0).toLocaleString()} rows)` : undefined,
      })
      await refresh()
      if (data?.reportId) setPreviewReportId(data.reportId)
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Could not upload file.",
      })
    } finally {
      setUploading(false)
    }
  }

  React.useEffect(() => {
    if (!previewReportId) {
      setPreviewData(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewData(null)
    fetch(`/api/reports/${encodeURIComponent(previewReportId)}`)
      .then((res) => res.json())
        .then((data: { content?: string; title?: string; summary?: string; type?: string; created_at?: string; records_count?: number; reportParams?: { filters: FilterRow[]; selectedColumns: string[]; visibility: string } | null }) => {
        if (cancelled) return
        setPreviewData({
          title: typeof data?.title === "string" ? data.title : "Report",
          summary: typeof data?.summary === "string" ? data.summary : null,
          type: typeof data?.type === "string" ? data.type : null,
          content: typeof data?.content === "string" ? data.content : "",
          created_at: typeof data?.created_at === "string" ? data.created_at : "",
          reportParams: data?.reportParams ?? null,
        })
        // Update the live row count in the report list so it reflects real data
        if (typeof data?.records_count === "number" && previewReportId) {
          setReports((prev) =>
            prev.map((r) =>
              r.id === previewReportId ? { ...r, records_count: data.records_count as number } : r
            )
          )
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewData(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [previewReportId])

  React.useEffect(() => {
    if (!previewData?.content) {
      setPreviewTableRows(null)
      setColumnOrder([])
      return
    }
    const typeUpper = (previewData.type ?? "").toUpperCase()
    if (typeUpper === "CSV" || typeUpper === "CRM") {
      const rows = parseCsvToRows(previewData.content)
      setPreviewTableRows(rows)
      setColumnOrder(rows[0] ? rows[0].map((_, i) => i) : [])
    } else {
      setPreviewTableRows(null)
      setColumnOrder([])
    }
  }, [previewData?.content, previewData?.type])

  React.useEffect(() => {
    if (!tableScrollRef.current || !previewTableRows?.length) {
      setTableScrollWidth(0)
      return
    }
    const el = tableScrollRef.current
    const updateWidth = () => setTableScrollWidth(el.scrollWidth)
    updateWidth()
    const ro = new ResizeObserver(updateWidth)
    ro.observe(el)
    return () => ro.disconnect()
  }, [previewTableRows, previewReportId])

  const syncScrollFromTable = React.useCallback(() => {
    if (isSyncingScroll.current || !tableScrollRef.current) return
    isSyncingScroll.current = true
    const sl = tableScrollRef.current.scrollLeft
    if (bottomScrollRef.current) bottomScrollRef.current.scrollLeft = sl
    if (topScrollRef.current) topScrollRef.current.scrollLeft = sl
    setTimeout(() => { isSyncingScroll.current = false }, 0)
  }, [])

  const syncScrollFromBottom = React.useCallback(() => {
    if (isSyncingScroll.current || !tableScrollRef.current || !bottomScrollRef.current) return
    isSyncingScroll.current = true
    const sl = bottomScrollRef.current.scrollLeft
    tableScrollRef.current.scrollLeft = sl
    if (topScrollRef.current) topScrollRef.current.scrollLeft = sl
    setTimeout(() => { isSyncingScroll.current = false }, 0)
  }, [])

  const syncScrollFromTop = React.useCallback(() => {
    if (isSyncingScroll.current || !tableScrollRef.current || !topScrollRef.current) return
    isSyncingScroll.current = true
    const sl = topScrollRef.current.scrollLeft
    tableScrollRef.current.scrollLeft = sl
    if (bottomScrollRef.current) bottomScrollRef.current.scrollLeft = sl
    setTimeout(() => { isSyncingScroll.current = false }, 0)
  }, [])

  /** Parse CSV string into rows (array of string[]). Handles quoted fields. */
  function parseCsvToRows(csv: string): string[][] {
    const lines = csv.trim().split(/\r?\n/)
    if (lines.length === 0) return []
    const rows: string[][] = []
    for (const line of lines) {
      const row: string[] = []
      let cell = ""
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (inQuotes) {
          if (c === '"') {
            if (line[i + 1] === '"') {
              cell += '"'
              i++
            } else {
              inQuotes = false
            }
          } else {
            cell += c
          }
        } else {
          if (c === '"') {
            inQuotes = true
          } else if (c === ",") {
            row.push(cell.trim())
            cell = ""
          } else {
            cell += c
          }
        }
      }
      row.push(cell.trim())
      rows.push(row)
    }
    return rows
  }

  const openRegenerateDialog = () => {
    if (!previewData?.reportParams) return
    setRegenerateFilters(previewData.reportParams.filters)
    setRegenerateColumns(previewData.reportParams.selectedColumns)
    setRegenerateTitle(previewData.title)
    setRegenerateVisibility((previewData.reportParams.visibility === "shared" ? "shared" : "private") as "private" | "shared")
    setRegenerateOpen(true)
  }

  const handleRegenerate = async () => {
    if (!previewReportId || !regenerateTitle.trim() || regenerateColumns.length === 0) return
    setIsRegenerating(true)
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: previewReportId,
          title: regenerateTitle.trim(),
          filters: regenerateFilters,
          selectedColumns: regenerateColumns,
          visibility: regenerateVisibility,
        }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string }
      if (!res.ok) {
        throw new Error(data?.error ?? `Failed (HTTP ${res.status})`)
      }
      toast.success("Report regenerated")
      setRegenerateOpen(false)
      await refresh()
      setPreviewLoading(true)
      const refetch = await fetch(`/api/reports/${encodeURIComponent(previewReportId)}`)
      const refetchData = (await refetch.json()) as { content?: string; title?: string; summary?: string; type?: string; created_at?: string; records_count?: number; reportParams?: { filters: FilterRow[]; selectedColumns: string[]; visibility: string } | null }
      setPreviewData({
        title: typeof refetchData?.title === "string" ? refetchData.title : "Report",
        summary: typeof refetchData?.summary === "string" ? refetchData.summary : null,
        type: typeof refetchData?.type === "string" ? refetchData.type : null,
        content: typeof refetchData?.content === "string" ? refetchData.content : "",
        created_at: typeof refetchData?.created_at === "string" ? refetchData.created_at : "",
        reportParams: refetchData?.reportParams ?? null,
      })
      setPreviewLoading(false)
    } catch (e) {
      toast.error("Regenerate failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleExportPdf = () => {
    if (!previewTableRows || previewTableRows.length < 2 || !previewData?.title) return
    const allHeaders = previewTableRows[0]
    const orderedIndices = columnOrder.length === allHeaders.length ? columnOrder : allHeaders.map((_, i) => i)
    const headers = orderedIndices.map((i) => stripSqlArtifacts(allHeaders[i] ?? ""))
    const rows = previewTableRows.slice(1).map((row) => orderedIndices.map((i) => stripSqlArtifacts(row[i] ?? "")))
    try {
      exportReportToPdf(stripSqlArtifacts(previewData.title), headers, rows)
      toast.success("PDF exported")
    } catch (e) {
      toast.error("PDF export failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  const handleDownloadCsv = async (report: SavedReport) => {
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}`)
      const data = (await res.json()) as any
      if (!res.ok) {
        const msg = data?.error ? String(data.error) : `Failed (HTTP ${res.status}).`
        throw new Error(msg)
      }
      const content = typeof data?.content === "string" ? data.content : ""
      if (!content) throw new Error("Report content is empty.")

      const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${safeFilename(report.title)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error("Download failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  const handleRename = async () => {
    const id = renameId
    const nextTitle = renameTitle.trim()
    if (!id || !nextTitle) return

    try {
      setIsRenaming(true)
      const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      })
      const data = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        const msg = data?.error ? String(data.error) : `Failed (HTTP ${res.status}).`
        throw new Error(msg)
      }
      toast.success("Report renamed")
      setRenameOpen(false)
      setRenameId(null)
      setRenameTitle("")
      await refresh()
    } catch (e) {
      toast.error("Rename failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, { method: "DELETE" })
      const data = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        const msg = data?.error ? String(data.error) : `Failed (HTTP ${res.status}).`
        throw new Error(msg)
      }
      toast.success("Report deleted")
      await refresh()
    } catch (e) {
      toast.error("Delete failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    try {
      setIsCreatingFolder(true)
      await createFolder(name)
      toast.success("Folder created")
      setCreateFolderOpen(false)
      setNewFolderName("")
      await loadFolders()
    } catch (e) {
      toast.error("Failed to create folder", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const handleMoveToFolder = async (reportId: string, folderId: string | null) => {
    try {
      await moveReportToFolder(reportId, folderId)
      toast.success("Report moved")
      await refresh()
    } catch (e) {
      toast.error("Failed to move report", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  const handleBulkMoveToFolder = async (folderId: string | null) => {
    if (!bulkMoveIds?.length) return
    try {
      for (const id of bulkMoveIds) {
        await moveReportToFolder(id, folderId)
      }
      toast.success(`${bulkMoveIds.length} report${bulkMoveIds.length === 1 ? "" : "s"} moved`)
      setBulkMoveIds(null)
      dataTableRef.current?.clearSelection()
      await refresh()
    } catch (e) {
      toast.error("Failed to move reports", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  const handleBulkDelete = async () => {
    if (!bulkDeleteIds?.length) return
    try {
      for (const id of bulkDeleteIds) {
        const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
          method: "DELETE",
        })
        const data = (await res.json().catch(() => null)) as { error?: string }
        if (!res.ok) {
          throw new Error(data?.error ?? `Failed (HTTP ${res.status})`)
        }
      }
      toast.success(`${bulkDeleteIds.length} report${bulkDeleteIds.length === 1 ? "" : "s"} deleted`)
      setBulkDeleteIds(null)
      dataTableRef.current?.clearSelection()
      await refresh()
    } catch (e) {
      toast.error("Failed to delete reports", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  const handleCreateReport = async () => {
    const name = reportName.trim()
    if (!name) {
      toast.error("Enter a report name")
      return
    }
    if (selectedColumns.length === 0) {
      toast.error("Select at least one column")
      return
    }

    try {
      setIsGenerating(true)
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name, filters, selectedColumns, visibility: reportVisibility }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; title?: string; reportId?: string }
      if (!res.ok) {
        const msg = data?.error ? String(data.error) : `Failed (HTTP ${res.status}).`
        throw new Error(msg)
      }
      toast.success("Report created", {
        description: data?.title ? `"${data.title}" saved.` : "Saved.",
      })
      setGenerateDialogOpen(false)
      setReportName("")
      setFilters([])
      await refresh()
    } catch (e) {
      toast.error("Failed to create report", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const toggleColumn = (id: string) => {
    setSelectedColumns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  return (
    <div className="flex flex-1 flex-col h-full py-4 md:py-6">
      <div className="flex flex-1 min-h-0 w-full">
        {/* Collapsible Folders sidebar */}
        <aside
          className={`flex shrink-0 flex-col border-r bg-muted/30 transition-[width] duration-200 ease-out ${
            sidebarOpen ? "w-52" : "w-0 overflow-hidden border-0"
          }`}
        >
          <nav className="flex flex-col gap-0.5 p-2 lg:p-3">
            <button
              type="button"
              onClick={() => setSelectedFolderId(null)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                selectedFolderId === null
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <IconFileText className="size-4 shrink-0" />
              All Reports
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setSelectedFolderId(folder.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  selectedFolderId === folder.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <IconFolder className="size-4 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setCreateFolderOpen(true)}
            >
              <IconFolderPlus className="size-4" />
              Create Folder
            </Button>
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col min-w-0 items-start">
          <div className="flex w-full items-center justify-between px-4 lg:px-6 mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => setSidebarOpen((o) => !o)}
                aria-label={sidebarOpen ? "Hide folders" : "Show folders"}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="size-5 text-slate-900 dark:text-white" />
                ) : (
                  <PanelLeft className="size-5 text-slate-900 dark:text-white" />
                )}
              </Button>
              <IconFileText className="size-5 text-slate-900 dark:text-white" />
              <h1 className="text-xl font-semibold">Saved Reports</h1>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                aria-hidden
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                className="bg-transparent"
                onClick={handleUploadClick}
                disabled={uploading}
              >
                <IconUpload className="size-4" />
                {uploading ? "Uploading…" : "Upload External File"}
              </Button>
              <Button
                variant="outline"
                className="bg-transparent"
                onClick={() => {
                  setGenerateDialogOpen(true)
                  setReportName("")
                  setFilters([])
                }}
              >
                <IconFilter className="size-4" />
                Create Report
              </Button>
            </div>
          </div>

          <Card className="mx-4 lg:mx-6 w-full flex flex-col">
            <CardHeader>
              <CardTitle>Generated Reports</CardTitle>
              <CardDescription>
                {selectedFolderId === null
                  ? "Access and download your saved reports"
                  : `Reports in "${folders.find((f) => f.id === selectedFolderId)?.name ?? "folder"}"`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col">
              {selectedReports.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2">
                  <span className="text-sm font-medium">
                    {selectedReports.length} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkMoveIds(selectedReports.map((r) => r.id))}
                  >
                    Move to folder
                  </Button>
                  <AlertDialog
                    open={!!bulkDeleteIds?.length}
                    onOpenChange={(open) => !open && setBulkDeleteIds(null)}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setBulkDeleteIds(selectedReports.map((r) => r.id))
                      }
                    >
                      Delete
                    </Button>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete report?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove{" "}
                          {bulkDeleteIds?.length ?? 0} report
                          {(bulkDeleteIds?.length ?? 0) === 1 ? "" : "s"}.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void handleBulkDelete()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dataTableRef.current?.clearSelection()}
                  >
                    Clear selection
                  </Button>
                </div>
              )}

              <div className="overflow-auto rounded-lg border max-h-[70vh] min-h-0">
                <DataTable<SavedReport, unknown>
                  columns={createReportColumns({
                    onView: setPreviewReportId,
                    onDownloadCsv: handleDownloadCsv,
                    onMove: (id) => setMoveReportId(id),
                    onRename: (id, title) => {
                      setRenameId(id)
                      setRenameTitle(title)
                      setRenameOpen(true)
                    },
                    onDelete: handleDelete,
                  })}
                  data={reports}
                  loading={loading}
                  error={error}
                  emptyMessage="No saved reports yet."
                  onRowSelectionChange={setSelectedReports}
                  onRowClick={(row) => setPreviewReportId(row.id)}
                  tableRef={dataTableRef}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>Name the folder to organize your reports.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Folder name</Label>
            <Input
              id="folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Michigan Campaigns"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)} disabled={isCreatingFolder}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateFolder()} disabled={!newFolderName.trim() || isCreatingFolder}>
              {isCreatingFolder ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!moveReportId || !!bulkMoveIds?.length}
        onOpenChange={(open) => {
          if (!open) {
            setMoveReportId(null)
            setBulkMoveIds(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>
              {bulkMoveIds?.length
                ? `Choose a folder for ${bulkMoveIds.length} report${bulkMoveIds.length === 1 ? "" : "s"}.`
                : "Choose a folder for this report."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1 py-2">
            <Button
              variant="outline"
              className="justify-start font-normal"
              onClick={() => {
                if (bulkMoveIds?.length) void handleBulkMoveToFolder(null)
                else if (moveReportId) void handleMoveToFolder(moveReportId, null)
                setMoveReportId(null)
                setBulkMoveIds(null)
              }}
            >
              No folder
            </Button>
            {folders.map((folder) => (
              <Button
                key={folder.id}
                variant="outline"
                className="justify-start font-normal"
                onClick={() => {
                  if (bulkMoveIds?.length) void handleBulkMoveToFolder(folder.id)
                  else if (moveReportId) void handleMoveToFolder(moveReportId, folder.id)
                  setMoveReportId(null)
                  setBulkMoveIds(null)
                }}
              >
                <IconFolder className="size-4 mr-2 shrink-0" />
                {folder.name}
              </Button>
            ))}
            {folders.length === 0 && (
              <p className="text-sm text-muted-foreground pt-2">
                Create a folder from the sidebar to organize reports.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[520px] flex-col sm:w-full">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Create Report</DialogTitle>
            <DialogDescription>
              Set time frame, financials, and location. Example: donors from Michigan who gave over $500 this year.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="report-name">Report Name</Label>
              <Input
                id="report-name"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g. Michigan Donors 2025"
                required
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={reportVisibility} onValueChange={(v) => setReportVisibility(v as "private" | "shared")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (Only Me)</SelectItem>
                  <SelectItem value="shared">Shared (Entire Organization)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {reportVisibility === "private" ? "Only you can see this report." : "Everyone in your organization can see this report."}
              </p>
            </div>
            {generateDialogOpen && (
              <ReportFilterBuilder key="create-report-form" filters={filters} onChange={setFilters} />
            )}

            <div className="space-y-2">
              <Label>Select Columns</Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setSelectedColumns([...ALL_COLUMNS])}
                >
                  Select All
                </button>
                <span aria-hidden>|</span>
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setSelectedColumns([])}
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-4 rounded-md border p-3">
                {COLUMN_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                      {group.title}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.columns.map((col) => (
                        <label
                          key={col.id}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={selectedColumns.includes(col.id)}
                            onCheckedChange={() => toggleColumn(col.id)}
                          />
                          <span>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => setGenerateDialogOpen(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateReport()}
              disabled={!reportName.trim() || selectedColumns.length === 0 || isGenerating}
            >
              {isGenerating ? "Running…" : "Run Query"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename report</DialogTitle>
            <DialogDescription>Update the report title.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-title">Title</Label>
            <Input
              id="rename-title"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Report name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => setRenameOpen(false)}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isRenaming || !renameTitle.trim()}>
              {isRenaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewReportId} onOpenChange={(open) => !open && setPreviewReportId(null)}>
        <DialogContent
          className="h-[80vh] flex flex-col p-0 gap-0"
          style={{ resize: "horizontal", overflow: "hidden", width: "900px", minWidth: "520px", maxWidth: "95vw" }}
        >
          <DialogHeader className="p-6 pb-2 flex-shrink-0">
            <DialogTitle>
              {previewData ? stripSqlArtifacts(previewData.title) : "Report preview"}
            </DialogTitle>
            <DialogDescription>
              {previewData?.created_at
                ? new Date(previewData.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "2-digit",
                    year: "numeric",
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {previewTableRows && previewTableRows.length > 0 && tableScrollWidth > 0 && (
              <div
                ref={topScrollRef}
                className="flex-shrink-0 h-3 overflow-x-auto overflow-y-hidden border-b bg-muted/30"
                onScroll={syncScrollFromTop}
                aria-hidden
              >
                <div style={{ width: tableScrollWidth, minWidth: "100%", height: 1 }} />
              </div>
            )}
            <div
              ref={tableScrollRef}
              className="flex-1 overflow-y-auto overflow-x-auto min-h-0 p-6 pt-2"
              onScroll={syncScrollFromTable}
            >
            {previewLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : previewData?.content ? (
              (() => {
                const typeUpper = (previewData.type ?? "").toUpperCase()
                const isCsv = typeUpper === "CSV" || typeUpper === "CRM"
                const rows = isCsv ? parseCsvToRows(previewData.content) : null
                const headers = rows?.[0] ?? []
                const orderedIndices = columnOrder.length === headers.length ? columnOrder : headers.map((_, i) => i)
                const idColIndex = headers.findIndex(
                  (h) => stripSqlArtifacts(h).toLowerCase().includes("donor id") || stripSqlArtifacts(h).toLowerCase() === "id"
                )
                const displayNameColIndex = headers.findIndex(
                  (h) => stripSqlArtifacts(h).toLowerCase().includes("display name")
                )
                const emailColIndex = headers.findIndex((h) => stripSqlArtifacts(h).toLowerCase() === "email")
                const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s?.trim() ?? "")
                const handleColumnDragEnd = (event: DragEndEvent) => {
                  const { active, over } = event
                  if (!over || active.id === over.id) return
                  const oldIndex = orderedIndices.indexOf(Number(String(active.id).replace("col-", "")))
                  const newIndex = orderedIndices.indexOf(Number(String(over.id).replace("col-", "")))
                  if (oldIndex === -1 || newIndex === -1) return
                  setColumnOrder(arrayMove(orderedIndices, oldIndex, newIndex))
                }
                return rows && rows.length > 0 ? (
                  <>
                    <DndContext sensors={dndSensors} onDragEnd={handleColumnDragEnd}>
                      <SortableContext items={orderedIndices.map((i) => `col-${i}`)} strategy={horizontalListSortingStrategy}>
                        <Table className="w-full min-w-max">
                          <TableHeader className="sticky top-0 z-10">
                            <TableRow className="bg-card [&>th]:bg-card">
                              {orderedIndices.map((colIdx) => (
                                <SortableTableHead key={colIdx} id={`col-${colIdx}`}>
                                  {stripSqlArtifacts(headers[colIdx] ?? "")}
                                </SortableTableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.slice(1, 101).map((row, ri) => {
                              const donorId = idColIndex >= 0 && row[idColIndex] ? String(row[idColIndex]).trim() : ""
                              const canLink = donorId && isUuid(donorId)
                              return (
                                <TableRow key={ri}>
                                  {orderedIndices.map((colIdx) => {
                                    const cell = row[colIdx]
                                    const content = stripSqlArtifacts(cell ?? "")
                                    const isDisplayName = colIdx === displayNameColIndex && canLink
                                    const isEmail = colIdx === emailColIndex && canLink
                                    if (isDisplayName || isEmail) {
                                      return (
                                        <TableCell key={colIdx} className="text-sm whitespace-nowrap">
                                          <button
                                            type="button"
                                            className="text-primary hover:underline text-left"
                                            onClick={() => openDonor(donorId)}
                                          >
                                            {content || "—"}
                                          </button>
                                        </TableCell>
                                      )
                                    }
                                    return (
                                      <TableCell key={colIdx} className="text-sm whitespace-nowrap">
                                        {content}
                                      </TableCell>
                                    )
                                  })}
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </SortableContext>
                    </DndContext>
                    {rows.length > 101 && (
                      <p className="text-xs text-muted-foreground p-2 border-t">
                        Showing first 100 data rows of {rows.length - 1} total.
                      </p>
                    )}
                  </>
                ) : (
                  <pre className="text-xs whitespace-pre-wrap font-mono break-words p-3">
                    {previewData.content}
                  </pre>
                )
              })()
            ) : (
              <p className="text-sm text-muted-foreground py-4">No content to display.</p>
            )}
            </div>
            {previewTableRows && previewTableRows.length > 0 && tableScrollWidth > 0 && (
              <div
                ref={bottomScrollRef}
                className="flex-shrink-0 h-4 overflow-x-auto overflow-y-hidden border-t bg-muted/30"
                onScroll={syncScrollFromBottom}
                aria-hidden
              >
                <div style={{ width: tableScrollWidth, minWidth: "100%", height: 1 }} />
              </div>
            )}
          </div>
          <DialogFooter className="p-6 pt-2 flex-shrink-0 border-t bg-background">
            <Button
              variant="outline"
              onClick={() => setPreviewReportId(null)}
            >
              Close
            </Button>
            {previewData?.reportParams && (
              <Button variant="outline" onClick={openRegenerateDialog}>
                Edit & Regenerate
              </Button>
            )}
            {previewReportId && previewData && ((previewData.type ?? "").toUpperCase() === "CSV" || (previewData.type ?? "").toUpperCase() === "CRM") && (
              <>
                <Button
                  variant="outline"
                  onClick={handleExportPdf}
                  disabled={!previewTableRows || previewTableRows.length < 2}
                >
                  Export PDF
                </Button>
                <Button
                  onClick={() => {
                    const report = reports.find((r) => r.id === previewReportId) ?? {
                      id: previewReportId,
                      title: previewData.title,
                      type: previewData.type,
                      query: null,
                      summary: previewData.summary,
                      records_count: null,
                      created_at: previewData.created_at,
                    }
                    void handleDownloadCsv(report)
                  }}
                >
                  Download CSV
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[520px] flex-col sm:w-full">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Edit & Regenerate Report</DialogTitle>
            <DialogDescription>
              Adjust filters and columns, then regenerate to update the report.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="regenerate-name">Report Name</Label>
              <Input
                id="regenerate-name"
                value={regenerateTitle}
                onChange={(e) => setRegenerateTitle(e.target.value)}
                placeholder="e.g. Michigan Donors 2025"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={regenerateVisibility} onValueChange={(v) => setRegenerateVisibility(v as "private" | "shared")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (Only Me)</SelectItem>
                  <SelectItem value="shared">Shared (Entire Organization)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {regenerateOpen && (
              <ReportFilterBuilder
                key="regenerate-form"
                filters={regenerateFilters}
                onChange={setRegenerateFilters}
                initialFilters={regenerateFilters}
              />
            )}
            <div className="space-y-2">
              <Label>Select Columns</Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setRegenerateColumns([...ALL_COLUMNS])}
                >
                  Select All
                </button>
                <span aria-hidden>|</span>
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setRegenerateColumns([])}
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-4 rounded-md border p-3">
                {COLUMN_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">{group.title}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.columns.map((col) => (
                        <label
                          key={col.id}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={regenerateColumns.includes(col.id)}
                            onCheckedChange={(checked) =>
                              setRegenerateColumns((prev) =>
                                checked ? [...prev, col.id] : prev.filter((c) => c !== col.id)
                              )
                            }
                          />
                          <span>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setRegenerateOpen(false)} disabled={isRegenerating}>
              Cancel
            </Button>
            <Button onClick={() => void handleRegenerate()} disabled={!regenerateTitle.trim() || regenerateColumns.length === 0 || isRegenerating}>
              {isRegenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
