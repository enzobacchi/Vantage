import { Telescope } from "lucide-react"

import { cn } from "@/lib/utils"

/** Scout — the Vantage Agent's mascot mark: a telescope on the Vantage green→cyan disc. */
export function ScoutAvatar({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#007A3F] to-[#21E0D6]",
        className
      )}
    >
      <Telescope className={cn("size-3.5 text-white", iconClassName)} strokeWidth={1.5} />
    </div>
  )
}
