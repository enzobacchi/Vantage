"use client"

import * as React from "react"
import { toast } from "sonner"

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
import { Textarea } from "@/components/ui/textarea"
import { generateYearEndLetter } from "@/app/donors/[id]/actions"

type LetterDialogProps = {
  donorId: string
  defaultYear: number
  trigger?: React.ReactNode
}

export function LetterDialog({
  donorId,
  defaultYear,
  trigger,
}: LetterDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [letter, setLetter] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const hasFetched = React.useRef(false)

  React.useEffect(() => {
    if (!open || !donorId) return
    if (hasFetched.current) return
    hasFetched.current = true
    setLoading(true)
    setError(null)
    setLetter("")
    generateYearEndLetter(donorId, defaultYear)
      .then((text) => {
        setLetter(text)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to generate letter.")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, donorId, defaultYear])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) hasFetched.current = false
  }

  const handleCopy = () => {
    if (!letter) return
    navigator.clipboard.writeText(letter).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy")
    )
  }

  const handleDownload = () => {
    if (!letter) return
    const blob = new Blob([letter], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `year-end-letter-${defaultYear}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Downloaded")
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" className="shrink-0">
            Generate Year-End Letter
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Year-End Letter ({defaultYear})</DialogTitle>
          <DialogDescription>
            Edit the letter below, then copy or download.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Generating…
            </p>
          ) : error ? (
            <p className="text-sm text-destructive py-4">{error}</p>
          ) : (
            <Textarea
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              placeholder="Letter will appear here…"
              className="min-h-[280px] resize-y font-sans text-sm"
            />
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={loading || !letter}
          >
            Copy to Clipboard
          </Button>
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={loading || !letter}
          >
            Download .txt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
