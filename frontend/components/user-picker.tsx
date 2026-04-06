"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { OrgMember } from "@/app/actions/team"

interface UserPickerProps {
  members: OrgMember[]
  selected: string[]
  onChange: (ids: string[]) => void
  excludeUserId?: string
}

export function UserPicker({ members, selected, onChange, excludeUserId }: UserPickerProps) {
  const [open, setOpen] = React.useState(false)

  const filteredMembers = excludeUserId
    ? members.filter((m) => m.user_id !== excludeUserId)
    : members

  const toggle = (userId: string) => {
    if (selected.includes(userId)) {
      onChange(selected.filter((id) => id !== userId))
    } else {
      onChange([...selected, userId])
    }
  }

  const selectedCount = selected.length
  const label =
    selectedCount === 0
      ? "Select people..."
      : selectedCount === 1
        ? filteredMembers.find((m) => m.user_id === selected[0])?.name || "1 person"
        : `${selectedCount} people`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            {label}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search team members..." />
          <CommandList>
            <CommandEmpty>No members found.</CommandEmpty>
            <CommandGroup>
              {filteredMembers.map((member) => (
                <CommandItem
                  key={member.user_id}
                  value={`${member.name} ${member.email}`}
                  onSelect={() => toggle(member.user_id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected.includes(member.user_id) ? "opacity-100" : "opacity-0"
                    )}
                    strokeWidth={1.5}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-sm">{member.name || "Unnamed"}</span>
                    <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
