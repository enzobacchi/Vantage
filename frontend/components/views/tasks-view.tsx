"use client"

import * as React from "react"
import Link from "next/link"
import { CheckSquare, Circle, CheckCircle2, Plus } from "lucide-react"
import { toast } from "sonner"

import { getAllTasks, toggleTaskStatus, logInteraction, type TaskWithDonor } from "@/app/actions/crm"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

type StatusFilter = "pending" | "completed" | "all"

export function TasksView() {
  const [tasks, setTasks] = React.useState<TaskWithDonor[]>([])
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("pending")
  const [togglingId, setTogglingId] = React.useState<string | null>(null)

  const loadTasks = React.useCallback(async (status: StatusFilter) => {
    setLoading(true)
    try {
      const data = await getAllTasks(status)
      setTasks(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tasks")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadTasks(statusFilter)
  }, [statusFilter, loadTasks])

  const handleToggle = async (id: string) => {
    setTogglingId(id)
    try {
      await toggleTaskStatus(id)
      await loadTasks(statusFilter)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update task")
    } finally {
      setTogglingId(null)
    }
  }

  const pendingCount = tasks.filter((t) => t.status === "pending").length
  const completedCount = tasks.filter((t) => t.status === "completed").length

  return (
    <div className="flex flex-col gap-4 py-4 md:py-6">
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <CheckSquare className="size-5 text-foreground" strokeWidth={1.5} />
        <h1 className="text-xl font-semibold">Tasks</h1>
      </div>

      <Card className="mx-4 lg:mx-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Tasks</CardTitle>
              <CardDescription>
                Manage tasks and reminders across all donors
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="task-status-filter" className="text-sm font-medium whitespace-nowrap">
                Status
              </Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger id="task-status-filter" className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="all">All Tasks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {statusFilter === "all" && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{pendingCount} pending</span>
                <span>{completedCount} completed</span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading tasks...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckSquare className="size-8 text-muted-foreground/50 mb-3" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                {statusFilter === "pending"
                  ? "No pending tasks. You're all caught up!"
                  : statusFilter === "completed"
                    ? "No completed tasks yet."
                    : "No tasks found."}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Add tasks from a donor's profile using the Log Activity button.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors",
                    task.status === "completed"
                      ? "bg-muted/20 opacity-70"
                      : "bg-card hover:bg-muted/30"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleToggle(task.id)}
                    disabled={togglingId === task.id}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {task.status === "completed" ? (
                      <CheckCircle2 className="size-5 text-emerald-500" strokeWidth={1.5} />
                    ) : (
                      <Circle className="size-5" strokeWidth={1.5} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        task.status === "completed" && "line-through text-muted-foreground"
                      )}
                    >
                      {task.subject || task.content || "Untitled task"}
                    </p>
                    {task.content && task.subject && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {task.content}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      {task.donor_name && (
                        <Link
                          href={`/dashboard/donors/${task.donor_id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {task.donor_name}
                        </Link>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(task.date)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
