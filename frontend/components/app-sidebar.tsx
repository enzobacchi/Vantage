"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import {
  Banknote,
  Building2,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  Map,
  FileText,
  Route,
  Settings,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { getOrganization } from "@/app/actions/settings"
import { FeedbackDialog } from "@/components/feedback-dialog"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useNav } from "@/components/nav-context"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

function SidebarLogo({ logoUrl, alt }: { logoUrl: string | null | undefined; alt: string }) {
  const [useFallback, setUseFallback] = React.useState(false)
  const showCustomLogo = logoUrl && !useFallback
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
      {showCustomLogo ? (
        <img
          src={logoUrl}
          alt={alt}
          className="h-8 w-8 object-contain"
          onError={() => setUseFallback(true)}
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-200">
          <Building2 className="size-5 text-zinc-500" strokeWidth={1.5} />
        </div>
      )}
    </div>
  )
}

function getInitials(name: string, email: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    if (email) return email.slice(0, 2).toUpperCase()
    return "?"
  }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { user: authUser } = useAuthUser()
  const user = authUser ?? { name: "User", email: "", avatar: "" }
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setActiveView, setActiveViewOnly } = useNav()
  const { isMobile, state: sidebarState } = useSidebar()

  const [org, setOrg] = React.useState<{ name: string | null; logo_url: string | null } | null>(null)
  const [profileOpen, setProfileOpen] = React.useState(false)
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [profileData, setProfileData] = React.useState({
    name: user.name,
    email: user.email,
    role: "Admin",
  })
  const initials = getInitials(user.name, user.email)

  const isDonorMapActive =
    pathname === "/dashboard" && searchParams.get("view") === "donor-map"

  const isDonationsActive =
    (pathname === "/dashboard" && searchParams.get("view") === "donations") ||
    pathname === "/dashboard/donations/entry"

  React.useEffect(() => {
    setProfileData((prev) => ({
      ...prev,
      name: user.name,
      email: user.email,
    }))
  }, [user.name, user.email])

  React.useEffect(() => {
    getOrganization()
      .then((data) => {
        if (data) setOrg({ name: data.name, logo_url: data.logo_url })
      })
      .catch(() => {})
  }, [])

  const handleSaveProfile = async () => {
    const trimmedName = profileData.name.trim()
    if (!trimmedName) {
      toast.error("Name required", {
        description: "Please enter your full name.",
      })
      return
    }
    setSaving(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { error } = await supabase.auth.updateUser({
        data: { full_name: trimmedName },
      })
      if (error) {
        toast.error("Could not save profile", {
          description: error.message,
        })
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

  const handleNotificationsClick = () => {
    setActiveView("settings")
    if (pathname !== "/dashboard") {
      router.push("/dashboard?view=settings")
    }
  }

  const isActive = (view: string | null, url?: string) => {
    if (url) {
      return pathname === url
    }
    if (view === "dashboard") {
      return pathname === "/dashboard" && !searchParams.get("view")
    }
    return pathname === "/dashboard" && searchParams.get("view") === view
  }

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/dashboard" className="flex items-center gap-2">
                  <SidebarLogo
                    logoUrl={org?.logo_url}
                    alt={org?.name ?? "Organization"}
                  />
                  {sidebarState !== "collapsed" && (
                    <span className="truncate font-semibold">
                      {org?.name?.trim() || "Vantage"}
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Dashboard"
                    isActive={isActive("dashboard")}
                    asChild
                  >
                    <Link
                      href="/dashboard"
                      onClick={() => setActiveViewOnly("dashboard")}
                    >
                      <LayoutDashboard />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Donor CRM"
                    isActive={isActive("donor-crm")}
                    asChild
                  >
                    <Link
                      href="/dashboard?view=donor-crm"
                      onClick={() => setActiveViewOnly("donor-crm")}
                    >
                      <Users />
                      <span>Donor CRM</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <Collapsible
                  defaultOpen={isDonorMapActive || pathname === "/dashboard/routes"}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Donor Map">
                        <Map />
                        <span>Donor Map</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive("donor-map")}
                          >
                            <Link
                              href="/dashboard?view=donor-map"
                              onClick={() => setActiveViewOnly("donor-map")}
                            >
                              <span>Map View</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === "/dashboard/routes"}
                          >
                            <Link href="/dashboard/routes">
                              <Route />
                              <span>Route Planner</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>

                <Collapsible
                  defaultOpen={isDonationsActive}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Donations">
                        <Banknote />
                        <span>Donations</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive("donations")}
                          >
                            <Link
                              href="/dashboard?view=donations"
                              onClick={() => setActiveViewOnly("donations")}
                            >
                              <Banknote />
                              <span>View Donations</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === "/dashboard/donations/entry"}
                          >
                            <Link href="/dashboard/donations/entry">
                              <DollarSign />
                              <span>Log Donation</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Saved Reports"
                    isActive={isActive("saved-reports")}
                    asChild
                  >
                    <Link
                      href="/dashboard?view=saved-reports"
                      onClick={() => setActiveViewOnly("saved-reports")}
                    >
                      <FileText />
                      <span>Saved Reports</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <div className="flex-1" />
          <div className="border-t border-sidebar-border my-1 group-data-[collapsible=icon]:mx-2" />
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Settings" asChild>
                    <Link href="/settings">
                      <Settings />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage
                        src={user.avatar || "/placeholder.svg"}
                        alt={user.name}
                      />
                      <AvatarFallback className="rounded-lg">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side={isMobile ? "bottom" : "right"}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage
                          src={user.avatar || "/placeholder.svg"}
                          alt={user.name}
                        />
                        <AvatarFallback className="rounded-lg">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">{user.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                      My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleNotificationsClick}>
                      Notifications
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
                      Help & Feedback
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
            <DialogDescription>
              Manage your account information
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="profile-name">Full Name</Label>
              <Input
                id="profile-name"
                value={profileData.name}
                onChange={(e) =>
                  setProfileData({ ...profileData, name: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={profileData.email}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-role">Role</Label>
              <Input
                id="profile-role"
                value={profileData.role}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Role cannot be changed. Contact your administrator.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProfileOpen(false)}
              className="bg-transparent"
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfile}
              className="bg-slate-900 hover:bg-slate-800 text-white"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
