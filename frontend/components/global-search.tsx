"use client"

import * as React from "react"
import {
  IconDashboard,
  IconFileText,
  IconMap,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconUsers,
} from "@tabler/icons-react"

import { useNav } from '@/components/nav-context'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false)
  const { setActiveView } = useNav()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  return (
    <>
      <Button
        variant="outline"
        className="bg-transparent text-muted-foreground relative h-9 w-full justify-start rounded-md text-sm font-normal shadow-none"
        onClick={() => setOpen(true)}
      >
        <IconSearch className="mr-2 size-4" />
        <span className="inline-flex">Search...</span>
        <kbd className="bg-muted pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => runCommand(() => setActiveView("dashboard"))}>
              <IconDashboard className="mr-2 size-4" />
              Dashboard
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setActiveView("donor-crm"))}>
              <IconUsers className="mr-2 size-4" />
              Donor CRM
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setActiveView("donor-map"))}>
              <IconMap className="mr-2 size-4" />
              Donor Map
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setActiveView("ai-agent"))}>
              <IconSparkles className="mr-2 size-4" />
              Ask AI
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setActiveView("saved-reports"))}>
              <IconFileText className="mr-2 size-4" />
              Saved Reports
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setActiveView("settings"))}>
              <IconSettings className="mr-2 size-4" />
              Settings
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Quick Actions">
            <CommandItem onSelect={() => runCommand(() => setActiveView("ai-agent"))}>
              <IconSparkles className="mr-2 size-4" />
              Generate Report with AI
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setActiveView("donor-crm"))}>
              <IconUsers className="mr-2 size-4" />
              Add New Donor
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
