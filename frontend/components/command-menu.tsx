"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Map,
  MapPin,
  Route,
  Settings,
  Users,
} from "lucide-react"

import { searchDonors, type SearchDonorResult } from "@/app/actions/search"
import { useNav } from "@/components/nav-context"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Spinner } from "@/components/ui/spinner"

const DEBOUNCE_MS = 200

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

type CommandMenuContextType = {
  open: boolean
  setOpen: (open: boolean) => void
}

const CommandMenuContext = React.createContext<CommandMenuContextType | undefined>(undefined)

export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <CommandMenuContext.Provider value={{ open, setOpen }}>
      {children}
    </CommandMenuContext.Provider>
  )
}

export function useCommandMenu() {
  const ctx = React.useContext(CommandMenuContext)
  if (ctx === undefined) {
    throw new Error("useCommandMenu must be used within CommandMenuProvider")
  }
  return ctx
}

export function CommandMenu() {
  const router = useRouter()
  const { setActiveView } = useNav()
  const { open, setOpen } = useCommandMenu()
  const [search, setSearch] = React.useState("")
  const [donors, setDonors] = React.useState<SearchDonorResult[]>([])
  const [donorsLoading, setDonorsLoading] = React.useState(false)
  const debouncedSearch = useDebouncedValue(search, DEBOUNCE_MS)

  React.useEffect(() => {
    if (!debouncedSearch.trim()) {
      setDonors([])
      return
    }
    let cancelled = false
    setDonorsLoading(true)
    searchDonors(debouncedSearch)
      .then((result) => {
        if (!cancelled) setDonors(result)
      })
      .finally(() => {
        if (!cancelled) setDonorsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedSearch])

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) setSearch("")
    },
    [setOpen]
  )

  const run = React.useCallback(
    (fn: () => void) => {
      setOpen(false)
      fn()
    },
    [setOpen]
  )

  const goToDonor = React.useCallback(
    (id: string) => {
      run(() => router.push(`/donors/${id}`))
    },
    [run, router]
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Command Center"
      description="Navigate, search donors, or run quick actions"
      value={search}
      onValueChange={setSearch}
      filter={() => 1}
    >
      <CommandInput placeholder="Type a command or search donors..." />
      <CommandList className="max-h-[320px]">
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => run(() => setActiveView("dashboard"))}
          >
            <LayoutDashboard className="mr-2 size-4" />
            Dashboard
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => setActiveView("donor-crm"))}
          >
            <Users className="mr-2 size-4" />
            Donor CRM
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => setActiveView("donor-map"))}
          >
            <Map className="mr-2 size-4" />
            Donor Map
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => router.push("/dashboard/routes"))}
          >
            <Route className="mr-2 size-4" />
            Route Planner
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => setActiveView("settings"))}
          >
            <Settings className="mr-2 size-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => run(() => setActiveView("donor-crm"))}
          >
            <Users className="mr-2 size-4" />
            Add New Donor
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => router.push("/dashboard/routes"))}
          >
            <MapPin className="mr-2 size-4" />
            Plan a Route
          </CommandItem>
        </CommandGroup>
        {search.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Donors">
              {donorsLoading ? (
                <CommandItem disabled>
                  <Spinner className="mr-2 size-4" />
                  Searching…
                </CommandItem>
              ) : donors.length === 0 ? (
                <CommandItem disabled>
                  No donors found
                </CommandItem>
              ) : (
                donors.map((d) => (
                  <CommandItem
                    key={d.id}
                    onSelect={() => goToDonor(d.id)}
                  >
                    <Users className="mr-2 size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {d.display_name ?? "Unknown"}
                    </span>
                    {d.total_lifetime_value != null && (
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {typeof d.total_lifetime_value === "number"
                          ? `$${d.total_lifetime_value.toLocaleString()}`
                          : `$${Number(d.total_lifetime_value).toLocaleString()}`}
                      </span>
                    )}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
