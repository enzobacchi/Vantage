"use client"

import * as React from "react"
import { IconCopy, IconUserPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  createInvitation,
  getCanManageTeam,
  getCurrentMemberInfo,
  getOrganizationMembers,
  getPendingInvitations,
  revokeInvitation,
  sendInviteEmail,
  updateMemberRole,
  type Invitation,
  type OrgMember,
} from "@/app/actions/team"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function SettingsTeam() {
  const [members, setMembers] = React.useState<OrgMember[]>([])
  const [invitations, setInvitations] = React.useState<Invitation[]>([])
  const [canManage, setCanManage] = React.useState(false)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [currentRole, setCurrentRole] = React.useState<string>("")
  const [loading, setLoading] = React.useState(true)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<"admin" | "member">("member")
  const [generatedLink, setGeneratedLink] = React.useState("")
  const [generating, setGenerating] = React.useState(false)
  const [updatingRoleId, setUpdatingRoleId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const [m, inv, can, me] = await Promise.all([
        getOrganizationMembers(),
        getPendingInvitations(),
        getCanManageTeam(),
        getCurrentMemberInfo(),
      ])
      setMembers(m)
      setInvitations(inv)
      setCanManage(can)
      setCurrentUserId(me?.userId ?? null)
      setCurrentRole(me?.role ?? "")
    } catch {
      toast.error("Failed to load team")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleRoleChange = async (memberId: string, newRole: "owner" | "admin" | "member") => {
    setUpdatingRoleId(memberId)
    const result = await updateMemberRole(memberId, newRole)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Role updated")
      await load()
    }
    setUpdatingRoleId(null)
  }

  const handleGenerateInvite = async () => {
    const result = await createInvitation(inviteEmail, inviteRole)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setGenerating(true)
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "")
    const fullUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}${result.link}` : result.link
    setGeneratedLink(fullUrl)
    const emailResult = await sendInviteEmail(inviteEmail.trim(), fullUrl, inviteRole)
    setGenerating(false)
    await load()
    if (emailResult.error) {
      toast.warning(`Invite created, but email could not be sent: ${emailResult.error}. Copy the link below to share.`)
    } else {
      toast.success(`Invite sent to ${inviteEmail.trim()}. They can also use the link below.`)
    }
  }

  const handleCopyLink = () => {
    if (!generatedLink) return
    navigator.clipboard.writeText(generatedLink)
    toast.success("Link copied to clipboard")
  }

  const handleRevoke = async (id: string) => {
    const result = await revokeInvitation(id)
    if (result.error) toast.error(result.error)
    else {
      toast.success("Invitation revoked")
      await load()
    }
  }

  const isOwner = currentRole === "owner"

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium">Team</h3>
        <p className="text-[0.8rem] text-muted-foreground mt-0.5">
          Manage members and invite others to your organization.
        </p>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogTrigger asChild>
          <Button size="default" className="h-9 rounded-md px-4 gap-2">
            <IconUserPlus className="size-4" />
            Invite
          </Button>
        </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite to team</DialogTitle>
              <DialogDescription>
                We'll send an invite link to their email. They sign in or sign up, then join.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as "admin" | "member")}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {generatedLink ? (
                <div className="space-y-2">
                  <Label>Invite link</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={generatedLink}
                      className="h-9 text-xs font-mono"
                    />
                    <Button type="button" variant="outline" size="icon" className="h-9 shrink-0" onClick={handleCopyLink}>
                      <IconCopy className="size-4" />
                      <span className="sr-only">Copy</span>
                    </Button>
                  </div>
                  <p className="text-[0.8rem] text-muted-foreground">
                    Link expires in 48 hours. An email was sent to them; you can also copy the link to share.
                  </p>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={handleGenerateInvite}
                  disabled={!inviteEmail.trim() || generating}
                  className="w-full"
                >
                  {generating ? "Sending…" : "Send invite"}
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>
                {generatedLink ? "Done" : "Cancel"}
              </Button>
              {generatedLink && (
                <Button
                  onClick={() => {
                    setGeneratedLink("")
                    setInviteEmail("")
                    setInviteRole("member")
                  }}
                >
                  Create another
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      {!canManage && (
        <p className="text-[0.8rem] text-muted-foreground">
          Only owners and admins can invite new members.
        </p>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-medium">Name</TableHead>
              <TableHead className="font-medium">Email</TableHead>
              <TableHead className="font-medium">Role</TableHead>
              <TableHead className="font-medium">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-sm py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-sm py-8">
                  No members yet.
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => {
                const isSelf = m.user_id === currentUserId
                const canChangeRole = isOwner && !isSelf
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.name}
                      {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      {canChangeRole ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => handleRoleChange(m.id, v as "owner" | "admin" | "member")}
                          disabled={updatingRoleId === m.id}
                        >
                          <SelectTrigger className="h-8 w-28 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="capitalize text-sm">{m.role}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(m.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {invitations.length > 0 && canManage && (
        <div>
          <h4 className="text-sm font-medium mb-2">Pending invitations</h4>
          <ul className="space-y-2 rounded-lg border p-3">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {inv.email} <span className="text-muted-foreground">({inv.role})</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive hover:text-destructive"
                  onClick={() => handleRevoke(inv.id)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
