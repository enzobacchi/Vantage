"use client"

import * as React from "react"
import QRCode from "qrcode"
import { Copy, Download, QrCode } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function SignupQRCard() {
  const [signupUrl, setSignupUrl] = React.useState<string>("")
  const [dataUrl, setDataUrl] = React.useState<string>("")

  React.useEffect(() => {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "")
    if (!origin) return
    const url = `${origin.replace(/\/$/, "")}/signup`
    setSignupUrl(url)
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#18181b", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""))
  }, [])

  const handleCopy = async () => {
    if (!signupUrl) return
    try {
      await navigator.clipboard.writeText(signupUrl)
      toast.success("Signup link copied")
    } catch {
      toast.error("Could not copy link")
    }
  }

  const handleDownload = () => {
    if (!dataUrl) return
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = "vantage-trial-signup-qr.png"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="size-4" strokeWidth={1.5} />
          Share the trial signup
        </CardTitle>
        <CardDescription>
          Share this QR code with prospective customers. Anyone who scans it can
          create a Vantage account and start a 30-day free trial with no credit
          card required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex size-40 shrink-0 items-center justify-center rounded-lg border bg-white p-2 dark:bg-zinc-50">
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrl}
                alt="Vantage trial signup QR code"
                className="h-full w-full"
              />
            ) : (
              <span className="text-xs text-muted-foreground">Generating…</span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Signup link
              </p>
              <p className="break-all text-sm font-mono text-foreground">
                {signupUrl || "—"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleCopy}
                disabled={!signupUrl}
              >
                <Copy className="size-3.5" strokeWidth={1.5} />
                Copy link
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleDownload}
                disabled={!dataUrl}
              >
                <Download className="size-3.5" strokeWidth={1.5} />
                Download QR
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
