import { cn } from "@/lib/utils"

/**
 * A compact meter for tables and lists: a small bar plus "fill / capacity".
 * Green when the donor is ready for an ask.
 */
export function MiniMeter({
  fill,
  capacity,
  ready,
  className,
}: {
  fill: number
  capacity: number
  ready: boolean
  className?: string
}) {
  const percent = capacity > 0 ? Math.min(100, Math.round((fill / capacity) * 100)) : 0
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="meter"
        aria-label="Touchpoint meter"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(fill, capacity)}
        aria-valuetext={`${fill} of ${capacity} points${ready ? ", ready to ask" : ""}`}
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", ready ? "bg-emerald-500 dark:bg-emerald-400" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={cn(
          "min-w-[4.25rem] whitespace-nowrap text-xs tabular-nums", // fixed width keeps bars aligned down a list
          ready ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
        )}
      >
        {fill} / {capacity}
      </span>
    </div>
  )
}
