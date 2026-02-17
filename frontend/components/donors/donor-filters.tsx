"use client"

import * as React from "react"
import { IconBadge, IconTag } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import type { LifecycleConfig, LifecycleStatus } from "@/lib/donor-lifecycle"

export type TagForFilter = { id: string; name: string; color: string }

export type DonorTagFilterProps = {
  tags: TagForFilter[]
  selectedTagIds: Set<string>
  onSelectedTagIdsChange: (next: Set<string>) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DonorTagFilter({
  tags,
  selectedTagIds,
  onSelectedTagIdsChange,
  open,
  onOpenChange,
}: DonorTagFilterProps) {
  const toggle = (tagId: string) => {
    const next = new Set(selectedTagIds)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    onSelectedTagIdsChange(next)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <IconTag className="size-4 shrink-0" />
          Filter by Tag
          {selectedTagIds.size > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              {selectedTagIds.size}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-0">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm">Filter by Tag</h4>
          <p className="text-muted-foreground text-xs mt-0.5">
            Show only donors who have at least one of the selected tags.
          </p>
        </div>
        <div className="p-3 max-h-[280px] overflow-y-auto">
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags yet. Add tags on a donor profile.</p>
          ) : (
            <div className="space-y-1">
              {tags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex items-center gap-2 cursor-pointer rounded-md hover:bg-muted/50 px-2 py-1.5"
                >
                  <Checkbox
                    checked={selectedTagIds.has(tag.id)}
                    onCheckedChange={() => toggle(tag.id)}
                  />
                  <span
                    className={`inline-block size-2.5 rounded-full shrink-0 ${
                      tag.color === "red"
                        ? "bg-red-500"
                        : tag.color === "blue"
                          ? "bg-blue-500"
                          : tag.color === "green"
                            ? "bg-green-500"
                            : tag.color === "orange"
                              ? "bg-orange-500"
                              : "bg-gray-500"
                    }`}
                  />
                  <span className="text-sm">{tag.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const BADGE_OPTIONS: { value: LifecycleStatus | "Major"; label: string }[] = [
  { value: "New", label: "New" },
  { value: "Active", label: "Active" },
  { value: "Lapsed", label: "Lapsed" },
  { value: "Lost", label: "Lost" },
  { value: "Major", label: "Major Donor" },
]

export type DonorFilterState = {
  visibleBadges: Set<string>
  badgeConfig: LifecycleConfig
}

const DEFAULT_BADGE_CONFIG: LifecycleConfig = {
  newDonorMonths: 6,
  lapsedMonths: 12,
  majorDonorThreshold: 5000,
}

export type DonorBadgesProps = {
  /** Which badge types to show on donors (visibility only; does not filter rows). */
  visibleBadges: Set<string>
  onVisibleBadgesChange: (next: Set<string>) => void
  badgeConfig: LifecycleConfig
  onBadgeConfigChange: (next: LifecycleConfig) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DonorBadges({
  visibleBadges,
  onVisibleBadgesChange,
  badgeConfig,
  onBadgeConfigChange,
  open,
  onOpenChange,
}: DonorBadgesProps) {
  const [localNewMonths, setLocalNewMonths] = React.useState(
    String(badgeConfig.newDonorMonths ?? 6)
  )
  const [localLapsedMonths, setLocalLapsedMonths] = React.useState(
    String(badgeConfig.lapsedMonths ?? 12)
  )
  const [localMajor, setLocalMajor] = React.useState(
    String(badgeConfig.majorDonorThreshold ?? 5000)
  )

  React.useEffect(() => {
    setLocalNewMonths(String(badgeConfig.newDonorMonths ?? 6))
    setLocalLapsedMonths(String(badgeConfig.lapsedMonths ?? 12))
    setLocalMajor(String(badgeConfig.majorDonorThreshold ?? 5000))
  }, [badgeConfig.newDonorMonths, badgeConfig.lapsedMonths, badgeConfig.majorDonorThreshold])

  const toggleBadge = (value: string) => {
    const next = new Set(visibleBadges)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onVisibleBadgesChange(next)
  }

  const applyBadgeConfig = React.useCallback(() => {
    const newMonths = parseInt(localNewMonths, 10)
    const lapsedMonths = parseInt(localLapsedMonths, 10)
    const major = parseInt(localMajor, 10)
    onBadgeConfigChange({
      newDonorMonths: Number.isFinite(newMonths) && newMonths > 0 ? newMonths : DEFAULT_BADGE_CONFIG.newDonorMonths,
      lapsedMonths: Number.isFinite(lapsedMonths) && lapsedMonths > 0 ? lapsedMonths : DEFAULT_BADGE_CONFIG.lapsedMonths,
      majorDonorThreshold: Number.isFinite(major) && major >= 0 ? major : DEFAULT_BADGE_CONFIG.majorDonorThreshold,
    })
  }, [localNewMonths, localLapsedMonths, localMajor, onBadgeConfigChange])

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <IconBadge className="size-4 shrink-0" />
          Badges
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0">
        {/* Section A: Which badges to show on donors (visual only) */}
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm">Show these badges on donors</h4>
          <p className="text-muted-foreground text-xs mt-0.5 mb-2">
            Select which badges to display. When none are selected, no badges are shown. Use the Sort menu to filter or order the list.
          </p>
          <div className="space-y-1">
            {BADGE_OPTIONS.map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-2 cursor-pointer rounded-md hover:bg-muted/50 px-2 py-1.5"
              >
                <Checkbox
                  checked={visibleBadges.has(value)}
                  onCheckedChange={() => toggleBadge(value)}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Section B: Customize each badge */}
        <div className="p-3 bg-muted/20">
          <h4 className="font-medium text-sm">Customize badges</h4>
          <p className="text-muted-foreground text-xs mt-0.5 mb-3">
            Change how each badge is defined.
          </p>
          <div className="space-y-3">
            <div>
              <Label htmlFor="badge-new-months" className="text-xs">
                New — last gift within (months)
              </Label>
              <Input
                id="badge-new-months"
                type="number"
                min={1}
                max={24}
                className="h-8 mt-1"
                value={localNewMonths}
                onChange={(e) => setLocalNewMonths(e.target.value)}
                onBlur={applyBadgeConfig}
              />
            </div>
            <div>
              <Label htmlFor="badge-lapsed-months" className="text-xs">
                Lapsed — no gift in (months)
              </Label>
              <Input
                id="badge-lapsed-months"
                type="number"
                min={1}
                max={60}
                className="h-8 mt-1"
                value={localLapsedMonths}
                onChange={(e) => setLocalLapsedMonths(e.target.value)}
                onBlur={applyBadgeConfig}
              />
            </div>
            <div>
              <Label htmlFor="badge-major-threshold" className="text-xs">
                Major Donor — lifetime value &gt; $
              </Label>
              <Input
                id="badge-major-threshold"
                type="number"
                min={0}
                step={1000}
                className="h-8 mt-1"
                value={localMajor}
                onChange={(e) => setLocalMajor(e.target.value)}
                onBlur={applyBadgeConfig}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DEFAULT_BADGE_CONFIG }
