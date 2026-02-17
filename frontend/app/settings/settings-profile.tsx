"use client"

import * as React from "react"
import { IconLock } from "@tabler/icons-react"
import { toast } from "sonner"

import { updateProfile } from "@/app/actions/settings"
import { useAuthUser } from "@/hooks/use-auth-user"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function getInitials(name: string, email: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) return email ? email.slice(0, 2).toUpperCase() : "?"
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return trimmed.slice(0, 2).toUpperCase()
}

export function SettingsProfile() {
  const { user, loading } = useAuthUser()
  const [saving, setSaving] = React.useState(false)
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")

  React.useEffect(() => {
    if (!user) return
    const parts = (user.name || "").trim().split(/\s+/).filter(Boolean)
    setFirstName(parts[0] ?? "")
    setLastName(parts.slice(1).join(" ") ?? "")
  }, [user])

  const handleSave = async () => {
    try {
      setSaving(true)
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        avatar_url: user.avatar ?? "",
      })
      await createBrowserSupabaseClient().auth.refreshSession()
      toast.success("Profile updated")
    } catch (e) {
      toast.error("Failed to save", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast.error("No email on file for this account")
      return
    }
    try {
      const supabase = createBrowserSupabaseClient()
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/login`,
      })
      if (error) throw error
      toast.success("Check your email", {
        description: "We sent a password reset link to " + user.email,
      })
    } catch (e) {
      toast.error("Failed to send reset link", {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </div>
    )
  }

  const initials = getInitials(user.name, user.email)

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium">My Profile</h3>
        <p className="text-[0.8rem] text-muted-foreground mt-0.5">
          Manage your account details and how you appear in the app.
        </p>
      </div>

      <div className="space-y-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <Avatar className="size-20 shrink-0 rounded-xl">
            <AvatarImage src={user.avatar || undefined} alt={user.name} />
            <AvatarFallback className="rounded-xl text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  First name
                </Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Last name
                </Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Email
              </Label>
              <p className="text-[0.8rem] text-muted-foreground mt-1.5">
                Email cannot be changed here. Contact support if you need to update it.
              </p>
              <Input
                id="email"
                type="email"
                value={user.email}
                readOnly
                disabled
                className="mt-2 h-9 bg-muted"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="default" className="h-9 rounded-md px-4" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button variant="outline" size="default" className="h-9 rounded-md px-4 gap-2" onClick={handleChangePassword}>
            <IconLock className="size-4" />
            Change password
          </Button>
        </div>
      </div>
    </div>
  )
}
