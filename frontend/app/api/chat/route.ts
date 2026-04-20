import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, stepCountIs, streamText } from "ai"

import { requireUserOrg } from "@/lib/auth"
import { ChatPIIRedactor } from "@/lib/chat/pii-redactor"
import { buildSystemPrompt } from "@/lib/chat/system-prompt"
import { buildTools } from "@/lib/chat/tools"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 60

/** Redact common PII patterns (emails, phone numbers) from free-text before storage. */
function redactPIIPatterns(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[REDACTED_EMAIL]")
    .replace(
      /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      "[REDACTED_PHONE]"
    )
}

export async function POST(request: Request) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  // Rate limit: 30 chat messages per org per minute
  const rl = checkRateLimit(`chat:${auth.orgId}`, 30, 60_000)
  if (rl.limited) return rateLimitResponse(rl.retryAfterMs)

  const { messages } = await request.json()

  const redactor = new ChatPIIRedactor()

  const result = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: buildSystemPrompt(auth.orgId),
    messages: await convertToModelMessages(messages),
    tools: buildTools(auth.orgId, auth.userId, redactor),
    maxOutputTokens: 8192,
    maxRetries: 2,
    stopWhen: stepCountIs(8),
    experimental_transform: redactor.createStreamTransform(),
    onFinish: async ({ text }) => {
      try {
        const supabase = createAdminClient()

        // Persist the last user message (redact PII patterns before storage)
        const lastUserMsg = [...messages]
          .reverse()
          .find((m: { role: string }) => m.role === "user")
        if (lastUserMsg) {
          // Content may be a string or parts array from UI messages
          const rawContent =
            typeof lastUserMsg.content === "string"
              ? lastUserMsg.content
              : lastUserMsg.parts
                  ?.filter((p: { type: string }) => p.type === "text")
                  .map((p: { text: string }) => p.text)
                  .join("") ?? ""
          const content = redactPIIPatterns(rawContent)
          if (content) {
            await supabase.from("chat_history").insert({
              org_id: auth.orgId,
              user_id: auth.userId,
              role: "user",
              content,
            })
          }
        }

        // Persist the assistant response (redact PII patterns before storage)
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
