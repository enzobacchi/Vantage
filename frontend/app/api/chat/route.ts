import { anthropic } from "@ai-sdk/anthropic"
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage as AiUIMessage,
} from "ai"

import { requireUserOrg } from "@/lib/auth"
import {
  ChatPIIRedactor,
  redactPIIPatterns,
} from "@/lib/chat/pii-redactor"
import { buildSystemPrompt } from "@/lib/chat/system-prompt"
import { buildTools } from "@/lib/chat/tools"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 60

type UITextPart = { type: "text"; text: string }
type UIMessage = {
  role: string
  content?: string
  parts?: Array<UITextPart | { type: string }>
}

/**
 * Extract plain text from a UI message (string `content` or text parts).
 */
function extractText(m: UIMessage): string {
  if (typeof m.content === "string") return m.content
  if (!Array.isArray(m.parts)) return ""
  return m.parts
    .filter((p): p is UITextPart => p.type === "text")
    .map((p) => p.text)
    .join("")
}

/**
 * Replace every text part of a UI message with the redacted version.
 * Mutates `m` in place.
 */
function replaceText(m: UIMessage, redacted: string): void {
  if (typeof m.content === "string") {
    m.content = redacted
    return
  }
  if (!Array.isArray(m.parts)) return
  let first = true
  m.parts = m.parts.map((p) => {
    if (p.type !== "text") return p
    if (first) {
      first = false
      return { ...(p as UITextPart), text: redacted }
    }
    // Collapse subsequent text parts — the redacted version already
    // represents the concatenation of all original text parts.
    return { ...(p as UITextPart), text: "" }
  })
}

export async function POST(request: Request) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  // Rate limit: 30 chat messages per org per minute
  const rl = checkRateLimit(`chat:${auth.orgId}`, 30, 60_000)
  if (rl.limited) return rateLimitResponse(rl.retryAfterMs)

  const { messages } = (await request.json()) as { messages: UIMessage[] }

  const supabase = createAdminClient()
  const redactor = new ChatPIIRedactor()

  // Seed the redactor from the org's donor index so user messages and tool
  // results share a consistent placeholder map, and so the outbound stream
  // transform can unredact any name the model types back verbatim.
  const { data: donorIndex } = await supabase
    .from("donors")
    .select("display_name,email,phone")
    .eq("org_id", auth.orgId)
    .limit(5000)
  if (donorIndex) redactor.seedFromDonors(donorIndex)

  // Redact the last user message *in place* before it reaches the LLM.
  let redactedLastUserText = ""
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue
    const raw = extractText(messages[i])
    redactedLastUserText = redactor.redactUserText(raw)
    replaceText(messages[i], redactedLastUserText)
    break
  }

  const result = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: buildSystemPrompt(auth.orgId),
    messages: await convertToModelMessages(messages as AiUIMessage[]),
    tools: buildTools(auth.orgId, auth.userId, redactor),
    maxOutputTokens: 16384,
    maxRetries: 2,
    stopWhen: stepCountIs(8),
    experimental_transform: redactor.createStreamTransform(),
    onFinish: async ({ text }) => {
      try {
        if (redactedLastUserText) {
          await supabase.from("chat_history").insert({
            org_id: auth.orgId,
            user_id: auth.userId,
            role: "user",
            content: redactedLastUserText,
          })
        }

        // Persist the assistant response. `text` is already unredacted by
        // the stream transform for the client, so re-apply pattern redaction
        // as a last-line defense against any stray email/phone that slipped
        // through (e.g. from an LLM-hallucinated value not in the map).
        if (text) {
          await supabase.from("chat_history").insert({
            org_id: auth.orgId,
            user_id: auth.userId,
            role: "assistant",
            content: redactPIIPatterns(text),
          })
        }
      } catch (e) {
        console.error("[chat] Failed to persist history:", e)
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
