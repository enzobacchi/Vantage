"use client"

import * as React from "react"
import { UserCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type AssigneeForFilter = { user_id: string; name: string; email: string }

export const UNASSIGNED_VALUE = "__unassigned__"

export type DonorAssigneeFilterProps = {
  assignees: AssigneeForFilter[]
  selectedAssigneeIds: Set<string>
  onSelectedAssigneeIdsChange: (next: Set<string>) => void
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DonorAssigneeFilter({
  assignees,
  selectedAssigneeIds,
  onSelectedAssigneeIdsChange,
  disabled,
  open,
  onOpenChange,
}: DonorAssigneeFilterProps) {
  const toggle = (id: string) => {
    const next = new Set(selectedAssigneeIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedAssigneeIdsChange(next)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-9"
          disabled={disabled}
        >
          <UserCircle2 className="size-4 shrink-0" />
          Filter by Assignee
          {selectedAssigneeIds.size > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              {selectedAssigneeIds.size}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-0">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm">Filter by Assignee</h4>
          <p className="text-muted-foreground text-xs mt-0.5">
            Show only donors assigned to the selected people.
          </p>
        </div>
        <div className="p-3 max-h-[280px] overflow-y-auto">
          <div className="space-y-1">
            <label className="flex items-center gap-2 cursor-pointer rounded-md hover:bg-muted/50 px-2 py-1.5">
              <Checkbox
                checked={selectedAssigneeIds.has(UNASSIGNED_VALUE)}
                onCheckedChange={() => toggle(UNASSIGNED_VALUE)}
              />
              <span className="text-sm italic text-muted-foreground">Unassigned</span>
            </label>
            {assignees.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-1.5">
                No other team members yet. Invite teammates from Settings → Team.
              </p>
            ) : (
              assignees.map((a) => (
                <label
                  key={a.user_id}
                  className="flex items-center gap-2 cursor-pointer rounded-md hover:bg-muted/50 px-2 py-1.5"
                >
                  <Checkbox
                    checked={selectedAssigneeIds.has(a.user_id)}
                    onCheckedChange={() => toggle(a.user_id)}
                  />
                  <span className="text-sm truncate">{a.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
