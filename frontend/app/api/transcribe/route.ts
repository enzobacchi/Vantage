import { NextResponse } from "next/server"

import { requireUserOrg } from "@/lib/auth"
import { ChatPIIRedactor } from "@/lib/chat/pii-redactor"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 25 * 1024 * 1024 // OpenAI Whisper limit

export async function POST(request: Request) {
  if (process.env.TRANSCRIBE_ENABLED !== "true") {
    return NextResponse.json(
      {
        error:
          "Voice transcription is temporarily disabled. Type your message instead.",
      },
      { status: 503 },
    )
  }

  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(`transcribe:${auth.orgId}`, 20, 60_000)
  if (rl.limited) return rateLimitResponse(rl.retryAfterMs)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Transcription is not configured on the server." },
      { status: 503 },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an 'audio' field." },
      { status: 400 },
    )
  }

  const file = form.get("audio")
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing 'audio' file." },
      { status: 400 },
    )
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Audio file is empty." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Audio file exceeds 25 MB limit." },
      { status: 413 },
    )
  }

  const whisperForm = new FormData()
  const filename = (file as File).name || "recording.m4a"
  whisperForm.append("file", file, filename)
  whisperForm.append("model", "whisper-1")
  whisperForm.append("response_format", "json")

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: whisperForm,
  })

  if (!whisperRes.ok) {
    const detail = await whisperRes.text().catch(() => "")
    return NextResponse.json(
      {
        error: "Transcription failed.",
        detail: detail.slice(0, 500),
      },
      { status: 502 },
    )
  }

  const body = (await whisperRes.json()) as { text?: string }
  const rawText = body.text ?? ""

  // Redact PII before returning. Whisper itself sees the raw audio (unavoidable
  // without local transcription), but the transcript we hand back to any
  // downstream caller — chat, notes, interactions — must have names, emails,
  // and phone numbers replaced with placeholders.
  const redactor = new ChatPIIRedactor()
  const supabase = createAdminClient()
  const { data: donorIndex } = await supabase
    .from("donors")
    .select("display_name,email,phone")
    .eq("org_id", auth.orgId)
    .limit(5000)
  if (donorIndex) redactor.seedFromDonors(donorIndex)

  return NextResponse.json({ text: redactor.redactUserText(rawText) })
}
