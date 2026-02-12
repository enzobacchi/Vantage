"use client"

import * as React from "react"
import { IconPlus, IconTrash } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export interface Task {
  id: string
  title: string
  is_completed: boolean
  created_at: string
}

export function RecentActivity() {
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [newTaskTitle, setNewTaskTitle] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [adding, setAdding] = React.useState(false)

  const fetchTasks = React.useCallback(async () => {
    try {
      const res = await fetch("/api/tasks")
      if (!res.ok) {
        setTasks([])
        return
      }
      const data = (await res.json()) as { tasks?: Task[] }
      setTasks(data.tasks ?? [])
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const addTask = async () => {
    const title = newTaskTitle.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        console.error(err.error ?? "Failed to add task")
        return
      }
      const data = (await res.json()) as { task: Task }
      setTasks((prev) => [data.task, ...prev])
      setNewTaskTitle("")
    } finally {
      setAdding(false)
    }
  }

  const toggleTask = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "PATCH" })
      if (!res.ok) return
      const data = (await res.json()) as { task: Task }
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? data.task : t))
      )
    } catch {
      // revert optimistic update if needed; we didn't do one
    }
  }

  const deleteTask = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" })
      if (!res.ok) return
      setTasks((prev) => prev.filter((t) => t.id !== id))
    } catch {
      // ignore
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      addTask()
    }
  }

  return (
    <Card className="h-full bg-gradient-to-t from-primary/5 to-card shadow-xs">
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        <CardDescription>Your action items</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Add a new task..."
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={addTask}
            disabled={!newTaskTitle.trim() || adding}
          >
            <IconPlus className="size-4" />
            <span className="sr-only">Add task</span>
          </Button>
        </div>
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading tasks…</p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 group"
              >
                <Checkbox
                  id={`task-${task.id}`}
                  checked={task.is_completed}
                  onCheckedChange={() => toggleTask(task.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor={`task-${task.id}`}
                    className={`text-sm font-medium leading-none cursor-pointer ${
                      task.is_completed
                        ? "line-through text-muted-foreground"
                        : ""
                    }`}
                  >
                    {task.title}
                  </label>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => deleteTask(task.id)}
                >
                  <IconTrash className="size-4" />
                  <span className="sr-only">Delete task</span>
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
