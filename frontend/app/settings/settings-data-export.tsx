"use client"

import * as React from "react"
import { Download, Mail } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const EXPORTS = [
  { type: "donors", label: "Donors" },
  { type: "donations", label: "Donations" },
  { type: "interactions", label: "Interactions" },
] as const

type ExportType = (typeof EXPORTS)[number]["type"]

function filenameFrom(res: Response, fallback: string): string {
  const match = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)
  return match?.[1] ?? fallback
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string }
    return body.message ?? body.error ?? "Please try again."
  } catch {
    return "Please try again."
  }
}

/**
 * "Export your data": CSV downloads of donors, donations and interactions
 * (GET /api/export) plus an emailed copy of all three (POST
 * /api/account/export). Both routes stay reachable when the org is locked —
 * see BILLING_EXEMPT_API in proxy.ts — so a canceled customer can always
 * take their data with them.
 */
export function SettingsDataExport({ className }: { className?: string }) {
  const [downloading, setDownloading] = React.useState<ExportType | null>(null)
  const [emailing, setEmailing] = React.useState(false)

  async function download(type: ExportType) {
    setDownloading(type)
    try {
      const res = await fetch(`/api/export?type=${type}`)
      if (!res.ok) {
        toast.error("Export failed", { description: await errorMessage(res) })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filenameFrom(res, `vantage-${type}.csv`)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Export failed", { description: "Check your connection and try again." })
    } finally {
      setDownloading(null)
    }
  }

  async function emailAll() {
    setEmailing(true)
    try {
      const res = await fetch("/api/account/export", { method: "POST" })
      if (!res.ok) {
        toast.error("Couldn't send the export", { description: await errorMessage(res) })
        return
      }
      toast.success("Export on its way", {
        description: "We emailed all three CSV files to your account email.",
      })
    } catch {
      toast.error("Couldn't send the export", { description: "Check your connection and try again." })
    } finally {
      setEmailing(false)
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Export your data</CardTitle>
        <CardDescription>
          Download your organization&apos;s records as CSV files you can open in Excel or import
          elsewhere. Available any time, including after you cancel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {EXPORTS.map(({ type, label }) => (
          <Button
            key={type}
            variant="outline"
            className="gap-2"
            disabled={downloading !== null}
            onClick={() => download(type)}
          >
            <Download className="size-4" strokeWidth={1.5} />
            {downloading === type ? "Preparing…" : label}
          </Button>
        ))}
        <Button variant="ghost" className="gap-2" disabled={emailing} onClick={emailAll}>
          <Mail className="size-4" strokeWidth={1.5} />
          {emailing ? "Sending…" : "Email me all three"}
        </Button>
      </CardContent>
    </Card>
  )
}
