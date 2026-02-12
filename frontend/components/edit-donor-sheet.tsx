"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

interface Donor {
  id: number
  header: string
  type: string
  status: string
  target: string
  limit: string
  reviewer: string
  address?: string
  latestNote?: string
}

interface EditDonorSheetProps {
  donor: Donor | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditDonorSheet({ donor, open, onOpenChange }: EditDonorSheetProps) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [notes, setNotes] = React.useState("")

  React.useEffect(() => {
    if (donor) {
      setName(donor.header)
      setEmail(`${donor.header.toLowerCase().replace(/\s+/g, '.')}@email.com`)
      setAddress(donor.address || "")
      setNotes(donor.latestNote || "")
    }
  }, [donor])

  const handleSave = () => {
    toast.success("Saved changes", {
      description: `Updated donor profile for ${name}`,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Donor</SheetTitle>
          <SheetDescription>
            Update donor information and add notes
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="donor-name">Name</Label>
            <Input
              id="donor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter donor name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="donor-email">Email</Label>
            <Input
              id="donor-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="donor-address">Address</Label>
            <Input
              id="donor-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter address"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="donor-notes">Notes</Label>
            <Textarea
              id="donor-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this donor..."
              className="min-h-[120px]"
            />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent">
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800 text-white">
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
