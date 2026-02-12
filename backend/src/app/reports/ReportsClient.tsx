"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";

type SavedReport = {
  id: string;
  title: string;
  filter_criteria: unknown;
  created_at: string;
};

type DonorRow = {
  id: string;
  display_name: string | null;
  billing_address: string | null;
  total_lifetime_value: number | null;
  last_donation_date: string | null;
};

function toCsvValue(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function donorsToCsv(donors: DonorRow[]) {
  const headers = ["Name", "LTV", "Last Gift", "Address"];
  const rows = donors.map((d) => [
    d.display_name ?? "",
    d.total_lifetime_value ?? "",
    d.last_donation_date ?? "",
    d.billing_address ?? "",
  ]);
  return [headers, ...rows].map((r) => r.map(toCsvValue).join(",")).join("\n");
}

function downloadTextFile(filename: string, contents: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatCurrency(value: number | null) {
  const n = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function ReportsClient({ initialReports }: { initialReports: SavedReport[] }) {
  const [reports, setReports] = useState(initialReports);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SavedReport | null>(null);
  const [rows, setRows] = useState<DonorRow[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const activeTitle = active?.title ?? "Report";

  const activeCsv = useMemo(() => (rows ? donorsToCsv(rows) : ""), [rows]);

  async function refreshReports() {
    const res = await fetch("/api/reports");
    const json = (await res.json()) as { reports?: SavedReport[] };
    if (res.ok) setReports(json.reports ?? []);
  }

  async function openReport(report: SavedReport) {
    setActive(report);
    setOpen(true);
    setRows(null);
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(report.id)}/run`);
      const json = (await res.json()) as { donors?: DonorRow[]; error?: string; details?: string };
      if (!res.ok) {
        throw new Error(json.error ?? json.details ?? "Failed to run report.");
      }
      setRows((json.donors ?? []).map((d) => ({
        id: String(d.id),
        display_name: d.display_name ?? null,
        billing_address: d.billing_address ?? null,
        total_lifetime_value: d.total_lifetime_value ?? null,
        last_donation_date: d.last_donation_date ?? null,
      })));
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to run report.");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <Button variant="outline" size="sm" onClick={refreshReports}>
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((r) => (
            <button key={r.id} className="text-left" onClick={() => openReport(r)}>
              <Card className="h-full transition-colors hover:border-zinc-900">
                <CardHeader>
                  <CardTitle className="text-base">{r.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-600">
                  Saved {new Date(r.created_at).toLocaleString()}
                </CardContent>
              </Card>
            </button>
          ))}

          {reports.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No saved reports yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-700">
                In Chat, generate a report and click “Save to Reports”.
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-full sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>{activeTitle}</SheetTitle>
            </SheetHeader>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-sm text-zinc-600">
                {status === "loading"
                  ? "Loading results…"
                  : rows
                    ? `Found ${rows.length} donors`
                    : "No results yet"}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!rows || rows.length === 0}
                onClick={() => downloadTextFile("donor_report.csv", activeCsv)}
              >
                Download CSV
              </Button>
            </div>

            {status === "error" ? (
              <div className="mt-4 rounded-md border bg-white p-3 text-sm text-red-600">
                {error ?? "Failed to run report."}
              </div>
            ) : null}

            {rows ? (
              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>LTV</TableHead>
                      <TableHead>Last Gift</TableHead>
                      <TableHead>Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.display_name ?? "Unknown"}</TableCell>
                        <TableCell>{formatCurrency(d.total_lifetime_value)}</TableCell>
                        <TableCell>{d.last_donation_date ?? "N/A"}</TableCell>
                        <TableCell className="max-w-[360px] truncate">
                          {d.billing_address ?? "N/A"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

