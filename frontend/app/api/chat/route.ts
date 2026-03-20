import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, stepCountIs, streamText } from "ai"

import { requireUserOrg } from "@/lib/auth"
import { buildSystemPrompt } from "@/lib/chat/system-prompt"
import { buildTools } from "@/lib/chat/tools"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const { messages } = await request.json()

  const result = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: buildSystemPrompt(auth.orgId),
    messages: await convertToModelMessages(messages),
    tools: buildTools(auth.orgId),
    maxRetries: 2,
    stopWhen: stepCountIs(8),
    onFinish: async ({ text }) => {
      try {
        const supabase = createAdminClient()

        // Persist the last user message
        const lastUserMsg = [...messages]
          .reverse()
          .find((m: { role: string }) => m.role === "user")
        if (lastUserMsg) {
          // Content may be a string or parts array from UI messages
          const content =
            typeof lastUserMsg.content === "string"
              ? lastUserMsg.content
              : lastUserMsg.parts
                  ?.filter((p: { type: string }) => p.type === "text")
                  .map((p: { text: string }) => p.text)
                  .join("") ?? ""
          if (content) {
            await supabase.from("chat_history").insert({
              org_id: auth.orgId,
              user_id: auth.userId,
              role: "user",
              content,
            })
          }
        }

        // Persist the assistant response
        if (text) {
          await supabase.from("chat_history").insert({
            org_id: auth.orgId,
            user_id: auth.userId,
            role: "assistant",
            content: text,
          })
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.error("[chat] Failed to persist history:", e)
        }
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
