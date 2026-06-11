"use client"

import * as React from "react"
import Papa from "papaparse"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  importDonorsFromCSV,
  importDonationsFromCSV,
  type ImportRow,
  type ImportResult,
  type DonationImportRow,
  type DonationImportResult,
} from "@/app/actions/import"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// ---------------------------------------------------------------------------
// Field definitions for column mapping
// ---------------------------------------------------------------------------

const DONOR_FIELDS = [
  { value: "display_name", label: "Name", required: true },
  { value: "external_id", label: "External ID" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "billing_address", label: "Address" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zip", label: "Zip" },
  { value: "donor_type", label: "Donor Type" },
  { value: "amount", label: "Donation Amount" },
  { value: "date", label: "Donation Date" },
  { value: "payment_method", label: "Payment Method" },
  { value: "memo", label: "Memo / Notes" },
] as const

// Donations-history mode: one row per gift, matched to existing donors by
// External ID → Email → Name. No donor creation in this mode.
const DONATION_FIELDS = [
  { value: "amount", label: "Amount", required: true },
  { value: "date", label: "Date", required: true },
  { value: "external_id", label: "Donor External ID" },
  { value: "email", label: "Donor Email" },
  { value: "display_name", label: "Donor Name" },
  { value: "payment_method", label: "Payment Method" },
  { value: "memo", label: "Memo / Notes" },
  { value: "category", label: "Category" },
  { value: "campaign", label: "Campaign" },
  { value: "fund", label: "Fund" },
] as const

type FieldValue =
  | (typeof DONOR_FIELDS)[number]["value"]
  | (typeof DONATION_FIELDS)[number]["value"]

type ImportMode = "donors" | "donations"

const SKIP_VALUE = "__skip__"

// Auto-detect common CSV column names
const AUTO_MAP: Record<string, FieldValue> = {
  "external id": "external_id",
  "external_id": "external_id",
  "account number": "external_id",
  "account id": "external_id",
  "account #": "external_id",
  "bloomerang id": "external_id",
  "constituent id": "external_id",
  "donor id": "external_id",
  category: "category",
  campaign: "campaign",
  fund: "fund",
  name: "display_name",
  "display name": "display_name",
  "display_name": "display_name",
  "full name": "display_name",
  "donor name": "display_name",
  "donor": "display_name",
  "first name": "first_name",
  "first_name": "first_name",
  "firstname": "first_name",
  "last name": "last_name",
  "last_name": "last_name",
  "lastname": "last_name",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  telephone: "phone",
  address: "billing_address",
  "street address": "billing_address",
  "billing address": "billing_address",
  "address line 1": "billing_address",
  "street": "billing_address",
  city: "city",
  state: "state",
  "st": "state",
  zip: "zip",
  "zip code": "zip",
  "zipcode": "zip",
  "postal code": "zip",
  "postal": "zip",
  type: "donor_type",
  "donor type": "donor_type",
  "donor_type": "donor_type",
  amount: "amount",
  "donation amount": "amount",
  "gift amount": "amount",
  "total": "amount",
  date: "date",
  "donation date": "date",
  "gift date": "date",
  "payment method": "payment_method",
  "payment_method": "payment_method",
  "method": "payment_method",
  memo: "memo",
  notes: "memo",
  note: "memo",
  comment: "memo",
  comments: "memo",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Step = "upload" | "map" | "review"

export function CSVImportWizard() {
  const [step, setStep] = React.useState<Step>("upload")
  const [mode, setMode] = React.useState<ImportMode>("donors")
  const [file, setFile] = React.useState<File | null>(null)
  const [csvHeaders, setCsvHeaders] = React.useState<string[]>([])
  const [csvRows, setCsvRows] = React.useState<string[][]>([])
  const [columnMap, setColumnMap] = React.useState<Record<number, string>>({})
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<
    ImportResult | DonationImportResult | null
  >(null)
  const [dragActive, setDragActive] = React.useState(false)

  const activeFields = mode === "donors" ? DONOR_FIELDS : DONATION_FIELDS

  // --- Step 1: Upload ---
  function handleFile(f: File) {
    if (!f.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file")
      return
    }

    Papa.parse(f, {
      skipEmptyLines: true,
      complete(results) {
        const data = results.data as string[][]
        if (data.length < 2) {
          toast.error("CSV must have at least a header row and one data row")
          return
        }

        const headers = data[0]
        const rows = data.slice(1)

        setCsvHeaders(headers)
        setCsvRows(rows)
        setFile(f)

        // Auto-map columns (only to fields valid for the active mode)
        const fields = mode === "donors" ? DONOR_FIELDS : DONATION_FIELDS
        const validValues = new Set<string>(fields.map((fd) => fd.value))
        const autoMap: Record<number, string> = {}
        const usedFields = new Set<string>()
        headers.forEach((h, i) => {
          const normalized = h.toLowerCase().trim()
          const field = AUTO_MAP[normalized]
          if (field && validValues.has(field) && !usedFields.has(field)) {
            autoMap[i] = field
            usedFields.add(field)
          }
        })
        setColumnMap(autoMap)
        setStep("map")
      },
      error() {
        toast.error("Failed to parse CSV file")
      },
    })
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  // --- Step 2: Map ---
  function updateMapping(colIndex: number, fieldValue: string) {
    setColumnMap((prev) => {
      const next = { ...prev }
      if (fieldValue === SKIP_VALUE) {
        delete next[colIndex]
      } else {
        // Remove any other column mapped to this field
        for (const [key, val] of Object.entries(next)) {
          if (val === fieldValue && Number(key) !== colIndex) {
            delete next[Number(key)]
          }
        }
        next[colIndex] = fieldValue
      }
      return next
    })
  }

  const mappedFields = new Set(Object.values(columnMap))
  const hasRequiredFields =
    mode === "donors"
      ? mappedFields.has("display_name")
      : mappedFields.has("amount") &&
        mappedFields.has("date") &&
        (mappedFields.has("external_id") ||
          mappedFields.has("email") ||
          mappedFields.has("display_name"))
  const requiredHint =
    mode === "donors"
      ? 'A "Name" column mapping is required to continue.'
      : 'Map "Amount", "Date", and at least one donor identifier (External ID, Email, or Name) to continue.'

  // --- Step 3: Review & Import ---
  const parsedRows = React.useMemo(() => {
    return csvRows.map((row) => {
      const obj: Record<string, string> = {}
      for (const [colIdx, field] of Object.entries(columnMap)) {
        const value = row[Number(colIdx)]?.trim()
        if (value) obj[field] = value
      }
      return obj
    })
  }, [csvRows, columnMap])

  const validationErrors = React.useMemo(() => {
    const errors: Array<{ row: number; message: string }> = []
    parsedRows.forEach((row, i) => {
      if (mode === "donors") {
        if (!row.display_name) {
          errors.push({ row: i + 1, message: "Missing name" })
        }
        if (row.amount && isNaN(Number(row.amount))) {
          errors.push({ row: i + 1, message: `Invalid amount: "${row.amount}"` })
        }
        if (row.date && isNaN(Date.parse(row.date))) {
          errors.push({ row: i + 1, message: `Invalid date: "${row.date}"` })
        }
      } else {
        if (!row.amount || isNaN(Number(row.amount))) {
          errors.push({ row: i + 1, message: `Missing or invalid amount: "${row.amount ?? ""}"` })
        }
        if (!row.date || isNaN(Date.parse(row.date))) {
          errors.push({ row: i + 1, message: `Missing or invalid date: "${row.date ?? ""}"` })
        }
        if (!row.external_id && !row.email && !row.display_name) {
          errors.push({ row: i + 1, message: "No donor identifier (External ID, Email, or Name)" })
        }
      }
    })
    return errors
  }, [parsedRows, mode])

  async function runImport() {
    setImporting(true)
    try {
      if (mode === "donors") {
        const importRows: ImportRow[] = parsedRows
          .filter((r) => r.display_name)
          .map((r) => ({
            display_name: r.display_name,
            external_id: r.external_id || null,
            first_name: r.first_name || null,
            last_name: r.last_name || null,
            email: r.email || null,
            phone: r.phone || null,
            billing_address: r.billing_address || null,
            city: r.city || null,
            state: r.state || null,
            zip: r.zip || null,
            donor_type: r.donor_type || null,
            amount: r.amount ? Number(r.amount) : null,
            date: r.date ? normalizeDate(r.date) : null,
            payment_method: r.payment_method || null,
            memo: r.memo || null,
          }))

        const res = await importDonorsFromCSV(importRows)
        setResult(res)
        const imported = res.donorsCreated + res.donorsUpdated
        const donationsSuffix = res.donationsCreated ? ` and ${res.donationsCreated} donations` : ""
        if (res.capReached && res.donorsSkipped > 0) {
          toast.warning(
            `Imported ${imported} donors${donationsSuffix}. ${res.donorsSkipped} skipped — you've hit your plan's ${res.planMaxDonors.toLocaleString()} donor limit. Upgrade to import the rest.`,
            { duration: 10_000 }
          )
        } else {
          toast.success(`Imported ${imported} donors${donationsSuffix}`)
        }
      } else {
        const donationRows: DonationImportRow[] = parsedRows
          .filter((r) => r.amount && r.date)
          .map((r) => ({
            external_id: r.external_id || null,
            email: r.email || null,
            display_name: r.display_name || null,
            amount: Number(r.amount),
            date: normalizeDate(r.date) ?? r.date,
            payment_method: r.payment_method || null,
            memo: r.memo || null,
            category: r.category || null,
            campaign: r.campaign || null,
            fund: r.fund || null,
          }))

        const res = await importDonationsFromCSV(donationRows)
        setResult(res)
        if (res.rowsSkipped > 0) {
          toast.warning(
            `Imported ${res.donationsCreated} donations. ${res.rowsSkipped} rows skipped — see details below.`,
            { duration: 10_000 }
          )
        } else {
          toast.success(`Imported ${res.donationsCreated} donations`)
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed")
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setStep("upload")
    setFile(null)
    setCsvHeaders([])
    setCsvRows([])
    setColumnMap({})
    setResult(null)
  }

  // --- Render ---
  if (result) {
    return <ImportResults result={result} onReset={reset} />
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StepIndicator label="Upload" active={step === "upload"} done={step !== "upload"} number={1} />
        <ChevronSep />
        <StepIndicator label="Map Columns" active={step === "map"} done={step === "review"} number={2} />
        <ChevronSep />
        <StepIndicator label="Review & Import" active={step === "review"} done={false} number={3} />
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5" strokeWidth={1.5} />
              Upload CSV
            </CardTitle>
            <CardDescription>
              {mode === "donors"
                ? "Upload a CSV file with your donor data. The first row should contain column headers."
                : "Upload a CSV with one row per donation. Each row is matched to an existing donor by External ID, Email, or Name — donors are not created in this mode."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("donors")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  mode === "donors"
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-accent"
                }`}
              >
                <p className="text-sm font-medium">Donors</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Import or update donors, optionally with one donation per row
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("donations")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  mode === "donations"
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-accent"
                }`}
              >
                <p className="text-sm font-medium">Donations history</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Import full gift history — one row per donation, matched to existing donors
                </p>
              </button>
            </div>
            <div
              className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
            >
              <Upload
                className="size-10 text-muted-foreground/50 mb-4"
                strokeWidth={1.5}
              />
              <p className="text-sm font-medium mb-1">
                Drag and drop your CSV file here
              </p>
              <p className="text-xs text-muted-foreground mb-4">or</p>
              <Button variant="outline" asChild>
                <label className="cursor-pointer">
                  Browse Files
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={onFileSelect}
                  />
                </label>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Map Columns */}
      {step === "map" && (
        <Card>
          <CardHeader>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>
              Match each CSV column to a donor field. Columns marked &quot;Skip&quot; won&apos;t be imported.
              {file && (
                <span className="ml-2 text-foreground font-medium">
                  {file.name} ({csvRows.length} rows)
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!hasRequiredFields && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" strokeWidth={1.5} />
                <AlertDescription>{requiredHint}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">CSV Column</TableHead>
                    <TableHead className="w-[200px]">Maps To</TableHead>
                    <TableHead>Sample Values</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvHeaders.map((header, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{header}</TableCell>
                      <TableCell>
                        <Select
                          value={columnMap[i] ?? SKIP_VALUE}
                          onValueChange={(v) => updateMapping(i, v)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SKIP_VALUE}>
                              <span className="text-muted-foreground">Skip</span>
                            </SelectItem>
                            {activeFields.map((f) => (
                              <SelectItem
                                key={f.value}
                                value={f.value}
                                disabled={
                                  mappedFields.has(f.value) &&
                                  columnMap[i] !== f.value
                                }
                              >
                                {f.label}
                                {"required" in f && f.required && " *"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[300px] truncate">
                        {csvRows
                          .slice(0, 3)
                          .map((r) => r[i])
                          .filter(Boolean)
                          .join(" · ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>
                <ArrowLeft className="size-4 mr-2" strokeWidth={1.5} />
                Back
              </Button>
              <Button
                onClick={() => setStep("review")}
                disabled={!hasRequiredFields}
              >
                Review
                <ArrowRight className="size-4 ml-2" strokeWidth={1.5} />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review & Import */}
      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Import</CardTitle>
            <CardDescription>
              Review the data below before importing. {parsedRows.length} rows will be processed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              {mode === "donors" && (
                <Badge variant="secondary">
                  {parsedRows.filter((r) => r.display_name).length} donors
                </Badge>
              )}
              {mappedFields.has("amount") && (
                <Badge variant="secondary">
                  {parsedRows.filter((r) => r.amount && !isNaN(Number(r.amount))).length} donations
                </Badge>
              )}
              {validationErrors.length > 0 && (
                <Badge variant="destructive">
                  {validationErrors.length} warnings
                </Badge>
              )}
            </div>

            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" strokeWidth={1.5} />
                <AlertDescription>
                  {validationErrors.length} row(s) have issues and will be skipped:
                  <ul className="mt-1 list-disc list-inside text-xs">
                    {validationErrors.slice(0, 5).map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.message}
                      </li>
                    ))}
                    {validationErrors.length > 5 && (
                      <li>...and {validationErrors.length - 5} more</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Data preview table */}
            <div className="rounded-md border max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {Object.values(columnMap).map((field) => (
                      <TableHead key={field}>
                        {activeFields.find((f) => f.value === field)?.label ?? field}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 20).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground text-xs">
                        {i + 1}
                      </TableCell>
                      {Object.values(columnMap).map((field) => (
                        <TableCell key={field} className="text-sm max-w-[200px] truncate">
                          {row[field] || (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {parsedRows.length > 20 && (
                    <TableRow>
                      <TableCell
                        colSpan={Object.keys(columnMap).length + 1}
                        className="text-center text-xs text-muted-foreground py-3"
                      >
                        ...and {parsedRows.length - 20} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("map")}>
                <ArrowLeft className="size-4 mr-2" strokeWidth={1.5} />
                Back
              </Button>
              <Button onClick={runImport} disabled={importing}>
                {importing ? (
                  <>
                    <Spinner className="mr-2 size-4" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="size-4 mr-2" strokeWidth={1.5} />
                    {mode === "donors"
                      ? `Import ${parsedRows.filter((r) => r.display_name).length} Donors`
                      : `Import ${parsedRows.filter((r) => r.amount && r.date).length} Donations`}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImportResults({
  result,
  onReset,
}: {
  result: ImportResult | DonationImportResult
  onReset: () => void
}) {
  // Donations-history results have a different shape — render a compact variant
  if (!("donorsCreated" in result)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" strokeWidth={1.5} />
            Import Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Donations Created" value={result.donationsCreated} />
            <StatCard label="Rows Skipped" value={result.rowsSkipped} />
          </div>

          {result.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" strokeWidth={1.5} />
              <AlertDescription>
                {result.errors.length} row(s) had errors:
                <ul className="mt-1 list-disc list-inside text-xs">
                  {result.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                  {result.errors.length > 10 && (
                    <li>...and {result.errors.length - 10} more</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onReset}>
              <X className="size-4 mr-2" strokeWidth={1.5} />
              Import Another File
            </Button>
            <Button asChild>
              <a href="/dashboard/donations">View Donations</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-500" strokeWidth={1.5} />
          Import Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Donors Created" value={result.donorsCreated} />
          <StatCard label="Donors Updated" value={result.donorsUpdated} />
          <StatCard label="Donations Created" value={result.donationsCreated} />
        </div>

        {result.capReached && result.donorsSkipped > 0 && (
          <Alert>
            <AlertCircle className="size-4" strokeWidth={1.5} />
            <AlertDescription>
              <strong>{result.donorsSkipped.toLocaleString()} donors skipped.</strong>{" "}
              Your plan is capped at {result.planMaxDonors.toLocaleString()} donors.{" "}
              <a href="/settings?tab=billing" className="underline">
                Upgrade
              </a>{" "}
              to import the rest.
            </AlertDescription>
          </Alert>
        )}

        {result.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" strokeWidth={1.5} />
            <AlertDescription>
              {result.errors.length} row(s) had errors:
              <ul className="mt-1 list-disc list-inside text-xs">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {result.errors.length > 10 && (
                  <li>...and {result.errors.length - 10} more</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onReset}>
            <X className="size-4 mr-2" strokeWidth={1.5} />
            Import Another File
          </Button>
          <Button asChild>
            <a href="/dashboard?view=crm">View Donors</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <p className="text-2xl font-semibold">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  )
}

function StepIndicator({
  label,
  active,
  done,
  number,
}: {
  label: string
  active: boolean
  done: boolean
  number: number
}) {
  return (
    <div className={`flex items-center gap-1.5 ${active ? "text-foreground font-medium" : ""}`}>
      <span
        className={`flex size-6 items-center justify-center rounded-full text-xs font-medium ${
          done
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? "✓" : number}
      </span>
      <span>{label}</span>
    </div>
  )
}

function ChevronSep() {
  return (
    <ArrowRight className="size-3 text-muted-foreground/50" strokeWidth={1.5} />
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize various date formats to YYYY-MM-DD. */
function normalizeDate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // Try MM/DD/YYYY or M/D/YYYY
  const mdyMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }

  // Fallback: let Date parse it
  const parsed = new Date(trimmed)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0]
  }

  return null
}
