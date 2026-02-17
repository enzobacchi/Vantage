"use client"

import * as React from "react"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"

import {
  assignTag,
  createTag,
  getDonorTags,
  getOrganizationTags,
  removeTag,
  type Tag,
} from "@/app/actions/tags"
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

const TAG_COLORS = [
  { value: "red", label: "Red", class: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-0" },
  { value: "blue", label: "Blue", class: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-0" },
  { value: "green", label: "Green", class: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-0" },
  { value: "orange", label: "Orange", class: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-0" },
  { value: "gray", label: "Gray", class: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-0" },
] as const

function badgeClassForColor(color: string): string {
  const c = TAG_COLORS.find((x) => x.value === color)
  return c?.class ?? TAG_COLORS[TAG_COLORS.length - 1].class
}

export function DonorTagsCard({ donorId }: { donorId: string }) {
  const [tags, setTags] = React.useState<Tag[]>([])
  const [allTags, setAllTags] = React.useState<Tag[]>([])
  const [open, setOpen] = React.useState(false)
  const [creating, setCreating] = React.useState<{ name: string } | null>(null)
  const [loading, setLoading] = React.useState(true)

  const loadTags = React.useCallback(async () => {
    setLoading(true)
    try {
      const [donorTags, orgTags] = await Promise.all([
        getDonorTags(donorId),
        getOrganizationTags(),
      ])
      setTags(donorTags)
      setAllTags(orgTags)
    } finally {
      setLoading(false)
    }
  }, [donorId])

  React.useEffect(() => {
    loadTags()
  }, [loadTags])

  const donorTagIds = React.useMemo(() => new Set(tags.map((t) => t.id)), [tags])

  const handleAssign = async (tag: Tag) => {
    try {
      await assignTag(donorId, tag.id)
      setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]))
      setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]))
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add tag")
    }
  }

  const handleCreateAndAssign = async (name: string, color: string) => {
    try {
      const newTag = await createTag(name, color)
      await assignTag(donorId, newTag.id)
      setTags((prev) => [...prev, newTag])
      setAllTags((prev) => [...prev, newTag])
      setCreating(null)
      setOpen(false)
      toast.success(`Tag "${name}" created and added`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create tag")
    }
  }

  const handleRemove = async (tagId: string) => {
    try {
      await removeTag(donorId, tagId)
      setTags((prev) => prev.filter((t) => t.id !== tagId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove tag")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
        <CardDescription>
          Custom labels for this donor (e.g. Board Member, Volunteer). Filter the donor list by these tags.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading tags…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className={`${badgeClassForColor(tag.color)} gap-1 pr-1`}
                >
                  {tag.name}
                  <button
                    type="button"
                    aria-label={`Remove ${tag.name}`}
                    className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                    onClick={() => handleRemove(tag.id)}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreating(null) }}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1">
                    <Plus className="size-4" />
                    Add Tag
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[280px] p-0">
                  {creating ? (
                    <div className="p-3">
                      <p className="text-sm font-medium mb-2">Create &quot;{creating.name}&quot;</p>
                      <p className="text-xs text-muted-foreground mb-2">Pick a color:</p>
                      <div className="flex flex-wrap gap-2">
                        {TAG_COLORS.map(({ value, label, class: cls }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleCreateAndAssign(creating.name, value)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium border ${cls}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => setCreating(null)}
                      >
                        Back
                      </Button>
                    </div>
                  ) : (
                    <TagCommand
                      allTags={allTags}
                      donorTagIds={donorTagIds}
                      onSelect={(tag) => handleAssign(tag)}
                      onCreate={(name) => setCreating({ name })}
                    />
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TagCommand({
  allTags,
  donorTagIds,
  onSelect,
  onCreate,
}: {
  allTags: Tag[]
  donorTagIds: Set<string>
  onSelect: (tag: Tag) => void
  onCreate: (name: string) => void
}) {
  const [search, setSearch] = React.useState("")
  const trimmed = search.trim().toLowerCase()
  const existingMatch = trimmed
    ? allTags.find((t) => t.name.toLowerCase() === trimmed)
    : null
  const showCreate = trimmed.length > 0 && !existingMatch
  const filtered = trimmed
    ? allTags.filter((t) => t.name.toLowerCase().includes(trimmed))
    : allTags

  return (
    <Command shouldFilter={false} className="rounded-lg border-0 shadow-none">
      <CommandInput
        placeholder="Search or type new tag name…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {showCreate && (
          <CommandGroup heading="Create new">
            <CommandItem onSelect={() => onCreate(search.trim())}>
              Create &quot;{search.trim()}&quot;
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading={showCreate ? "Existing tags" : "Tags"}>
          {filtered.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No tags yet. Type a name above to create one.
            </div>
          ) : (
            filtered.map((tag) => {
              const assigned = donorTagIds.has(tag.id)
              return (
                <CommandItem
                  key={tag.id}
                  onSelect={() => !assigned && onSelect(tag)}
                  disabled={assigned}
                  className={assigned ? "opacity-60" : ""}
                >
                  <span
                    className={`mr-2 size-2 rounded-full shrink-0 ${badgeClassForColor(tag.color).split(" ")[0]}`}
                  />
                  {tag.name}
                  {assigned && <span className="ml-1 text-xs text-muted-foreground">(added)</span>}
                </CommandItem>
              )
            })
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
