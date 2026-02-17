"use client"

import * as React from "react"
import { IconCopy, IconUserPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  createInvitation,
  getCanManageTeam,
  getOrganizationMembers,
  getPendingInvitations,
  revokeInvitation,
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
  const [loading, setLoading] = React.useState(true)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<"admin" | "member">("member")
  const [generatedLink, setGeneratedLink] = React.useState("")
  const [generating, setGenerating] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const [m, inv, can] = await Promise.all([
        getOrganizationMembers(),
        getPendingInvitations(),
        getCanManageTeam(),
      ])
      setMembers(m)
      setInvitations(inv)
      setCanManage(can)
    } catch {
      toast.error("Failed to load team")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleGenerateInvite = async () => {
    const result = await createInvitation(inviteEmail, inviteRole)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setGenerating(true)
    const fullUrl =
      typeof window !== "undefined" ? `${window.location.origin}${result.link}` : result.link
    setGeneratedLink(fullUrl)
    setGenerating(false)
    await load()
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
                Send an invite link. They must sign in or sign up, then they can join.
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
                    Link expires in 48 hours. Share it with the invitee.
                  </p>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={handleGenerateInvite}
                  disabled={!inviteEmail.trim() || generating}
                  className="w-full"
                >
                  {generating ? "Generating…" : "Generate invite link"}
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
              members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell className="capitalize">{m.role}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(m.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))
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
