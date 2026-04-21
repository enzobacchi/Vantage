"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { OrgAssignee } from "@/app/actions/team"

const UNASSIGNED = "__unassigned__"

export type DonorAssigneeSelectProps = {
  assignees: OrgAssignee[]
  value: string | null
  onChange: (userId: string | null) => void | Promise<void>
  disabled?: boolean
  placeholder?: string
  triggerClassName?: string
}

/**
 * Single-select dropdown for picking an assignee (or "Unassigned") from the
 * current org's members. Emits null when "Unassigned" is chosen.
 */
export function DonorAssigneeSelect({
  assignees,
  value,
  onChange,
  disabled,
  placeholder = "Unassigned",
  triggerClassName,
}: DonorAssigneeSelectProps) {
  const selected = value ?? UNASSIGNED

  return (
    <Select
      value={selected}
      onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>
          <span className="italic text-muted-foreground">Unassigned</span>
        </SelectItem>
        {assignees.map((a) => (
          <SelectItem key={a.user_id} value={a.user_id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
