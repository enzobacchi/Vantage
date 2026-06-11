"use client"

import * as React from "react"
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  createApiKey,
  getApiAccess,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRow,
} from "@/app/actions/api-keys"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

function formatDate(value: string | null): string {
  if (!value) return "Never"
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return "—"
  }
}

export function SettingsApiKeys() {
  const [loading, setLoading] = React.useState(true)
  const [hasAccess, setHasAccess] = React.useState(false)
  const [keys, setKeys] = React.useState<ApiKeyRow[]>([])
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [createdKey, setCreatedKey] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const [access, list] = await Promise.all([getApiAccess(), listApiKeys()])
      setHasAccess(access)
      setKeys(list)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  async function handleCreate() {
    try {
      setCreating(true)
      const { plaintext } = await createApiKey(newName)
      setCreatedKey(plaintext)
      setNewName("")
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create API key")
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(key: ApiKeyRow) {
    try {
      await revokeApiKey(key.id)
      toast.success(`Revoked "${key.name}"`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke API key")
    }
  }

  async function copyKey() {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey)
    toast.success("API key copied")
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-5" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">API Keys</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Authenticate requests to the Vantage REST API. Keys grant read access
          to your organization&apos;s contacts and donations — treat them like
          passwords.{" "}
          <a
            href="/docs/api"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            View API documentation
          </a>
        </p>
      </div>

      {!hasAccess ? (
        <Alert>
          <KeyRound className="size-4" strokeWidth={1.5} />
          <AlertDescription>
            API access is available on the Growth plan and above.{" "}
            <a href="/settings?tab=billing" className="underline">
              Upgrade your plan
            </a>{" "}
            to create API keys.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Active Keys</CardTitle>
              <CardDescription>
                Send keys as <code className="text-xs">Authorization: Bearer vk_live_...</code>
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1.5" strokeWidth={1.5} />
              Create Key
            </Button>
          </CardHeader>
          <CardContent>
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No API keys yet. Create one to start integrating.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{k.name}</span>
                        <Badge variant="secondary" className="text-xs font-mono">
                          {k.key_prefix}…
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {k.scopes.join(", ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Created {formatDate(k.created_at)} · Last used {formatDate(k.last_used_at)}
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                          <Trash2 className="size-3.5 text-destructive" strokeWidth={1.5} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke &quot;{k.name}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Requests using this key will immediately start
                            failing with 401. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <Button variant="destructive" onClick={() => handleRevoke(k)}>
                            Revoke
                          </Button>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o) setCreatedKey(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Your API Key</DialogTitle>
                <DialogDescription>
                  Copy it now — you won&apos;t be able to see it again.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 py-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-xs font-mono break-all">
                  {createdKey}
                </code>
                <Button variant="outline" size="icon" onClick={copyKey}>
                  <Copy className="size-4" strokeWidth={1.5} />
                </Button>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setCreateOpen(false)
                    setCreatedKey(null)
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  Name the key after what will use it (e.g. &quot;AMI website&quot;).
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 py-2">
                <Label htmlFor="api-key-name">Name</Label>
                <Input
                  id="api-key-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Website integration"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) handleCreate()
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                  {creating ? "Creating..." : "Create Key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
