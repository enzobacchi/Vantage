"use client"

import * as React from "react"
import { IconFileText, IconSparkles, IconUpload } from "@tabler/icons-react"
import { MoreHorizontal } from "lucide-react"
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
import { useNav } from "@/components/nav-context"

type SavedReport = {
  id: string
  title: string
  query: string | null
  type?: string | null
  summary?: string | null
  records_count?: number | null
  created_at: string
}

function safeFilename(name: string) {
  return name
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "report"
}

export function SavedReportsView() {
  const { openAiWithQuery } = useNav()

  const [reports, setReports] = React.useState<SavedReport[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [generateDialogOpen, setGenerateDialogOpen] = React.useState(false)
  const [generatePrompt, setGeneratePrompt] = React.useState("")
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

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch("/api/reports")
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
  }, [])

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/reports")
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
  }, [])

  const runReport = (report: SavedReport) => {
    const q = (report.query ?? "").trim()
    if (!q) return
    openAiWithQuery(q)
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

  const handleGenerateWithAi = async () => {
    const prompt = generatePrompt.trim()
    if (!prompt) return

    try {
      setIsGenerating(true)
      // Ask the AI to generate + save the report (save_report_tool path).
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Generate a report: ${prompt}. Save this report.` }),
      })
      const data = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        const msg = data?.error ? String(data.error) : `Failed (HTTP ${res.status}).`
        throw new Error(msg)
      }
      toast.success("Report generated", {
        description: typeof data?.reply === "string" ? data.reply : "Saved.",
      })
      setGenerateDialogOpen(false)
      setGeneratePrompt("")
      await refresh()
    } catch (e) {
      toast.error("Failed to generate report", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:py-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <IconFileText className="size-5 text-slate-900 dark:text-white" />
          <h1 className="text-xl font-semibold">Saved Reports</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="bg-transparent" onClick={() => {}}>
            <IconUpload className="size-4" />
            Upload External File
          </Button>
          <Button
            className="bg-slate-900 hover:bg-slate-800 text-white"
            onClick={() => {
              setGenerateDialogOpen(true)
              setGeneratePrompt("")
            }}
          >
            <IconSparkles className="size-4" />
            Generate with AI
          </Button>
        </div>
      </div>

      <Card className="mx-4 lg:mx-6 bg-gradient-to-t from-primary/5 to-card shadow-xs">
        <CardHeader>
          <CardTitle>Generated Reports</CardTitle>
          <CardDescription>
            Access and download your saved reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Report Name</TableHead>
                  <TableHead className="font-semibold">Date Generated</TableHead>
                  <TableHead className="font-semibold">Criteria</TableHead>
                  <TableHead className="font-semibold">Records</TableHead>
                  <TableHead className="w-[50px] font-semibold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-sm">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-destructive text-sm">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-sm">
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
                      <TableCell className="text-muted-foreground max-w-80 truncate">
                        {report.summary ? stripSqlArtifacts(report.summary.trim()) : "—"}
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

      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate with AI</DialogTitle>
            <DialogDescription>
              What kind of report?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="report-prompt">Report request</Label>
            <Input
              id="report-prompt"
              value={generatePrompt}
              onChange={(e) => setGeneratePrompt(e.target.value)}
              placeholder="Example: Top donors in Texas by lifetime value"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => setGenerateDialogOpen(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateWithAi}
              disabled={!generatePrompt.trim() || isGenerating}
            >
              {isGenerating ? "Generating…" : "Generate"}
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
                const isCsv = (previewData.type ?? "").toUpperCase() === "CSV"
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
            {previewReportId && previewData && (previewData.type ?? "").toUpperCase() === "CSV" && (
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
