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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatCurrency } from "@/lib/format"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

export type DonorTag = { id: string; name: string; color: string }

export type Donor = {
  id: string
  display_name: string | null
  total_lifetime_value: number | string | null
  last_donation_amount: number | string | null
  last_donation_date: string | null
  first_donation_date?: string | null
  billing_address: string | null
  state: string | null
  notes: string | null
  tags?: DonorTag[]
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function tagBadgeStyle(color: string) {
  const styles: Record<string, { bg: string; text: string }> = {
    red: { bg: "rgb(254 226 226)", text: "rgb(153 27 27)" },
    blue: { bg: "rgb(219 234 254)", text: "rgb(29 78 216)" },
    green: { bg: "rgb(220 252 231)", text: "rgb(20 83 45)" },
    orange: { bg: "rgb(255 237 213)", text: "rgb(154 52 18)" },
  }
  return styles[color] ?? { bg: "rgb(243 244 246)", text: "rgb(55 65 81)" }
}

export function createDonorColumns(options: {
  onOpenDonorSheet: (donorId: string) => void
}): ColumnDef<Donor>[] {
  const { onOpenDonorSheet } = options

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
      accessorKey: "display_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const donor = row.original
        return (
          <button
            type="button"
            className="text-primary hover:underline font-medium text-left"
            onClick={(e) => {
              e.stopPropagation()
              onOpenDonorSheet(donor.id)
            }}
          >
            {donor.display_name ?? "Unknown"}
          </button>
        )
      },
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const tags = (row.original.tags ?? []) as DonorTag[]
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => {
              const style = tagBadgeStyle(t.color)
              return (
                <Badge
                  key={t.id}
                  variant="secondary"
                  className="text-xs font-normal border-0"
                  style={{
                    backgroundColor: style.bg,
                    color: style.text,
                  }}
                >
                  {t.name}
                </Badge>
              )
            })}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "last_donation_amount",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Last Gift Amount"
          className="justify-end"
        />
      ),
      cell: ({ row }) => {
        const donor = row.original
        return (
          <div className="text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="text-primary hover:underline"
              aria-label={`View donor profile for gift of ${formatCurrency(donor.last_donation_amount)}`}
              onClick={() => onOpenDonorSheet(donor.id)}
            >
              {formatCurrency(donor.last_donation_amount)}
            </button>
          </div>
        )
      },
    },
    {
      accessorKey: "last_donation_date",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Last Gift Date"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {formatDate(row.original.last_donation_date)}
        </div>
      ),
    },
    {
      accessorKey: "total_lifetime_value",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Lifetime Amount"
          className="justify-end"
        />
      ),
      cell: ({ row }) => {
        const donor = row.original
        return (
          <div className="text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="text-primary hover:underline"
              aria-label={`View donor profile for lifetime value of ${formatCurrency(donor.total_lifetime_value)}`}
              onClick={() => onOpenDonorSheet(donor.id)}
            >
              {formatCurrency(donor.total_lifetime_value)}
            </button>
          </div>
        )
      },
    },
    {
      accessorKey: "billing_address",
      header: "Address",
      cell: ({ row }) => (
        <span className="text-muted-foreground max-w-64 truncate block">
          {row.original.billing_address ?? "—"}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const donor = row.original
        return (
          <div onClick={(e) => e.stopPropagation()} className="w-[50px]">
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
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onOpenDonorSheet(donor.id)}>
                  View profile
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
