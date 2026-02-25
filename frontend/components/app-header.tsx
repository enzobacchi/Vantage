"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconDotsVertical,
  IconLogout,
  IconMessageCircle,
  IconMoon,
  IconNotification,
  IconSearch,
  IconSun,
  IconUserCircle,
} from "@tabler/icons-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { getOrganization } from "@/app/actions/settings"
import { FeedbackDialog } from "@/components/feedback-dialog"
import { useCommandMenu } from "@/components/command-menu"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useNav } from "@/components/nav-context"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function getInitials(name: string, email: string): string {
  const trimmed = name.trim()
  if (!trimmed) return email ? email.slice(0, 2).toUpperCase() : "?"
  const parts = trimmed.split(/\s+/).filter(Boolean)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : trimmed.slice(0, 2).toUpperCase()
}

export function AppHeader() {
  const { setOpen: openCommandMenu } = useCommandMenu()
  const { user: authUser, loading } = useAuthUser()
  const { setActiveView } = useNav()
  const router = useRouter()
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [orgName, setOrgName] = React.useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [profileOpen, setProfileOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [profileData, setProfileData] = React.useState({ name: "", email: "", role: "Admin" })

  const user = authUser ?? { name: "User", email: "", avatar: "" }
  const initials = getInitials(user.name, user.email)
  const isDark = mounted && resolvedTheme === "dark"

  React.useEffect(() => { setMounted(true) }, [])

  React.useEffect(() => {
    getOrganization().then((org) => {
      if (org?.name) setOrgName(org.name)
    }).catch(() => {})
  }, [])

  React.useEffect(() => {
    setProfileData((prev) => ({ ...prev, name: user.name, email: user.email }))
  }, [user.name, user.email])

  const handleSaveProfile = async () => {
    const trimmedName = profileData.name.trim()
    if (!trimmedName) {
      toast.error("Name required", { description: "Please enter your full name." })
      return
    }
    setSaving(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { error } = await supabase.auth.updateUser({ data: { full_name: trimmedName } })
      if (error) {
        toast.error("Could not save profile", { description: error.message })
        return
      }
      toast.success("Profile updated")
      setProfileOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center border-b border-border/50 bg-background px-4 gap-3">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0 mr-1 dark:invert">
          <svg viewBox="0 0 100 100" className="h-7 w-7 text-zinc-800" fill="currentColor">
            <path d="M50 5L95 50L50 95L5 50Z"/>
            <path d="M30 42L70 42L50 68Z" fill="white"/>
          </svg>
          <span className="text-lg font-bold tracking-tight text-zinc-800">vantage</span>
        </Link>

        {/* Org name */}
        {orgName && (
          <span className="hidden sm:block text-sm text-zinc-400 border-l border-zinc-200 pl-3 shrink-0 truncate max-w-48">
            {orgName}
          </span>
        )}

        <div className="flex-1" />

        {/* Search */}
        <Button
          variant="outline"
          className="h-9 w-52 justify-start text-muted-foreground bg-muted/30 border-border/60 shadow-none text-sm font-normal"
          onClick={() => openCommandMenu(true)}
        >
          <IconSearch className="mr-2 size-4 shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

        {/* Feedback */}
        <Button
          variant="ghost"
          size="sm"
          className="text-sm text-zinc-500 hover:text-zinc-900 px-3"
          onClick={() => setFeedbackOpen(true)}
        >
          Feedback
        </Button>

        {/* Theme toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {isDark ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isDark ? "Light mode" : "Dark mode"}
          </TooltipContent>
        </Tooltip>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2 h-9 rounded-lg">
              <Avatar className="h-7 w-7 rounded-lg grayscale">
                <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.name} />
                <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm font-medium max-w-32 truncate">
                {loading ? "…" : user.name}
              </span>
              <IconDotsVertical className="size-4 text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56 rounded-lg" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <IconUserCircle />
                My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveView("settings")}>
                <IconNotification />
                Notifications
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
                <IconMessageCircle />
                Help & Feedback
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
            <DialogDescription>Manage your account information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="header-profile-name">Full Name</Label>
              <Input
                id="header-profile-name"
                value={profileData.name}
                onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="header-profile-email">Email</Label>
              <Input
                id="header-profile-email"
                type="email"
                value={profileData.email}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="header-profile-role">Role</Label>
              <Input id="header-profile-role" value={profileData.role} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">
                Role cannot be changed. Contact your administrator.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)} className="bg-transparent" disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveProfile} className="bg-slate-900 hover:bg-slate-800 text-white" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
