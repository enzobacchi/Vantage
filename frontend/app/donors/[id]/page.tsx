import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { DonorNotesCard } from "@/components/donors/donor-notes-card"
import { LetterDialog } from "@/components/donors/letter-dialog"
import { MagicActionsCard } from "@/components/donors/magic-actions-card"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getDonorActivityNotes, getDonorProfile } from "./actions"

const EIGHTEEN_MONTHS_MS = 18 * 30 * 24 * 60 * 60 * 1000

function isActive(lastDonationDate: string | null): boolean {
  if (!lastDonationDate) return false
  const t = new Date(lastDonationDate).getTime()
  return Date.now() - t <= EIGHTEEN_MONTHS_MS
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value == null) return "—"
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

type PageProps = { params: Promise<{ id: string }> }

export default async function DonorProfilePage({ params }: PageProps) {
  const { id } = await params
  const [{ donor, donations }, activityNotes] = await Promise.all([
    getDonorProfile(id),
    getDonorActivityNotes(id),
  ])

  if (!donor) {
    notFound()
  }

  const active = isActive(donor.last_donation_date)
  const totalLtv = donor.total_lifetime_value
  const ltvNum =
    totalLtv != null
      ? typeof totalLtv === "number"
        ? totalLtv
        : Number(totalLtv)
      : 0
  const count = donations.length
  const averageGift = count > 0 && Number.isFinite(ltvNum) ? ltvNum / count : 0

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href="/dashboard?view=donor-crm" aria-label="Back to list">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight truncate">
            {donor.display_name ?? "Unknown Donor"}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge
              variant={active ? "default" : "secondary"}
              className={active ? "bg-emerald-600 hover:bg-emerald-600" : ""}
            >
              {active ? "Active" : "Lapsed"}
            </Badge>
          </div>
        </div>
        <LetterDialog
          donorId={donor.id}
          defaultYear={new Date().getFullYear() - 1}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lifetime Value</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(donor.total_lifetime_value)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Gift</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatDate(donor.last_donation_date)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Gift</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(averageGift)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>Email, phone, and address on file</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Email:</span>{" "}
            {donor.email ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Phone:</span>{" "}
            {donor.phone ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Address:</span>{" "}
            {donor.billing_address ?? "—"}
          </p>
        </CardContent>
      </Card>

      <DonorNotesCard donorId={donor.id} initialNotes={donor.notes} />

      <MagicActionsCard
        donorId={donor.id}
        donorName={donor.display_name ?? "Unknown Donor"}
      />

      <Card>
        <CardHeader>
          <CardTitle>Donation History</CardTitle>
          <CardDescription>
            {count} donation{count === 1 ? "" : "s"} on file
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Memo / Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {donations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground text-center py-8">
                    No donations recorded.
                  </TableCell>
                </TableRow>
              ) : (
                donations.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {formatDate(d.date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(d.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-md truncate">
                      {d.memo ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            Call notes and touchpoints logged from Magic Actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No activity logged yet. Use &quot;Log Call&quot; in Magic Actions to record a note.
            </p>
          ) : (
            <ul className="space-y-3">
              {activityNotes.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-0.5 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </span>
                  <p className="whitespace-pre-wrap">{entry.note}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
