"use client"

import * as React from "react"
import { Loader2, Mic, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { VoiceParseResponse } from "@/lib/donations/voice-schema"

const MAX_RECORDING_MS = 60_000

export type VoiceRecorderStatus = "idle" | "recording" | "transcribing" | "error"

type Props = {
  onParsed: (result: VoiceParseResponse) => void
  onError: (msg: string) => void
  disabled?: boolean
  onStatusChange?: (status: VoiceRecorderStatus) => void
}

function pickMimeType(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ]
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ""
}

function formatTimer(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function VoiceRecorder({ onParsed, onError, disabled, onStatusChange }: Props) {
  const [status, setStatus] = React.useState<VoiceRecorderStatus>("idle")
  const [elapsedMs, setElapsedMs] = React.useState(0)

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const startedAtRef = React.useRef<number>(0)
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateStatus = React.useCallback(
    (next: VoiceRecorderStatus) => {
      setStatus(next)
      onStatusChange?.(next)
    },
    [onStatusChange]
  )

  const cleanup = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  React.useEffect(() => () => cleanup(), [cleanup])

  const uploadAndParse = React.useCallback(
    async (blob: Blob, mimeType: string) => {
      updateStatus("transcribing")
      try {
        const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("mpeg") ? "mp3" : "webm"
        const file = new File([blob], `dictation.${ext}`, { type: mimeType || "audio/webm" })
        const form = new FormData()
        form.append("audio", file)

        const res = await fetch("/api/donations/voice-parse", {
          method: "POST",
          body: form,
        })
        const json = (await res.json().catch(() => ({}))) as
          | VoiceParseResponse
          | { error?: string; detail?: string }
        if (!res.ok) {
          const err = (json as { error?: string }).error ?? "Failed to parse dictation"
          throw new Error(err)
        }
        onParsed(json as VoiceParseResponse)
        updateStatus("idle")
        setElapsedMs(0)
      } catch (e) {
        updateStatus("error")
        onError(e instanceof Error ? e.message : "Failed to parse dictation")
      }
    },
    [onError, onParsed, updateStatus]
  )

  const start = React.useCallback(async () => {
    if (status !== "idle" && status !== "error") return
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("Microphone access is not supported in this browser.")
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission denied. Enable it in your browser settings."
          : "Could not access microphone."
      onError(msg)
      return
    }

    const mimeType = pickMimeType()
    let recorder: MediaRecorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch {
      for (const t of stream.getTracks()) t.stop()
      onError("Could not start recording in this browser.")
      return
    }

    chunksRef.current = []
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
    }
    recorder.onstop = () => {
      const finalMime = recorder.mimeType || mimeType || "audio/webm"
      const blob = new Blob(chunksRef.current, { type: finalMime })
      cleanup()
      if (blob.size === 0) {
        updateStatus("idle")
        setElapsedMs(0)
        return
      }
      void uploadAndParse(blob, finalMime)
    }

    streamRef.current = stream
    recorderRef.current = recorder
    startedAtRef.current = Date.now()

    recorder.start()
    updateStatus("recording")
    setElapsedMs(0)

    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, 200)

    autoStopRef.current = setTimeout(() => {
      // Auto-stop at the limit so the audio stays under Whisper's 25 MB cap.
      if (recorderRef.current?.state === "recording") {
        try {
          recorderRef.current.stop()
        } catch {
          /* swallow */
        }
      }
    }, MAX_RECORDING_MS)
  }, [cleanup, onError, status, updateStatus, uploadAndParse])

  const stop = React.useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      try {
        recorderRef.current.stop()
      } catch (e) {
        onError(e instanceof Error ? e.message : "Failed to stop recording")
      }
    }
  }, [onError])

  const isRecording = status === "recording"
  const isTranscribing = status === "transcribing"
  const remainingMs = Math.max(0, MAX_RECORDING_MS - elapsedMs)

  return (
    <div className="flex items-center gap-3">
      {!isRecording && !isTranscribing ? (
        <Button
          type="button"
          onClick={start}
          disabled={disabled}
          className="gap-2"
          size="lg"
        >
          <Mic className="size-5" strokeWidth={1.5} />
          Start dictation
        </Button>
      ) : isRecording ? (
        <Button
          type="button"
          onClick={stop}
          variant="destructive"
          className="gap-2"
          size="lg"
        >
          <Square className="size-4 fill-current" strokeWidth={1.5} />
          Stop ({formatTimer(elapsedMs)})
        </Button>
      ) : (
        <Button type="button" disabled className="gap-2" size="lg">
          <Loader2 className="size-5 animate-spin" strokeWidth={1.5} />
          Transcribing…
        </Button>
      )}

      {isRecording && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
          </span>
          Listening… auto-stops in {formatTimer(remainingMs)}
        </div>
      )}
      {isTranscribing && (
        <span className="text-sm text-muted-foreground">
          Transcribing and parsing donations…
        </span>
      )}
    </div>
  )
}
