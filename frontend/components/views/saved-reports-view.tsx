"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { IconFileText, IconFolder, IconFolderPlus, IconFilter, IconUpload } from "@tabler/icons-react"
import { MoreHorizontal, PanelLeft, PanelLeftClose } from "lucide-react"
import { toast } from "sonner"

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createFolder, getFolders, moveReportToFolder, type ReportFolder } from "@/app/actions/folders"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { stripSqlArtifacts } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  ReportFilterBuilder,
  type FilterRow,
} from "@/components/report-filter-builder"
import { Label } from "@/components/ui/label"
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
import { Checkbox } from "@/components/ui/checkbox"
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
    title: "Location",
    columns: [
      { id: "street_address", label: "Street" },
      { id: "city", label: "City" },
      { id: "state", label: "State" },
      { id: "zip", label: "Zip" },
    ],
  },
  {
    title: "Giving History",
    columns: [
      { id: "lifetime_value", label: "Lifetime Value" },
      { id: "last_gift_date", label: "Last Gift Date" },
      { id: "last_gift_amount", label: "Last Gift Amount" },
    ],
  },
] as const

const ALL_COLUMNS = COLUMN_GROUPS.flatMap((g) => g.columns.map((c) => c.id))

type SavedReport = {
  id: string
  title: string
  query: string | null
  type?: string | null
  summary?: string | null
  records_count?: number | null
  created_at: string
  folder_id?: string | null
}

function safeFilename(name: string) {
  return name
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "report"
}

export function SavedReportsView() {
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
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  const [generateDialogOpen, setGenerateDialogOpen] = React.useState(false)
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
  } | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)

  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

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
      .then((data: { content?: string; title?: string; summary?: string; type?: string; created_at?: string }) => {
        if (cancelled) return
        setPreviewData({
          title: typeof data?.title === "string" ? data.title : "Report",
          summary: typeof data?.summary === "string" ? data.summary : null,
          type: typeof data?.type === "string" ? data.type : null,
          content: typeof data?.content === "string" ? data.content : "",
          created_at: typeof data?.created_at === "string" ? data.created_at : "",
        })
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

  const handleCreateReport = async () => {
    if (selectedColumns.length === 0) {
      toast.error("Select at least one column")
      return
    }

    try {
      setIsGenerating(true)
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, selectedColumns }),
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
                className="bg-slate-900 hover:bg-slate-800 text-white"
                onClick={() => {
                  setGenerateDialogOpen(true)
                  setFilters([])
                }}
              >
                <IconFilter className="size-4" />
                Create Report
              </Button>
            </div>
          </div>

          <Card className="mx-4 lg:mx-6 w-full flex flex-col bg-gradient-to-t from-primary/5 to-card shadow-xs">
            <CardHeader>
              <CardTitle>Generated Reports</CardTitle>
              <CardDescription>
                {selectedFolderId === null
                  ? "Access and download your saved reports"
                  : `Reports in "${folders.find((f) => f.id === selectedFolderId)?.name ?? "folder"}"`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col">
              <div className="overflow-auto rounded-lg border max-h-[70vh] min-h-0">
                <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Report Name</TableHead>
                  <TableHead className="font-semibold">Date Generated</TableHead>
                  <TableHead className="font-semibold">Records</TableHead>
                  <TableHead className="w-[50px] font-semibold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-destructive text-sm">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      No saved reports yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((report) => (
                    <TableRow
                      key={report.id}
                      className="cursor-pointer"
                      onClick={() => setPreviewReportId(report.id)}
                    >
                      <TableCell className="font-medium">
                        {stripSqlArtifacts(report.title)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "2-digit",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {typeof report.records_count === "number"
                          ? `${report.records_count.toLocaleString()} rows`
                          : (report.type ?? "").toUpperCase() === "CSV"
                            ? "CSV"
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
                              size="icon"
                            >
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setPreviewReportId(report.id)}>
                              View report
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={(report.type ?? "").toUpperCase() !== "CSV"}
                              onClick={() => void handleDownloadCsv(report)}
                            >
                              Download CSV
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault()
                                setMoveReportId(report.id)
                              }}
                            >
                              Move to Folder
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setRenameId(report.id)
                                setRenameTitle(report.title)
                                setRenameOpen(true)
                              }}
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
                                    This will permanently remove “{stripSqlArtifacts(report.title)}”.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => void handleDelete(report.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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

      <Dialog open={!!moveReportId} onOpenChange={(open) => !open && setMoveReportId(null)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>Choose a folder for this report.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1 py-2">
            <Button
              variant="outline"
              className="justify-start font-normal"
              onClick={() => {
                if (moveReportId) void handleMoveToFolder(moveReportId, null)
                setMoveReportId(null)
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
                  if (moveReportId) void handleMoveToFolder(moveReportId, folder.id)
                  setMoveReportId(null)
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
              disabled={selectedColumns.length === 0 || isGenerating}
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
        <DialogContent className="sm:max-w-[900px] w-full h-[80vh] flex flex-col p-0 gap-0">
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
              {previewData?.summary ? (
                <span className="block mt-1 text-muted-foreground">
                  {stripSqlArtifacts(previewData.summary)}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 p-6 pt-2">
            {previewLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : previewData?.content ? (
              (() => {
                const typeUpper = (previewData.type ?? "").toUpperCase()
                const isCsv = typeUpper === "CSV" || typeUpper === "CRM"
                const rows = isCsv ? parseCsvToRows(previewData.content) : null
                return rows && rows.length > 0 ? (
                  <>
                    <Table className="w-full min-w-max">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          {rows[0].map((h, i) => (
                            <TableHead key={i} className="whitespace-nowrap">
                              {stripSqlArtifacts(h)}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.slice(1, 101).map((row, ri) => (
                          <TableRow key={ri}>
                            {row.map((cell, ci) => (
                              <TableCell key={ci} className="text-sm whitespace-nowrap">
                                {stripSqlArtifacts(cell)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
          <DialogFooter className="p-6 pt-2 flex-shrink-0 border-t bg-background">
            <Button
              variant="outline"
              onClick={() => setPreviewReportId(null)}
            >
              Close
            </Button>
            {previewReportId && previewData && ((previewData.type ?? "").toUpperCase() === "CSV" || (previewData.type ?? "").toUpperCase() === "CRM") && (
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
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
