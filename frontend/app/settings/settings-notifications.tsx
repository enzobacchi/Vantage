"use client"

import * as React from "react"
import { Bell } from "lucide-react"
import { toast } from "sonner"
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPrefsUpdate,
} from "@/app/actions/notifications"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

type PrefKey = keyof NotificationPrefsUpdate

type PrefItem = {
  key: PrefKey
  label: string
  description: string
}

const EMAIL_PREFS: PrefItem[] = [
  {
    key: "email_new_donation",
    label: "New donations",
    description: "Get notified when a new donation is recorded",
  },
  {
    key: "email_donor_milestone",
    label: "Donor milestones",
    description: "Alerts when donors reach giving milestones",
  },
  {
    key: "email_weekly_digest",
    label: "Weekly digest",
    description: "AI-powered weekly summary with giving trends, notable activity, and recommended actions",
  },
  {
    key: "email_team_activity",
    label: "Team activity",
    description: "Notify when team members make changes",
  },
  {
    key: "email_system_alerts",
    label: "System alerts",
    description: "Important system notifications (sync failures, security alerts)",
  },
]

const INAPP_PREFS: PrefItem[] = [
  {
    key: "inapp_new_donation",
    label: "New donations",
    description: "Show in-app notification for new donations",
  },
  {
    key: "inapp_task_reminders",
    label: "Task reminders",
    description: "Remind you about upcoming and overdue tasks",
  },
  {
    key: "inapp_donor_lapsed",
    label: "Lapsed donor alerts",
    description: "Alert when donors become lapsed (no gift in 12+ months)",
  },
]

export function SettingsNotifications() {
  const [prefs, setPrefs] = React.useState<Record<PrefKey, boolean> | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState<PrefKey | null>(null)

  React.useEffect(() => {
    getNotificationPreferences()
      .then((p) => {
        const mapped: Record<PrefKey, boolean> = {
          email_new_donation: p.email_new_donation,
          email_donor_milestone: p.email_donor_milestone,
          email_weekly_digest: p.email_weekly_digest,
          email_team_activity: p.email_team_activity,
          email_system_alerts: p.email_system_alerts,
          inapp_new_donation: p.inapp_new_donation,
          inapp_task_reminders: p.inapp_task_reminders,
          inapp_donor_lapsed: p.inapp_donor_lapsed,
        }
        setPrefs(mapped)
      })
      .catch(() => toast.error("Failed to load notification preferences"))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(key: PrefKey, checked: boolean) {
    if (!prefs) return
    setSaving(key)
    const previous = prefs[key]
    setPrefs((p) => (p ? { ...p, [key]: checked } : p))
    try {
      await updateNotificationPreferences({ [key]: checked })
    } catch {
      setPrefs((p) => (p ? { ...p, [key]: previous } : p))
      toast.error("Failed to update preference")
    } finally {
      setSaving(null)
    }
  }

  function renderSection(title: string, description: string, items: PrefItem[]) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <Label htmlFor={item.key} className="text-sm font-medium cursor-pointer">
                  {item.label}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
              </div>
              {loading || !prefs ? (
                <Skeleton className="h-5 w-9 rounded-full" />
              ) : (
                <Switch
                  id={item.key}
                  checked={prefs[item.key]}
                  onCheckedChange={(checked) => handleToggle(item.key, checked)}
                  disabled={saving === item.key}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 shrink-0" strokeWidth={1.5} />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Choose how and when you want to be notified about activity in your organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {renderSection(
          "Email Notifications",
          "Sent to your account email address",
          EMAIL_PREFS
        )}
        <Separator />
        {renderSection(
          "In-App Notifications",
          "Shown within the Vantage dashboard",
          INAPP_PREFS
        )}
      </CardContent>
    </Card>
  )
}
