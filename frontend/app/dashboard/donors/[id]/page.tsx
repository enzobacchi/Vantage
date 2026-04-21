"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Circle,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Save,
  Send,
  UserCircle2,
  X,
} from "lucide-react"

import {
  getDonorProfile,
  getDonorActivityNotes,
  type DonorProfileDonor,
  type DonorProfileDonation,
  type DonorNoteRow,
} from "@/app/donors/[id]/actions"
import { getDonorInteractions, logInteraction, toggleTaskStatus } from "@/app/actions/crm"
import { updateDonor, type UpdateDonorInput } from "@/app/actions/donors"
import type { Interaction } from "@/types/database"
import { EmailComposeDialog } from "@/components/email/email-compose-dialog"
import { DonorInsightsPanel } from "@/components/donors/donor-insights-panel"
import { DonorHealthScoreCard } from "@/components/donors/donor-health-score"
import { DonorNotesCard } from "@/components/donors/donor-notes-card"
import { DonorPledgesCard } from "@/components/donors/donor-pledges-card"
import { DonorTagsCard } from "@/components/donors/donor-tags-card"
import { DonorAssigneeSelect } from "@/components/donors/donor-assignee-select"
import { getOrgAssignees, type OrgAssignee } from "@/app/actions/team"
import { formatCurrency } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

function interactionIcon(type: Interaction["type"]) {
  switch (type) {
    case "call":
      return <Phone className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
    case "email":
      return <Mail className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
    case "meeting":
      return <Calendar className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
    case "task":
      return <CheckSquare className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
    default:
      return <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
  }
}

/* ───────── Edit Contact Dialog ───────── */

function EditContactDialog({
  donor,
  open,
  onOpenChange,
  onSaved,
}: {
  donor: DonorProfileDonor
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = React.useState({
    display_name: donor.display_name ?? "",
    first_name: donor.first_name ?? "",
    last_name: donor.last_name ?? "",
    email: donor.email ?? "",
    phone: donor.phone ?? "",
    billing_address: donor.billing_address ?? "",
    city: donor.city ?? "",
    state: donor.state ?? "",
    zip: donor.zip ?? "",
    mailing_address: donor.mailing_address ?? "",
    mailing_city: donor.mailing_city ?? "",
    mailing_state: donor.mailing_state ?? "",
    mailing_zip: donor.mailing_zip ?? "",
    donor_type: donor.donor_type ?? "individual",
    acquisition_source: donor.acquisition_source ?? "",
  })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setForm({
        display_name: donor.display_name ?? "",
        first_name: donor.first_name ?? "",
        last_name: donor.last_name ?? "",
        email: donor.email ?? "",
        phone: donor.phone ?? "",
        billing_address: donor.billing_address ?? "",
        city: donor.city ?? "",
        state: donor.state ?? "",
        zip: donor.zip ?? "",
        mailing_address: donor.mailing_address ?? "",
        mailing_city: donor.mailing_city ?? "",
        mailing_state: donor.mailing_state ?? "",
        mailing_zip: donor.mailing_zip ?? "",
        donor_type: donor.donor_type ?? "individual",
        acquisition_source: donor.acquisition_source ?? "",
      })
    }
  }, [open, donor])

  const handleSave = async () => {
    if (!form.display_name.trim()) {
      toast.error("Display name is required")
      return
    }
    setSaving(true)
    try {
      await updateDonor(donor.id, {
        display_name: form.display_name,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        billing_address: form.billing_address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        mailing_address: form.mailing_address || null,
        mailing_city: form.mailing_city || null,
        mailing_state: form.mailing_state || null,
        mailing_zip: form.mailing_zip || null,
        donor_type: form.donor_type as UpdateDonorInput["donor_type"],
        acquisition_source: form.acquisition_source || null,
      })
      toast.success("Donor profile updated")
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update donor")
    } finally {
      setSaving(false)
    }
  }

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Donor Profile</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="edit-display-name">Display Name</Label>
            <Input
              id="edit-display-name"
              value={form.display_name}
              onChange={(e) => update("display_name", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-first-name">First Name</Label>
              <Input
                id="edit-first-name"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-last-name">Last Name</Label>
              <Input
                id="edit-last-name"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="donor@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-address">Physical Address</Label>
            <Input
              id="edit-address"
              value={form.billing_address}
              onChange={(e) => update("billing_address", e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="edit-city">City</Label>
              <Input
                id="edit-city"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-state">State</Label>
              <Input
                id="edit-state"
                value={form.state}
                onChange={(e) => update("state", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-zip">ZIP</Label>
              <Input
                id="edit-zip"
                value={form.zip}
                onChange={(e) => update("zip", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-mailing-address">Mailing Address</Label>
            <Input
              id="edit-mailing-address"
              value={form.mailing_address}
              onChange={(e) => update("mailing_address", e.target.value)}
              placeholder="PO Box 456"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="edit-mailing-city">City</Label>
              <Input
                id="edit-mailing-city"
                value={form.mailing_city}
                onChange={(e) => update("mailing_city", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-mailing-state">State</Label>
              <Input
                id="edit-mailing-state"
                value={form.mailing_state}
                onChange={(e) => update("mailing_state", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-mailing-zip">ZIP</Label>
              <Input
                id="edit-mailing-zip"
                value={form.mailing_zip}
                onChange={(e) => update("mailing_zip", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-donor-type">Donor Type</Label>
            <Select
              value={form.donor_type}
              onValueChange={(v) => update("donor_type", v)}
            >
              <SelectTrigger id="edit-donor-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="school">School</SelectItem>
                <SelectItem value="church">Church</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-acquisition-source">Acquisition Source</Label>
            <Input
              id="edit-acquisition-source"
              value={form.acquisition_source}
              onChange={(e) => update("acquisition_source", e.target.value)}
              placeholder="e.g. event, referral, website"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ───────── Log Activity Dialog ───────── */

function LogActivityDialog({
  donorId,
  donorEmail,
  defaultTab = "call",
  onLogged,
}: {
  donorId: string
  donorEmail: string | null
  defaultTab?: "call" | "email" | "task"
  onLogged: () => void
}) {
  const [activeTab, setActiveTab] = React.useState<"call" | "email" | "task">(defaultTab)
  const [subject, setSubject] = React.useState("")
  const [content, setContent] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  const reset = () => {
    setSubject("")
    setContent("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (activeTab === "email") {
      if (!subject.trim()) { setError("Please enter a subject."); return }
      if (!content.trim()) { setError("Please enter the email message."); return }
      if (!donorEmail?.trim()) { toast.error("This donor has no email address on file."); return }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ donorEmail: donorEmail.trim(), subject: subject.trim(), message: content.trim(), donorId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(data?.error ?? "Failed to send email"); setError(data?.error ?? "Failed to send email"); return }
        reset()
        onLogged()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to send email"
        toast.error(msg)
        setError(msg)
      } finally {
        setLoading(false)
      }
      return
    }

    if (activeTab === "task") {
      if (!subject.trim()) { setError("Please enter a task."); return }
    } else if (!content.trim()) {
      setError("Please enter notes or content."); return
    }

    setLoading(true)
    setError(null)
    try {
      await logInteraction({
        donor_id: donorId,
        type: activeTab,
        direction: activeTab === "task" ? undefined : "outbound",
        subject: subject.trim() || undefined,
        content: activeTab === "task" ? (content.trim() || subject.trim()) : content.trim(),
        status: activeTab === "task" ? "pending" : undefined,
      })
      reset()
      onLogged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Log Activity</DialogTitle>
      </DialogHeader>
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "call" | "email" | "task"); reset() }}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="call">Log Call</TabsTrigger>
          <TabsTrigger value="email">Send Email</TabsTrigger>
          <TabsTrigger value="task">Add Task</TabsTrigger>
        </TabsList>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <TabsContent value="call" className="mt-0 space-y-4">
            <div>
              <Label htmlFor="dp-call-subject">Subject (optional)</Label>
              <Input id="dp-call-subject" className="mt-1" placeholder="e.g. Building fund follow-up" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="dp-call-content">Notes</Label>
              <Textarea id="dp-call-content" className="mt-1 min-h-[100px]" placeholder="e.g. Spoke to John about the building fund." value={content} onChange={(e) => setContent(e.target.value)} required />
            </div>
          </TabsContent>
          <TabsContent value="email" className="mt-0 space-y-4">
            <div>
              <Label htmlFor="dp-email-subject">Subject</Label>
              <Input id="dp-email-subject" className="mt-1" placeholder="e.g. Thank you for your gift" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="dp-email-content">Content</Label>
              <Textarea id="dp-email-content" className="mt-1 min-h-[100px]" placeholder="Email body or summary..." value={content} onChange={(e) => setContent(e.target.value)} required />
            </div>
          </TabsContent>
          <TabsContent value="task" className="mt-0 space-y-4">
            <div>
              <Label htmlFor="dp-task-subject">Task</Label>
              <Input id="dp-task-subject" className="mt-1" placeholder="e.g. Send thank-you note" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="dp-task-content">Notes (optional)</Label>
              <Textarea id="dp-task-content" className="mt-1 min-h-[80px]" placeholder="Additional details..." value={content} onChange={(e) => setContent(e.target.value)} />
            </div>
          </TabsContent>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {activeTab === "email" ? (loading ? "Sending..." : "Send Email") : (loading ? "Saving..." : "Save")}
            </Button>
          </DialogFooter>
        </form>
      </Tabs>
    </DialogContent>
  )
}

/* ───────── Main Donor Profile Page ───────── */

export default function DonorProfilePage() {
  const params = useParams()
  const router = useRouter()
  const donorId = params.id as string

  const [donor, setDonor] = React.useState<DonorProfileDonor | null>(null)
  const [donations, setDonations] = React.useState<DonorProfileDonation[]>([])
  const [activity, setActivity] = React.useState<DonorNoteRow[]>([])
  const [interactions, setInteractions] = React.useState<Interaction[]>([])
  const [assignees, setAssignees] = React.useState<OrgAssignee[]>([])
  const [assigneeSaving, setAssigneeSaving] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [editOpen, setEditOpen] = React.useState(false)
  const [logActivityOpen, setLogActivityOpen] = React.useState(false)
  const [logActivityTab, setLogActivityTab] = React.useState<"call" | "email" | "task">("call")
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false)

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true)
      const [profile, notes, ints, orgAssignees] = await Promise.all([
        getDonorProfile(donorId),
        getDonorActivityNotes(donorId),
        getDonorInteractions(donorId),
        getOrgAssignees(),
      ])
      if (profile.donor) {
        setDonor(profile.donor)
        setDonations(profile.donations)
        setActivity(notes)
        setInteractions(ints)
        setAssignees(orgAssignees)
      } else {
        toast.error("Donor not found")
        router.push("/dashboard?view=donor-crm")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load donor")
    } finally {
      setLoading(false)
    }
  }, [donorId, router])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading donor profile...</p>
      </div>
    )
  }

  if (!donor) return null

  const handleAssigneeChange = async (userId: string | null) => {
    if (userId === donor.assigned_to) return
    try {
      setAssigneeSaving(true)
      await updateDonor(donor.id, { assigned_to: userId })
      setDonor({ ...donor, assigned_to: userId })
      const assigneeName = userId
        ? assignees.find((a) => a.user_id === userId)?.name ?? "user"
        : null
      toast.success(assigneeName ? `Assigned to ${assigneeName}` : "Unassigned")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update assignee")
    } finally {
      setAssigneeSaving(false)
    }
  }

  // Compute stats
  const now = new Date()
  const yearStartStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  const monthStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const toAmount = (d: DonorProfileDonation) => {
    if (d.amount == null) return 0
    const n = typeof d.amount === "number" ? d.amount : Number(d.amount)
    return Number.isFinite(n) ? n : 0
  }
  const lifetimeSum = donations.reduce((sum, d) => sum + toAmount(d), 0)
  const ytdSum = donations.filter((d) => d.date != null && d.date >= yearStartStr).reduce((sum, d) => sum + toAmount(d), 0)
  const thisMonthSum = donations.filter((d) => d.date != null && d.date >= monthStartStr).reduce((sum, d) => sum + toAmount(d), 0)
  const avgDonation = donations.length > 0 ? lifetimeSum / donations.length : 0
  const pendingTasks = interactions.filter((i) => i.type === "task" && i.status === "pending")

  // Address formatting
  const addressParts = [donor.billing_address, donor.city, donor.state, donor.zip].filter(Boolean)
  const fullAddress = addressParts.length > 0
    ? `${donor.billing_address || ""}${donor.city || donor.state ? (donor.billing_address ? ", " : "") + [donor.city, donor.state].filter(Boolean).join(", ") : ""}${donor.zip ? " " + donor.zip : ""}`
    : null
  const mailingParts = [donor.mailing_address, donor.mailing_city, donor.mailing_state, donor.mailing_zip].filter(Boolean)
  const fullMailingAddress = mailingParts.length > 0
    ? `${donor.mailing_address || ""}${donor.mailing_city || donor.mailing_state ? (donor.mailing_address ? ", " : "") + [donor.mailing_city, donor.mailing_state].filter(Boolean).join(", ") : ""}${donor.mailing_zip ? " " + donor.mailing_zip : ""}`
    : null

  return (
    <div className="flex flex-col gap-4 py-4 md:py-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => router.push("/dashboard?view=donor-crm")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{donor.display_name ?? "Donor"}</h1>
          <p className="text-sm text-muted-foreground">
            {donor.donor_type ? donor.donor_type.charAt(0).toUpperCase() + donor.donor_type.slice(1) : "Individual"}
            {donor.last_donation_date && ` \u00b7 Last gift ${formatDate(donor.last_donation_date)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-3.5 mr-1.5" />
            Edit Profile
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLogActivityTab("task")
              setLogActivityOpen(true)
            }}
          >
            <CheckSquare className="size-3.5 mr-1.5" />
            Add Task
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEmailDialogOpen(true)}
          >
            <Mail className="size-3.5 mr-1.5" />
            Send Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLogActivityTab("call")
              setLogActivityOpen(true)
            }}
          >
            <Phone className="size-3.5 mr-1.5" />
            Log Activity
          </Button>
        </div>
      </div>

      {/* Hero row: Contact + Giving Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 lg:px-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Contact Information</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                {donor.email ? (
                  <a href={`mailto:${donor.email}`} className="truncate text-sm text-primary hover:underline">
                    {donor.email}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">No email</span>
                )}
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                {donor.phone ? (
                  <a href={`tel:${donor.phone}`} className="text-sm text-primary hover:underline">
                    {donor.phone}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">No phone</span>
                )}
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="size-4 shrink-0 text-muted-foreground mt-0.5" strokeWidth={1.5} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-muted-foreground">
                    {fullAddress || "No address"}
                  </span>
                  {fullMailingAddress && fullMailingAddress !== fullAddress && (
                    <span className="text-xs text-muted-foreground/70">
                      Mailing: {fullMailingAddress}
                    </span>
                  )}
                </div>
              </li>
              <li className="flex items-center gap-2.5">
                <UserCircle2 className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <DonorAssigneeSelect
                    assignees={assignees}
                    value={donor.assigned_to}
                    disabled={assigneeSaving}
                    onChange={handleAssigneeChange}
                    triggerClassName="h-8 border-none shadow-none px-2 -mx-2 hover:bg-accent/50 focus:ring-0"
                  />
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Giving Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Lifetime</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(lifetimeSum)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">YTD</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(ytdSum)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(thisMonthSum)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg. Gift</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(avgDonation)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {donations.length} total gift{donations.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Balanced two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-4 lg:px-6">
        {/* Left column — health, pledges, tags */}
        <div className="space-y-4">
          <DonorHealthScoreCard donorId={donor.id} />
          <DonorPledgesCard donorId={donor.id} />
          <DonorTagsCard donorId={donor.id} />
        </div>

        {/* Right column — tasks, activity, giving history, AI insights */}
        <div className="space-y-4">
          {pendingTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pending Tasks ({pendingTasks.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {pendingTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-start gap-3 rounded-md border bg-card px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          await toggleTaskStatus(task.id)
                          const ints = await getDonorInteractions(donorId)
                          setInteractions(ints)
                          toast.success("Task completed")
                        }}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <Circle className="size-4" strokeWidth={1.5} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{task.subject || task.content || "Untitled task"}</p>
                        {task.content && task.subject && (
                          <p className="text-xs text-muted-foreground mt-0.5">{task.content}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{formatDateTime(task.date)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <Tabs defaultValue="timeline" className="w-full">
              <CardHeader className="pb-0">
                <TabsList>
                  <TabsTrigger value="timeline">Activity</TabsTrigger>
                  <TabsTrigger value="giving">Giving History</TabsTrigger>
                </TabsList>
              </CardHeader>

              <TabsContent value="timeline" className="mt-0">
                <CardContent className="pt-4 space-y-4">
                  <DonorNotesCard
                    donorId={donor.id}
                    initialNotes={donor.notes}
                    savedNotes={activity}
                  />

                  {interactions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Interactions</p>
                      <ul className="space-y-2">
                        {interactions.map((i) => (
                          <li
                            key={i.id}
                            className="flex gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                          >
                            <span className="mt-0.5">{interactionIcon(i.type)}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {i.type}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDateTime(i.date)}
                                </span>
                                {i.type === "task" && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await toggleTaskStatus(i.id)
                                      const ints = await getDonorInteractions(donorId)
                                      setInteractions(ints)
                                    }}
                                    className={cn(
                                      "text-xs hover:text-foreground",
                                      i.status === "completed" ? "text-emerald-600" : "text-muted-foreground"
                                    )}
                                  >
                                    {i.status === "completed" ? "Done" : "Mark done"}
                                  </button>
                                )}
                              </div>
                              {i.subject && (
                                <p className="font-medium text-foreground mt-0.5">{i.subject}</p>
                              )}
                              <p className="whitespace-pre-wrap text-muted-foreground mt-0.5">
                                {i.content || "—"}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {interactions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No interactions yet. Click &quot;Log Activity&quot; to get started.
                    </p>
                  )}
                </CardContent>
              </TabsContent>

              <TabsContent value="giving" className="mt-0">
                <CardContent className="pt-4 p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Memo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {donations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground text-center py-8 text-sm">
                            No donations recorded.
                          </TableCell>
                        </TableRow>
                      ) : (
                        donations.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium text-sm">{formatDate(d.date)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{formatCurrency(d.amount)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{d.payment_method || "—"}</TableCell>
                            <TableCell className="text-muted-foreground max-w-[300px] truncate text-sm">
                              {d.memo && !/^qb_sales_receipt_id:/i.test(d.memo) ? d.memo : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>

          <DonorInsightsPanel donorId={donor.id} />
        </div>
      </div>

      {/* Edit Contact Dialog */}
      <EditContactDialog
        donor={donor}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={loadData}
      />

      {/* Log Activity Dialog */}
      <Dialog open={logActivityOpen} onOpenChange={setLogActivityOpen}>
        <LogActivityDialog
          donorId={donorId}
          donorEmail={donor.email}
          defaultTab={logActivityTab}
          onLogged={async () => {
            setLogActivityOpen(false)
            const ints = await getDonorInteractions(donorId)
            setInteractions(ints)
          }}
        />
      </Dialog>

      {/* Send Email Dialog */}
      <EmailComposeDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        mode="single"
        recipient={{
          donorId,
          donorEmail: donor.email,
          donorName: donor.display_name,
        }}
        onSent={async () => {
          const ints = await getDonorInteractions(donorId)
          setInteractions(ints)
        }}
      />
    </div>
  )
}
