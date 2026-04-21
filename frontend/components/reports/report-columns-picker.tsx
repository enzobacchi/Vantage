"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  ALL_REPORT_COLUMNS,
  REPORT_COLUMN_GROUPS,
} from "@/lib/report-columns"

export type ReportColumnsPickerProps = {
  value: string[]
  onChange: (next: string[]) => void
  label?: string
}

export function ReportColumnsPicker({
  value,
  onChange,
  label = "Columns to include",
}: ReportColumnsPickerProps) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id])
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
        <button
          type="button"
          className="underline hover:text-foreground"
          onClick={() => onChange([...ALL_REPORT_COLUMNS])}
        >
          Select all
        </button>
        <span>·</span>
        <button
          type="button"
          className="underline hover:text-foreground"
          onClick={() => onChange([])}
        >
          Clear all
        </button>
      </div>
      <div className="space-y-3 rounded-md border p-3 max-h-[220px] overflow-y-auto">
        {REPORT_COLUMN_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">
              {group.title}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {group.columns.map((col) => (
                <label
                  key={col.id}
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={value.includes(col.id)}
                    onCheckedChange={() => toggle(col.id)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
